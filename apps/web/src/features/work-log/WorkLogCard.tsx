import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { WorkLogEntry } from '@tli/shared';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/misc';
import {
  AttachmentList,
  AttachmentPicker,
  useAttachmentUploads,
} from '@/features/attachments/attachments';
import { errorText } from '@/features/problems/components';

const textareaClass =
  'w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm';

/**
 * Bitácora de acciones de IT (problemas y mejoras): qué se hizo, con adjuntos como capturas,
 * logs, cotizaciones o minutas. Siempre interna.
 */
export function WorkLogCard<T>({
  entries,
  endpoint,
  canAdd,
  placeholder,
  onSaved,
}: {
  entries: WorkLogEntry[];
  /** POST que registra la acción y devuelve el detalle actualizado. */
  endpoint: string;
  canAdd: boolean;
  placeholder: string;
  onSaved: (data: T) => void;
}) {
  const [body, setBody] = useState('');
  const attachments = useAttachmentUploads();
  const add = useMutation({
    mutationFn: () =>
      api<T>(endpoint, { method: 'POST', body: { body, attachmentIds: attachments.ids } }),
    onSuccess: (data) => {
      setBody('');
      attachments.clear();
      onSaved(data);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (body.trim()) add.mutate();
  }

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Acciones realizadas</h2>
      <p className="mb-3 text-xs text-muted">
        Qué se hizo, con capturas, logs o documentos. Solo lo ve IT.
      </p>
      {entries.length === 0 ? (
        <p className="mb-4 text-sm text-muted">Todavía no se registraron acciones.</p>
      ) : (
        <ol className="mb-4 space-y-3">
          {entries.map((e) => (
            <li key={e.id} className="rounded-md bg-bg p-3 text-sm">
              <p className="text-xs text-muted">
                <span className="font-medium text-fg">{e.author.fullName}</span> ·{' '}
                {formatDateTime(e.createdAt)}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{e.body}</p>
              {e.attachments.length > 0 && (
                <div className="mt-2">
                  <AttachmentList items={e.attachments} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {canAdd && (
        <form onSubmit={submit} onPaste={attachments.onPaste} className="space-y-2">
          {add.error && <Alert tone="danger">{errorText(add.error)}</Alert>}
          <label htmlFor="work-log-body" className="sr-only">
            Nueva acción
          </label>
          <textarea
            id="work-log-body"
            rows={3}
            className={textareaClass}
            placeholder={placeholder}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <AttachmentPicker state={attachments} compact />
          <Button
            type="submit"
            size="sm"
            disabled={!body.trim() || attachments.uploading}
            loading={add.isPending}
          >
            Registrar acción
          </Button>
        </form>
      )}
    </Card>
  );
}
