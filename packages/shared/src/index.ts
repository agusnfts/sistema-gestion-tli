import { z } from 'zod';

// Mensajes de validación por defecto en español (API y web usan los mismos schemas).
z.config(z.locales.es());

export * from './permissions';
export * from './business-calendar';
export * from './tickets';
export * from './password-policy';
export * from './audit';
export * from './schemas/auth';
export * from './schemas/users';
export * from './schemas/roles';
export * from './schemas/catalogs';
export * from './schemas/common';
export * from './schemas/tickets';
export * from './schemas/settings';
export * from './schemas/problems';
