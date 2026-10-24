// Seed de desarrollo: seed base + áreas de ejemplo + un usuario por rol.
// Nunca correr en producción.
import { PrismaClient } from '@prisma/client';
import { SYSTEM_ROLE_KEYS } from '@tli/shared';
import { seedBase } from './base';
import { hashPassword } from '../password';

// Credenciales solo para desarrollo local. Admin e IT configuran MFA en el primer login
// (el secreto se muestra en pantalla; `pnpm totp <secreto>` imprime el código).
export const DEV_PASSWORD = 'tli-dev-local-2026';
export const DEV_USERS = [
  { email: 'admin@tli.local', fullName: 'Admin Desarrollo', role: SYSTEM_ROLE_KEYS.ADMIN },
  { email: 'it@tli.local', fullName: 'IT Desarrollo', role: SYSTEM_ROLE_KEYS.IT },
  { email: 'usuario@tli.local', fullName: 'Usuario Desarrollo', role: SYSTEM_ROLE_KEYS.USER },
] as const;

const DEV_AREAS = ['Operaciones', 'Administración', 'Comercial', 'Calidad', 'Transporte'];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('El seed de desarrollo no se puede correr en producción.');
  }
  const prisma = new PrismaClient();
  try {
    await seedBase(prisma);
    for (const name of DEV_AREAS) {
      await prisma.area.upsert({ where: { name }, create: { name }, update: {} });
    }
    const passwordHash = await hashPassword(DEV_PASSWORD);
    const garin = await prisma.warehouse.findUnique({ where: { name: 'Garín' } });
    for (const u of DEV_USERS) {
      const role = await prisma.role.findUniqueOrThrow({ where: { key: u.role } });
      const existing = await prisma.user.findUnique({ where: { email: u.email } });
      if (existing) continue;
      await prisma.user.create({
        data: {
          email: u.email,
          fullName: u.fullName,
          passwordHash,
          mustChangePassword: false,
          defaultWarehouseId: garin?.id,
          roles: { create: { roleId: role.id } },
        },
      });
    }
    console.log(
      'Seed de desarrollo aplicado. Usuarios: ' + DEV_USERS.map((u) => u.email).join(', '),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
