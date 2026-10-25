import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  articleStatusSchema,
  createArticleSchema,
  knowledgeSearchQuerySchema,
  libraryDocumentSchema,
  listArticlesQuerySchema,
  listLibraryQuerySchema,
  saveArticleSchema,
  updateLibraryDocumentSchema,
  uuidSchema,
  type ArticleStatus,
  type CreateArticleParsed,
  type KnowledgeSearchQuery,
  type LibraryDocumentParsed,
  type ListArticlesQuery,
  type ListLibraryQuery,
  type SaveArticleParsed,
  type UpdateLibraryDocumentInput,
} from '@tli/shared';
import { ArticlesService } from './articles.service';
import { LibraryService } from './library.service';
import { SearchService } from './search.service';
import {
  CurrentAuth,
  ReqMeta,
  RequireAnyPermission,
  RequirePermission,
} from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const versionQuerySchema = z.object({ version: uuidSchema.optional() });

/** Lectura: cualquiera que vea la base (pública o interna). El servicio filtra qué ve cada uno. */
const READ = ['kb.read.public', 'kb.read.internal'] as const;

@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly articles: ArticlesService,
    private readonly library: LibraryService,
    private readonly searchService: SearchService,
  ) {}

  @Get('search')
  @RequireAnyPermission(...READ, 'integration.read', 'client.read')
  search(
    @Query(new ZodPipe(knowledgeSearchQuerySchema)) query: KnowledgeSearchQuery,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.searchService.search(query.q, query.limit, auth);
  }

  @Get('articles')
  @RequireAnyPermission(...READ)
  listArticles(
    @Query(new ZodPipe(listArticlesQuerySchema)) query: ListArticlesQuery,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.articles.list(query, auth);
  }

  @Post('articles')
  @RequirePermission('kb.manage')
  createArticle(
    @Body(new ZodPipe(createArticleSchema)) body: CreateArticleParsed,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.articles.create(body, auth, meta);
  }

  @Get('articles/:id')
  @RequireAnyPermission(...READ)
  getArticle(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(versionQuerySchema)) query: { version?: string },
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.articles.get(id, auth, query.version);
  }

  @Post('articles/:id/versions')
  @HttpCode(200)
  @RequirePermission('kb.manage')
  saveArticle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(saveArticleSchema)) body: SaveArticleParsed,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.articles.save(id, body, auth, meta);
  }

  @Post('articles/:id/versions/:versionId/restore')
  @HttpCode(200)
  @RequirePermission('kb.manage')
  restoreArticle(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.articles.restore(id, versionId, auth, meta);
  }

  @Post('articles/:id/status')
  @HttpCode(200)
  @RequirePermission('kb.publish')
  setArticleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(articleStatusSchema)) body: { status: ArticleStatus },
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.articles.setStatus(id, body.status, auth, meta);
  }

  @Get('documents')
  @RequireAnyPermission(...READ)
  listDocuments(
    @Query(new ZodPipe(listLibraryQuerySchema)) query: ListLibraryQuery,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.library.list(query, auth);
  }

  @Post('documents')
  @RequirePermission('kb.manage')
  createDocument(
    @Body(new ZodPipe(libraryDocumentSchema)) body: LibraryDocumentParsed,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.library.create(body, auth, meta);
  }

  @Get('documents/:id')
  @RequireAnyPermission(...READ, 'integration.read', 'client.read')
  getDocument(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.library.get(id, auth);
  }

  @Patch('documents/:id')
  @RequirePermission('kb.manage')
  updateDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateLibraryDocumentSchema)) body: UpdateLibraryDocumentInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.library.update(id, body, auth, meta);
  }

  @Post('documents/:id/reindex')
  @HttpCode(200)
  @RequirePermission('kb.manage')
  reindex(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.library.reindex(id, auth);
  }
}
