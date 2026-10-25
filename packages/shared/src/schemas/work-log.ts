import { z } from 'zod';
import { uuidSchema } from './common';
import { MAX_ATTACHMENTS, type AttachmentInfo, type UserRef } from './tickets';

// Bitácora de acciones de IT sobre un problema o una mejora: qué se hizo, con adjuntos
// (capturas, logs, cotizaciones, minutas). Siempre interna.

export const addWorkLogSchema = z.object({
  body: z.string().trim().min(1, 'Contá qué acción se tomó').max(10_000),
  attachmentIds: z
    .array(uuidSchema)
    .max(MAX_ATTACHMENTS, `Hasta ${MAX_ATTACHMENTS} adjuntos`)
    .optional(),
});
export type AddWorkLogInput = z.infer<typeof addWorkLogSchema>;

export type WorkLogEntry = {
  id: string;
  author: UserRef;
  body: string;
  createdAt: string;
  attachments: AttachmentInfo[];
};
