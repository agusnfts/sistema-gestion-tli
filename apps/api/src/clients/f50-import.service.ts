import { BadRequestException, Injectable } from '@nestjs/common';
import { formatCuit, type F50ImportResult, type F50ImportRow } from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { F50FormatError, parseF50Sheet, type F50Row } from './f50';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

type Existing = {
  id: string;
  cuit: string | null;
  f50Folio: string | null;
  legalName: string;
  address: string | null;
  notes: string | null;
  status: string;
  contacts: { name: string; email: string | null; role: string | null }[];
};

const nameKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Importa el F50 (Excel de respuestas del formulario de alta). Primero se previsualiza
 * (dryRun) y después se aplica con el mismo archivo. Es idempotente: cruza por CUIT, folio
 * o razón social, y en clientes existentes solo completa lo vacío y suma contactos nuevos.
 */
@Injectable()
export class F50ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async read(buffer: Buffer, sheetName?: string) {
    if (!buffer.subarray(0, 4).equals(ZIP_MAGIC)) {
      throw new BadRequestException('El archivo tiene que ser un Excel (.xlsx)');
    }
    let sheets: { sheet: string; data: unknown[][] }[];
    try {
      // La librería es solo ESM: se carga con import() dinámico.
      const { default: readXlsxFile } = await import('read-excel-file/node');
      sheets = (await readXlsxFile(buffer)) as typeof sheets;
    } catch {
      throw new BadRequestException('No se pudo leer el Excel. ¿Está dañado o protegido?');
    }
    const sheet = sheetName ? sheets.find((s) => s.sheet === sheetName) : sheets[0];
    if (!sheet) throw new BadRequestException(`No existe la hoja "${sheetName}"`);
    try {
      return {
        sheet: sheet.sheet,
        sheets: sheets.map((s) => s.sheet),
        rows: parseF50Sheet(sheet.data as Parameters<typeof parseF50Sheet>[0]),
      };
    } catch (e) {
      if (e instanceof F50FormatError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  async import(
    buffer: Buffer,
    opts: { sheet?: string; dryRun: boolean },
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<F50ImportResult> {
    const parsed = await this.read(buffer, opts.sheet);
    const existing: Existing[] = await this.prisma.client.findMany({
      select: {
        id: true,
        cuit: true,
        f50Folio: true,
        legalName: true,
        address: true,
        notes: true,
        status: true,
        contacts: { select: { name: true, email: true, role: true } },
      },
    });
    const byCuit = new Map(existing.filter((c) => c.cuit).map((c) => [c.cuit!, c]));
    const byFolio = new Map(existing.filter((c) => c.f50Folio).map((c) => [c.f50Folio!, c]));
    const byName = new Map(existing.map((c) => [nameKey(c.legalName), c]));
    // Dentro del mismo archivo: un CUIT o folio repetido se importa una sola vez.
    const seen = new Set<string>();

    const results: F50ImportRow[] = [];
    let contactsAdded = 0;
    for (const r of parsed.rows) {
      const warnings: string[] = [];
      if (r.invalidCuit) warnings.push(`CUIT inválido (${r.invalidCuit}): se importa sin CUIT`);
      const keys = [r.cuit && `c:${r.cuit}`, r.folio && `f:${r.folio}`].filter(Boolean) as string[];
      if (keys.some((k) => seen.has(k))) {
        results.push(this.rowResult(r, 'skip', null, 0, ['Repetido en el archivo']));
        continue;
      }
      keys.forEach((k) => seen.add(k));

      const match =
        (r.cuit && byCuit.get(r.cuit) && { c: byCuit.get(r.cuit)!, by: 'cuit' as const }) ||
        (r.folio && byFolio.get(r.folio) && { c: byFolio.get(r.folio)!, by: 'folio' as const }) ||
        (byName.get(nameKey(r.legalName)) && {
          c: byName.get(nameKey(r.legalName))!,
          by: 'name' as const,
        }) ||
        null;

      if (match?.c.cuit && r.cuit && match.c.cuit !== r.cuit) {
        warnings.push(
          `Coincide por ${match.by === 'folio' ? 'folio' : 'razón social'} pero el CUIT es distinto (${formatCuit(match.c.cuit)}): no se toca`,
        );
        results.push(this.rowResult(r, 'skip', match.by, 0, warnings));
        continue;
      }
      // El folio es único: si ya lo tiene otro cliente, no se asigna.
      const folioOwner = r.folio ? byFolio.get(r.folio) : undefined;
      const folio = folioOwner && folioOwner.id !== match?.c.id ? null : r.folio;
      if (r.folio && !folio) warnings.push(`El folio ${r.folio} ya está en otro cliente`);

      const known = new Set(
        (match?.c.contacts ?? []).flatMap((k) => [
          k.email ?? '',
          `${nameKey(k.name)}|${k.role ?? ''}`,
        ]),
      );
      const newContacts = r.contacts.filter(
        (k) => !(k.email && known.has(k.email)) && !known.has(`${nameKey(k.name)}|${k.role}`),
      );

      if (!match) {
        results.push(this.rowResult(r, 'create', null, newContacts.length, warnings));
        if (!opts.dryRun) {
          const created = await this.prisma.client.create({
            data: {
              legalName: r.legalName,
              cuit: r.cuit,
              f50Folio: folio,
              status: r.inactive ? 'INACTIVE' : 'ACTIVE',
              address: r.address,
              notes: r.notes,
              contacts: { create: newContacts.map((k) => ({ ...k, kind: 'OTHER' as const })) },
            },
          });
          if (r.cuit) byCuit.set(r.cuit, { ...created, contacts: [] });
          if (folio) byFolio.set(folio, { ...created, contacts: [] });
        }
      } else {
        const c = match.c;
        const data = {
          cuit: c.cuit ?? r.cuit ?? undefined,
          f50Folio: c.f50Folio ?? folio ?? undefined,
          address: c.address ?? r.address ?? undefined,
          notes: c.notes ?? r.notes ?? undefined,
          // Una baja en el F50 se respeta; no se reactiva a nadie desde la importación.
          status: r.inactive ? ('INACTIVE' as const) : undefined,
        };
        const changes =
          newContacts.length +
          Number(!c.cuit && !!r.cuit) +
          Number(!c.f50Folio && !!folio) +
          Number(!c.address && !!r.address) +
          Number(!c.notes && !!r.notes) +
          Number(r.inactive && c.status !== 'INACTIVE');
        results.push(
          this.rowResult(r, changes ? 'update' : 'skip', match.by, newContacts.length, [
            ...warnings,
            ...(changes ? [] : ['Ya estaba importado; no hay nada nuevo']),
          ]),
        );
        if (!opts.dryRun && changes) {
          await this.prisma.client.update({
            where: { id: c.id },
            data: {
              ...data,
              contacts: { create: newContacts.map((k) => ({ ...k, kind: 'OTHER' as const })) },
            },
          });
        }
      }
      contactsAdded += results.at(-1)!.action === 'skip' ? 0 : newContacts.length;
    }

    const count = (a: F50ImportRow['action']) => results.filter((x) => x.action === a).length;
    const totals = {
      create: count('create'),
      update: count('update'),
      skip: count('skip'),
      contacts: contactsAdded,
    };
    if (!opts.dryRun) {
      await this.audit.log({
        action: 'client.imported',
        actorId: actor.user.id,
        entityType: 'client',
        ip: meta.ip,
        metadata: { source: 'F50', sheet: parsed.sheet, ...totals },
      });
    }
    return {
      dryRun: opts.dryRun,
      sheet: parsed.sheet,
      sheets: parsed.sheets,
      rows: results,
      totals,
    };
  }

  private rowResult(
    r: F50Row,
    action: F50ImportRow['action'],
    matchedBy: F50ImportRow['matchedBy'],
    newContacts: number,
    warnings: string[],
  ): F50ImportRow {
    return {
      row: r.row,
      folio: r.folio,
      legalName: r.legalName,
      cuit: r.cuit,
      action,
      matchedBy,
      inactive: r.inactive,
      newContacts,
      warnings,
    };
  }
}
