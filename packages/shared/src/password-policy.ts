/**
 * Política de contraseñas alineada a NIST SP 800-63B / OWASP ASVS 2.1:
 * longitud mínima 12, máxima 128, sin reglas de composición forzadas,
 * bloqueo de contraseñas comunes y de contraseñas derivadas de datos del usuario.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

// Lista corta de contraseñas comunes y patrones locales. Se compara en minúsculas.
const COMMON_PASSWORDS = new Set([
  '123456789012',
  '1234567890123',
  'qwertyuiopas',
  'qwerty123456',
  'password1234',
  'password12345',
  'contraseña123',
  'contrasena123',
  'contraseña1234',
  'contrasena1234',
  'administrador',
  'admin1234567',
  'adminadmin12',
  'iloveyou1234',
  'aaaaaaaaaaaa',
  '111111111111',
  '000000000000',
  'abcdefghijkl',
  'abc123456789',
  'bienvenido123',
  'bienvenido1234',
  'argentina123',
  'argentina1234',
  'tmllogistica',
  'tmllogistica1',
  'tmllogistica123',
  'logistica123',
  'logistica1234',
  'sistematli123',
  'cambiar12345',
  'cambiame1234',
]);

export type PasswordContext = { email?: string; fullName?: string };

export function checkPassword(password: string, ctx: PasswordContext = {}): string[] {
  const errors: string[] = [];
  const chars = [...password];
  if (chars.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Tiene que tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  }
  if (chars.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Puede tener como máximo ${PASSWORD_MAX_LENGTH} caracteres.`);
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    errors.push('Es una contraseña demasiado común.');
  }
  if (new Set(chars).size <= 3) {
    errors.push('Tiene demasiados caracteres repetidos.');
  }
  const localPart = ctx.email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
    errors.push('No puede contener tu usuario de email.');
  }
  const nameParts = (ctx.fullName ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length >= 4);
  if (nameParts.some((p) => lower.includes(p))) {
    errors.push('No puede contener tu nombre o apellido.');
  }
  return errors;
}
