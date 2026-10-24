// Crea el primer Admin en un entorno nuevo e imprime una contraseña temporal.
// Uso: pnpm --filter @tli/db create-admin -- --email persona@empresa.com --name "Nombre Apellido"
import { PrismaClient } from '@prisma/client';
import { SYSTEM_ROLE_KEYS, emailSchema } from '@tli/shared';
import { generateTemporaryPassword, hashPassword } from '../password';
import { seedBase } from './base';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const email = emailSchema.parse(arg('email'));
  const fullName = arg('name')?.trim();
  if (!fullName) throw new Error('Falta --name "Nombre Apellido"');

  const prisma = new PrismaClient();
  try {
    await seedBase(prisma);
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new Error(`Ya existe un usuario con email ${email}`);
    }
    const role = await prisma.role.findUniqueOrThrow({ where: { key: SYSTEM_ROLE_KEYS.ADMIN } });
    const temporaryPassword = generateTemporaryPassword();
    await prisma.user.create({
      data: {
        email,
        fullName,
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        roles: { create: { roleId: role.id } },
      },
    });
    console.log(`Admin creado: ${email}`);
    console.log(`Contraseña temporal (se pide cambiarla al ingresar): ${temporaryPassword}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
