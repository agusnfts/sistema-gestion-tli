import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@tli/db';
import {
  formatArticleCode,
  formatProblemCode,
  formatTicketNumber,
  type ArticleDetail,
  type ArticleListItem,
  type ArticleStatus,
  type CreateArticleParsed,
  type ListArticlesQuery,
  type Paginated,
  type SaveArticleParsed,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { sanitizeRichText } from '../common/rich-text';
import { IndexingService } from './indexing.service';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const userRef = { select: { id: true, fullName: true } } as const;
const listInclude = {
  author: userRef,
  currentVersion: { select: { title: true, version: true } },
} satisfies Prisma.ArticleInclude;
type ArticleRow = Prisma.ArticleGetPayload<{ include: typeof listInclude }>;

/**
 * Qué artículos ve cada uno: los usuarios, los publicados y públicos; quien ve lo interno,
 * todo lo publicado; quien gestiona la base, también borradores y archivados.
 */
export function articleVisibilityWhere(actor: AuthContext): Prisma.ArticleWhereInput {
  const p = actor.permissions;
  if (p.has('kb.manage')) return {};
  if (p.has('kb.read.internal')) return { status: 'PUBLISHED' };
  if (p.has('kb.read.public')) return { status: 'PUBLISHED', visibility: 'PUBLIC' };
  return { id: { in: [] } };
}

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly indexing: IndexingService,
  ) {}

  private toListItem(a: ArticleRow): ArticleListItem {
    return {
      id: a.id,
      code: formatArticleCode(a.number),
      title: a.currentVersion?.title ?? '(sin título)',
      category: a.category,
      template: a.template,
      visibility: a.visibility,
      status: a.status,
      tags: a.tags,
      author: a.author,
      version: a.currentVersion?.version ?? 0,
      updatedAt: a.updatedAt.toISOString(),
      publishedAt: a.publishedAt?.toISOString() ?? null,
    };
  }

  async list(q: ListArticlesQuery, actor: AuthContext): Promise<Paginated<ArticleListItem>> {
    const where: Prisma.ArticleWhereInput = {
      AND: [
        articleVisibilityWhere(actor),
        {
          category: q.category,
          status: q.status,
          tags: q.tag ? { has: q.tag } : undefined,
        },
      ],
    };
    if (q.q) {
      const n = /^(?:kb-?)?0*(\d{1,9})$/i.exec(q.q.trim());
      (where.AND as Prisma.ArticleWhereInput[]).push({
        OR: [
          { currentVersion: { title: { contains: q.q, mode: 'insensitive' } } },
          { tags: { has: q.q.toLowerCase() } },
          ...(n ? [{ number: Number(n[1]) }] : []),
        ],
      });
    }
    const [total, rows] = await Promise.all([
      this.prisma.article.count({ where }),
      this.prisma.article.findMany({
        where,
        include: listInclude,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => this.toListItem(r)),
    };
  }

  async get(id: string, actor: AuthContext, versionId?: string): Promise<ArticleDetail> {
    const a = await this.prisma.article.findFirst({
      where: { AND: [{ id }, articleVisibilityWhere(actor)] },
      include: {
        ...listInclude,
        versions: { include: { author: userRef }, orderBy: { version: 'desc' } },
        sourceTicket: { select: { id: true, number: true } },
        sourceProblem: { select: { id: true, number: true } },
      },
    });
    if (!a) throw new NotFoundException('Artículo inexistente');
    const canManage = actor.permissions.has('kb.manage');
    // Las versiones anteriores solo las ve quien gestiona la base.
    const v =
      (versionId && canManage && a.versions.find((x) => x.id === versionId)) ||
      a.versions.find((x) => x.id === a.currentVersionId) ||
      a.versions[0];
    if (!v) throw new NotFoundException('Artículo sin contenido');
    const internalRefs = actor.permissions.has('ticket.read.all');
    return {
      ...this.toListItem(a),
      current: {
        id: v.id,
        version: v.version,
        title: v.title,
        body: v.body,
        errorSymptom: v.errorSymptom,
        errorCause: v.errorCause,
        errorSolution: v.errorSolution,
        errorSteps: v.errorSteps,
        author: v.author,
        createdAt: v.createdAt.toISOString(),
      },
      history: canManage
        ? a.versions.map((x) => ({
            id: x.id,
            version: x.version,
            title: x.title,
            author: x.author,
            createdAt: x.createdAt.toISOString(),
          }))
        : [],
      source: {
        ticket:
          internalRefs && a.sourceTicket
            ? { id: a.sourceTicket.id, number: formatTicketNumber(a.sourceTicket.number) }
            : null,
        problem:
          actor.permissions.has('problem.read') && a.sourceProblem
            ? { id: a.sourceProblem.id, code: formatProblemCode(a.sourceProblem.number) }
            : null,
      },
      canEdit: canManage,
    };
  }

  private content(input: SaveArticleParsed) {
    return {
      title: input.title,
      body: sanitizeRichText(input.body),
      errorSymptom: input.errorSymptom ?? null,
      errorCause: input.errorCause ?? null,
      errorSolution: input.errorSolution ?? null,
      errorSteps: input.errorSteps ?? null,
    };
  }

  /** Publicar o cambiar a público requiere kb.publish. */
  private assertCanPublish(actor: AuthContext) {
    if (!actor.permissions.has('kb.publish')) {
      throw new ForbiddenException('No podés publicar ni cambiar la visibilidad');
    }
  }

  async create(
    input: CreateArticleParsed,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ArticleDetail> {
    if (input.visibility === 'PUBLIC') this.assertCanPublish(actor);
    if (input.sourceTicketId) {
      const t = await this.prisma.ticket.count({ where: { id: input.sourceTicketId } });
      if (!t) throw new BadRequestException('El ticket de origen no existe');
    }
    if (input.sourceProblemId) {
      const p = await this.prisma.problem.count({ where: { id: input.sourceProblemId } });
      if (!p) throw new BadRequestException('El problema de origen no existe');
    }
    const article = await this.prisma.$transaction(async (tx) => {
      const a = await tx.article.create({
        data: {
          category: input.category,
          template: input.template,
          visibility: input.visibility,
          tags: input.tags,
          sourceTicketId: input.sourceTicketId ?? null,
          sourceProblemId: input.sourceProblemId ?? null,
          authorId: actor.user.id,
        },
      });
      const v = await tx.articleVersion.create({
        data: { articleId: a.id, version: 1, authorId: actor.user.id, ...this.content(input) },
      });
      await tx.article.update({ where: { id: a.id }, data: { currentVersionId: v.id } });
      await this.audit.log(
        {
          action: 'article.created',
          actorId: actor.user.id,
          entityType: 'article',
          entityId: a.id,
          ip: meta.ip,
          metadata: {
            number: a.number,
            sourceTicketId: input.sourceTicketId,
            sourceProblemId: input.sourceProblemId,
          },
        },
        tx,
      );
      return a;
    });
    await this.indexing.indexArticle(article.id);
    return this.get(article.id, actor);
  }

  /** Cada guardado es una versión nueva y queda como vigente. */
  async save(
    id: string,
    input: SaveArticleParsed,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ArticleDetail> {
    const a = await this.prisma.article.findUnique({
      where: { id },
      include: { versions: { select: { version: true }, orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!a) throw new NotFoundException('Artículo inexistente');
    if (input.visibility && input.visibility !== a.visibility) this.assertCanPublish(actor);
    const next = (a.versions[0]?.version ?? 0) + 1;
    await this.prisma.$transaction(async (tx) => {
      const v = await tx.articleVersion.create({
        data: { articleId: id, version: next, authorId: actor.user.id, ...this.content(input) },
      });
      await tx.article.update({
        where: { id },
        data: {
          currentVersionId: v.id,
          category: input.category,
          visibility: input.visibility,
          tags: input.tags,
        },
      });
      await this.audit.log(
        {
          action: 'article.version.saved',
          actorId: actor.user.id,
          entityType: 'article',
          entityId: id,
          ip: meta.ip,
          metadata: { version: next },
        },
        tx,
      );
    });
    await this.indexing.indexArticle(id);
    return this.get(id, actor);
  }

  async setStatus(
    id: string,
    status: ArticleStatus,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ArticleDetail> {
    this.assertCanPublish(actor);
    const a = await this.prisma.article.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Artículo inexistente');
    if (a.status === status) return this.get(id, actor);
    await this.prisma.article.update({
      where: { id },
      data: {
        status,
        publishedAt: status === 'PUBLISHED' ? (a.publishedAt ?? new Date()) : a.publishedAt,
      },
    });
    await this.audit.log({
      action: 'article.status.changed',
      actorId: actor.user.id,
      entityType: 'article',
      entityId: id,
      ip: meta.ip,
      metadata: { from: a.status, to: status },
    });
    return this.get(id, actor);
  }

  /** Vuelve a dejar vigente una versión anterior (como una versión nueva, sin perder historia). */
  async restore(
    id: string,
    versionId: string,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<ArticleDetail> {
    const v = await this.prisma.articleVersion.findFirst({
      where: { id: versionId, articleId: id },
    });
    if (!v) throw new NotFoundException('Versión inexistente');
    return this.save(
      id,
      {
        title: v.title,
        body: v.body,
        errorSymptom: v.errorSymptom,
        errorCause: v.errorCause,
        errorSolution: v.errorSolution,
        errorSteps: v.errorSteps,
      },
      actor,
      meta,
    );
  }
}
