import { normalizeCuit } from '@tli/shared';

// Lectura del F50 (respuestas del formulario de Google de alta de clientes). Las columnas se
// buscan por encabezado, no por posición: el formulario cambió de versión y las hojas no
// tienen el mismo orden.

export type F50Contact = { role: string; name: string; email: string | null; phone: string | null };

export type F50Row = {
  row: number;
  folio: string | null;
  legalName: string;
  cuit: string | null;
  /** CUIT tal como vino, si no pasó la validación (para avisar). */
  invalidCuit: string | null;
  inactive: boolean;
  address: string | null;
  notes: string | null;
  contacts: F50Contact[];
};

type Cell = string | number | boolean | Date | null | undefined;

/** Encabezado comparable: sin acentos, minúsculas y espacios simples. */
export function normalizeHeader(h: Cell): string {
  return String(h ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const text = (v: Cell): string | null => {
  if (v === null || v === undefined) return null;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
  return s || null;
};

/** El CUIT llega como texto con guiones o como número (a veces con ".0"). */
export function cuitFrom(v: Cell): { cuit: string | null; invalid: string | null } {
  const raw = typeof v === 'number' ? String(Math.round(v)) : text(v);
  if (!raw) return { cuit: null, invalid: null };
  const cuit = normalizeCuit(raw.replace(/\.0+$/, ''));
  return cuit ? { cuit, invalid: null } : { cuit: null, invalid: raw };
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Teléfonos: al menos 8 dígitos, con espacios, guiones, paréntesis o "+" en el medio.
const PHONE = /\+?\(?\d[\d\s\-()]{6,}\d/g;

function cleanName(s: string): string {
  return s
    .replace(
      /(nombre y apellido|n[uú]m(ero)?|tel(efono|éfono)?|cel(ular)?|mail|e-mail|correo)\s*:?/gi,
      ' ',
    )
    .replace(/[-–/|,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Una celda de contacto trae nombre, número y mail en texto libre, a veces de varias
 * personas. Se separa una persona por cada mail; sin mail, la celda entera es una persona.
 */
export function parseContactCell(role: string, value: Cell): F50Contact[] {
  const raw = text(value);
  if (!raw) return [];
  const emails = [...raw.matchAll(EMAIL)];
  const chunks: string[] = [];
  if (emails.length <= 1) {
    chunks.push(raw);
  } else {
    // Cada persona termina en su mail o en el número que lo sigue.
    let start = 0;
    emails.forEach((m, i) => {
      const end = m.index! + m[0].length;
      const nextStart = emails[i + 1]?.index ?? raw.length;
      // Si después del mail viene un teléfono antes del próximo nombre, va con esta persona.
      const tail = raw.slice(end, nextStart);
      const phoneAfter = /^\s*[\s\-/|,]*\+?\(?\d[\d\s\-()]{6,}\d/.exec(tail);
      const cut = phoneAfter ? end + phoneAfter[0].length : end;
      chunks.push(raw.slice(start, cut));
      start = cut;
    });
  }
  const out: F50Contact[] = [];
  for (const chunk of chunks) {
    const email = chunk.match(EMAIL)?.[0]?.toLowerCase() ?? null;
    const phone =
      chunk
        .replace(EMAIL, ' ')
        .match(PHONE)
        ?.map((p) => p.replace(/\s+/g, ' ').trim())
        .find((p) => p.replace(/\D/g, '').length >= 8) ?? null;
    let name = cleanName(chunk.replace(EMAIL, ' ').replace(PHONE, ' '));
    if (name.length < 2) name = email ? email.split('@')[0]! : '';
    // "-", "no", "n/a" y similares no son contactos.
    if (
      !email &&
      !phone &&
      (name.length < 3 ||
        /^(n\/?a|no|sin|ninguno|-|[ií]dem|(el |la )?mism[oa]s?|igual)$/i.test(name))
    )
      continue;
    if (!name) continue;
    out.push({ role, name: name.slice(0, 150), email, phone: phone?.slice(0, 50) ?? null });
  }
  return out;
}

/** Columnas de contacto: el encabezado empieza con el área ("Operaciones:", "Tráfico:"…). */
const CONTACT_ROLES: [prefix: string, role: string][] = [
  ['operaciones', 'Operaciones'],
  ['administracion', 'Administración'],
  ['facturacion', 'Facturación'],
  ['garantia de calidad', 'Garantía de calidad'],
  ['direccion tecnica', 'Dirección técnica'],
  ['trafico', 'Tráfico'],
  ['recepcion', 'Recepción'],
  ['pago a proveedores', 'Pago a proveedores'],
];

export class F50FormatError extends Error {}

export function parseF50Sheet(rows: Cell[][]): F50Row[] {
  const header = (rows[0] ?? []).map(normalizeHeader);
  const col = (...prefixes: string[]) =>
    header.findIndex((h) => prefixes.some((p) => h.startsWith(p)));
  const idx = {
    legalName: col('razon social'),
    cuit: col('cuit'),
    folio: col('folio'),
    inactive: col('esta de baja'),
    address: col('domicilio'),
    locality: col('localidad'),
    zip: header.findIndex((h) => h === 'cp' || h.startsWith('codigo postal')),
    province: col('provincia'),
    activity: col('actividad'),
    transport: col('tipo transporte', 'tipo de transporte'),
    crossdocking: col('crossdocking'),
    distribution: col('distribucion'),
    document: col('documento alta cliente'),
  };
  if (idx.legalName < 0) {
    throw new F50FormatError('La hoja no tiene la columna "RAZÓN SOCIAL": ¿es el F50?');
  }
  const contactCols = CONTACT_ROLES.map(([prefix, role]) => ({ i: col(prefix), role })).filter(
    (c) => c.i >= 0,
  );
  const at = (r: Cell[], i: number) => (i >= 0 ? r[i] : null);

  const out: F50Row[] = [];
  rows.slice(1).forEach((r, n) => {
    const legalName = text(at(r, idx.legalName));
    if (!legalName) return;
    const { cuit, invalid } = cuitFrom(at(r, idx.cuit));
    const zip = at(r, idx.zip);
    const place = [
      text(at(r, idx.locality)),
      typeof zip === 'number' ? `CP ${Math.round(zip)}` : text(zip) && `CP ${text(zip)}`,
      text(at(r, idx.province)),
    ]
      .filter(Boolean)
      .join(', ');
    const address = [text(at(r, idx.address)), place].filter(Boolean).join(' · ') || null;
    const notes = [
      ['Actividad', text(at(r, idx.activity))],
      ['Transporte', text(at(r, idx.transport))],
      ['Crossdocking', text(at(r, idx.crossdocking))],
      ['Distribución', text(at(r, idx.distribution))],
      ['Documento de alta (F50)', text(at(r, idx.document))],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    out.push({
      row: n + 2,
      folio: text(at(r, idx.folio)),
      legalName: legalName.replace(/\s+/g, ' ').slice(0, 200),
      cuit,
      invalidCuit: invalid,
      inactive:
        at(r, idx.inactive) === true || /^(si|sí|true|x)$/i.test(text(at(r, idx.inactive)) ?? ''),
      address: address?.slice(0, 300) ?? null,
      notes: notes ? `Del F50:\n${notes}`.slice(0, 5000) : null,
      contacts: contactCols.flatMap((c) => parseContactCell(c.role, at(r, c.i))),
    });
  });
  return out;
}
