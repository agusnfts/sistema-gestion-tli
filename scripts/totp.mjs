// Imprime el código TOTP actual para un secreto base32. Solo para desarrollo.
// Uso: pnpm totp <SECRETO>
import { authenticator } from 'otplib';

const secret = process.argv[2];
if (!secret) {
  console.error('Uso: pnpm totp <SECRETO_BASE32>');
  process.exit(1);
}
console.log(authenticator.generate(secret));
