// Recupera el acceso de un usuario que perdió la app de autenticación y los códigos de
// recuperación: resetea MFA, imprime una contraseña temporal, desbloquea y cierra sesiones.
// Uso (en el servidor): pnpm --filter @tli/db recover-access -- --email persona@empresa.com
import { PrismaClient } from '@prisma/client';
import { emailSchema } from '@tli/shared';
import { recoverAccess } from '../recover-access';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const email = emailSchema.parse(arg('email'));
  const prisma = new PrismaClient();
  try {
    const { temporaryPassword } = await recoverAccess(prisma, email);
    console.log(`Acceso recuperado: ${email}`);
    console.log(`Contraseña temporal (se pide cambiarla al ingresar): ${temporaryPassword}`);
    console.log('Al ingresar va a tener que configurar MFA de nuevo.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
