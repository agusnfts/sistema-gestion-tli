import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FileText, History, Upload } from 'lucide-react';
import {
  DOCUMENT_LINK_TYPES,
  DOCUMENT_LINK_TYPE_LABELS,
  type DocumentItem,
  type DocumentLinkType,
} from '@tli/shared';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Badge, Card } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import {
  AttachmentList,
  AttachmentPicker,
  useAttachmentUploads,
} from '@/features/attachments/attachments';
import { errorText } from '@/features/problems/components';

/**
 * Documentos de un cliente o una integración (biblioteca básica): cada documento tiene
 * versiones; subir una nueva la deja vigente y conserva las anteriores.
 */
export function DocumentsCard({
  documents,
  endpoint,
  canManage,
  onChanged,
}: {
  documents: DocumentItem[];
  /** POST que crea un documento nuevo en la entidad. */
  endpoint: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [dialog, setDialog] = useState<
    { mode: 'new' } | { mode: 'version'; doc: DocumentItem } | null
  >(null);
  const [history, setHistory] = useState<string | null>(null);

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Documentos</h2>
          <p className="text-xs text-muted">Especificaciones, layouts, ejemplos, minutas…</p>
        </div>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={() => setDialog({ mode: 'new' })}>
            <Upload className="size-4" aria-hidden /> Subir documento
          </Button>
        )}
      </div>
      {documents.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay documentos.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {documents.map((d) => (
            <li key={d.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium">
                    <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                    {d.title}
                    {d.current && <span className="text-xs text-muted">v{d.current.version}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    <Badge>{DOCUMENT_LINK_TYPE_LABELS[d.linkType]}</Badge>{' '}
                    {d.current &&
                      `${d.current.uploadedBy.fullName} · ${formatDateTime(d.current.createdAt)}`}
                  </p>
                  {d.description && <p className="mt-1 text-xs">{d.description}</p>}
                </div>
                <div className="flex gap-1">
                  {d.versions.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-expanded={history === d.id}
                      onClick={() => setHistory(history === d.id ? null : d.id)}
                    >
                      <History className="size-4" aria-hidden /> Versiones
                    </Button>
                  )}
                  {canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDialog({ mode: 'version', doc: d })}
                    >
                      Nueva versión
                    </Button>
                  )}
                </div>
              </div>
              {d.current?.file && (
                <div className="mt-2">
                  <AttachmentList items={[d.current.file]} />
                </div>
              )}
              {history === d.id && (
                <ol className="mt-2 space-y-2 border-l-2 border-border pl-3">
                  {d.versions
                    .filter((v) => v.id !== d.current?.id)
                    .map((v) => (
                      <li key={v.id} className="text-xs">
                        <p className="text-muted">
                          v{v.version} · {v.uploadedBy.fullName} · {formatDateTime(v.createdAt)}
                          {v.note && ` · ${v.note}`}
                        </p>
                        {v.file && <AttachmentList items={[v.file]} />}
                      </li>
                    ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
      {dialog && (
        <DocumentDialog
          mode={dialog.mode}
          doc={dialog.mode === 'version' ? dialog.doc : undefined}
          endpoint={endpoint}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function DocumentDialog({
  mode,
  doc,
  endpoint,
  onClose,
  onSaved,
}: {
  mode: 'new' | 'version';
  doc?: DocumentItem;
  endpoint: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [linkType, setLinkType] = useState<DocumentLinkType>('SPECIFICATION');
  const [note, setNote] = useState('');
  const files = useAttachmentUploads();
  const attachmentId = files.ids[0];
  const save = useMutation({
    mutationFn: () =>
      mode === 'new'
        ? api(endpoint, { method: 'POST', body: { title, linkType, attachmentId } })
        : api(`/documents/${doc!.id}/versions`, {
            method: 'POST',
            body: { attachmentId, note: note || null },
          }),
    onSuccess: onSaved,
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={mode === 'new' ? 'Subir documento' : `Nueva versión de "${doc!.title}"`}
      description={
        mode === 'version'
          ? 'Queda como vigente; las versiones anteriores se conservan.'
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!attachmentId || files.uploading || files.ids.length > 1}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {save.error && <Alert tone="danger">{errorText(save.error)}</Alert>}
        {mode === 'new' && (
          <>
            <Field label="Título" required>
              {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}
            </Field>
            <Field label="Tipo">
              {(p) => (
                <Select
                  {...p}
                  value={linkType}
                  onChange={(e) => setLinkType(e.target.value as DocumentLinkType)}
                >
                  {DOCUMENT_LINK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {DOCUMENT_LINK_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </>
        )}
        {mode === 'version' && (
          <Field label="Qué cambió" hint="Opcional.">
            {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
        )}
        <AttachmentPicker state={files} />
        {files.ids.length > 1 && (
          <p className="text-xs text-danger">Subí un solo archivo por documento.</p>
        )}
      </div>
    </Dialog>
  );
}
