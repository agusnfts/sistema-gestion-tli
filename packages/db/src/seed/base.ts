// Seed base, idempotente. Corre en todos los entornos (incluida producción):
// permisos, roles de sistema y catálogos iniciales.
import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_AUTO_CLOSE,
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_SLA_POLICIES,
  PERMISSIONS,
  SETTING_KEYS,
  SYSTEM_ROLES,
  type PermissionKey,
} from '@tli/shared';

const INITIAL_WAREHOUSES = ['Garín', 'Pacheco'];
const INITIAL_PROVIDERS = ['Interno', 'Molipa', 'SGL', 'TYT'];
// Plataformas externas habituales; el catálogo se edita desde Administración.
const INITIAL_PLATFORMS = [
  { name: 'Mercado Libre', category: 'ECOMMERCE' },
  { name: 'Tienda Nube', category: 'ECOMMERCE' },
  { name: 'Shopify', category: 'ECOMMERCE' },
  { name: 'Oracle', category: 'ERP' },
  { name: 'Odoo', category: 'ERP' },
  { name: 'SAP', category: 'ERP' },
] as const;

// Feriados nacionales 2026 (inamovibles y trasladables ya trasladados). Los días no laborables
// "puente" se definen por decreto cada año: cargarlos desde Configuración. Verificar contra el
// calendario oficial antes de usar en producción.
const HOLIDAYS_2026: [string, string][] = [
  ['2026-01-01', 'Año Nuevo'],
  ['2026-02-16', 'Carnaval'],
  ['2026-02-17', 'Carnaval'],
  ['2026-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia'],
  ['2026-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas'],
  ['2026-04-03', 'Viernes Santo'],
  ['2026-05-01', 'Día del Trabajador'],
  ['2026-05-25', 'Día de la Revolución de Mayo'],
  ['2026-06-15', 'Paso a la Inmortalidad del Gral. Martín Miguel de Güemes'],
  ['2026-06-20', 'Paso a la Inmortalidad del Gral. Manuel Belgrano'],
  ['2026-07-09', 'Día de la Independencia'],
  ['2026-08-17', 'Paso a la Inmortalidad del Gral. José de San Martín'],
  ['2026-10-12', 'Día del Respeto a la Diversidad Cultural'],
  ['2026-11-23', 'Día de la Soberanía Nacional'],
  ['2026-12-08', 'Inmaculada Concepción de María'],
  ['2026-12-25', 'Navidad'],
];

// Valores iniciales: solo se crean si no existen, para no pisar lo que configure el Admin.
const INITIAL_SETTINGS: Record<string, unknown> = {
  [SETTING_KEYS.slaPolicies]: DEFAULT_SLA_POLICIES,
  [SETTING_KEYS.businessHours]: DEFAULT_BUSINESS_HOURS,
  [SETTING_KEYS.autoClose]: DEFAULT_AUTO_CLOSE,
};

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
  for (const p of INITIAL_PLATFORMS) {
    await prisma.platform.upsert({ where: { name: p.name }, create: p, update: {} });
  }

  for (const [key, value] of Object.entries(INITIAL_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as object },
      update: {},
    });
  }

  // Los feriados de un año se cargan una sola vez: si el Admin borró alguno, no reaparece.
  const has2026 = await prisma.holiday.count({
    where: { date: { gte: new Date('2026-01-01'), lte: new Date('2026-12-31') } },
  });
  if (has2026 === 0) {
    await prisma.holiday.createMany({
      data: HOLIDAYS_2026.map(([date, name]) => ({ date: new Date(date), name })),
    });
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
