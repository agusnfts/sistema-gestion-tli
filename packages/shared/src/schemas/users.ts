import { z } from 'zod';
import { emailSchema } from './auth';
import { paginationSchema, uuidSchema } from './common';

export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

const fullNameSchema = z.string().trim().min(2, 'Ingresá nombre y apellido').max(120);

export const createUserSchema = z.object({
  email: emailSchema,
  fullName: fullNameSchema,
  defaultAreaId: uuidSchema.nullable().optional(),
  defaultWarehouseId: uuidSchema.nullable().optional(),
  roleIds: z.array(uuidSchema).min(1, 'Asigná al menos un rol'),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  fullName: fullNameSchema.optional(),
  defaultAreaId: uuidSchema.nullable().optional(),
  defaultWarehouseId: uuidSchema.nullable().optional(),
  roleIds: z.array(uuidSchema).min(1, 'Asigná al menos un rol').optional(),
  status: z.enum(USER_STATUSES).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const listUsersQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(USER_STATUSES).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export type UserListItem = {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  roles: { id: string; key: string; name: string }[];
  defaultArea: { id: string; name: string } | null;
  defaultWarehouse: { id: string; name: string } | null;
  mfaEnabled: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

/** Respuesta de alta o reseteo: la contraseña temporal se muestra una sola vez. */
export type TemporaryPasswordResponse = {
  user: UserListItem;
  temporaryPassword: string;
};
