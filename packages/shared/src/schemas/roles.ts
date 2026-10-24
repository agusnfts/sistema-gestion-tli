import { z } from 'zod';
import { PERMISSION_KEYS, type PermissionKey } from '../permissions';

const permissionKeySchema = z.enum(PERMISSION_KEYS as [PermissionKey, ...PermissionKey[]]);

export const createRoleSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,39}$/, 'Solo minúsculas, números y guion bajo (2 a 40)'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).default(''),
  permissions: z.array(permissionKeySchema),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(300).optional(),
  permissions: z.array(permissionKeySchema).optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export type RoleItem = {
  id: string;
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: PermissionKey[];
  userCount: number;
};
