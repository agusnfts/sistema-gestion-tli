// Seed base, idempotente. Corre en todos los entornos (incluida producción):
// permisos, roles de sistema y catálogos iniciales.
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, SYSTEM_ROLES, type PermissionKey } from '@tli/shared';

const INITIAL_WAREHOUSES = ['Garín', 'Pacheco'];
const INITIAL_PROVIDERS = ['Interno', 'Molipa', 'SGL', 'TYT'];

export async function seedBase(prisma: PrismaClient): Promise<void> {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description },
      update: { description },
    });
  }
  // Permisos que ya no existen en el código.
  await prisma.permission.deleteMany({ where: { key: { notIn: Object.keys(PERMISSIONS) } } });

  for (const [key, def] of Object.entries(SYSTEM_ROLES)) {
    const role = await prisma.role.upsert({
      where: { key },
      create: { key, name: def.name, description: def.description, isSystem: true },
      update: { name: def.name, description: def.description, isSystem: true },
    });
    // Los roles de sistema se sincronizan siempre con la definición del código.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: def.permissions.map((permissionKey: PermissionKey) => ({
        roleId: role.id,
        permissionKey,
      })),
    });
  }

  for (const name of INITIAL_WAREHOUSES) {
    await prisma.warehouse.upsert({ where: { name }, create: { name }, update: {} });
  }
  for (const name of INITIAL_PROVIDERS) {
    await prisma.provider.upsert({ where: { name }, create: { name }, update: {} });
  }
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedBase(prisma)
    .then(() => console.log('Seed base aplicado.'))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
