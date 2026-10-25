import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Pencil, RefreshCw, Upload } from 'lucide-react';
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_CATEGORY_LABELS,
  VISIBILITIES,
  VISIBILITY_LABELS,
  type KnowledgeCategory,
  type KnowledgeVisibility,
  type LibraryDocument,
  type Paginated,
} from '@tli/shared';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useHasPermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Card, Spinner } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { AttachmentPicker, useAttachmentUploads } from '@/features/attachments/attachments';
import { errorText } from '@/features/problems/components';
import { ExtractionBadge, parseTags, VisibilityBadge } from './components';

const linkTo = (l: LibraryDocument['links'][number]) =>
  l.entityType === 'INTEGRATION' ? `/integraciones/${l.entityId}` : `/clientes/${l.entityId}`;

export function LibraryTab() {
  const can = useHasPermission();
  const canManage = can('kb.manage');
  const [category, setCategory] = useState<KnowledgeCategory | ''>('');
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<LibraryDocument | null>(null);
  const qc = useQueryClient();
  const docs = useQuery({
    queryKey: ['knowledge', 'documents', category, q],
    queryFn: () =>
      api<Paginated<LibraryDocument>>('/knowledge/documents', {
        query: { category: category || undefined, q, pageSize: 100 },
      }),
    placeholderData: keepPreviousData,
    // Mientras haya documentos procesándose, se actualiza solo.
    refetchInterval: (query) =>
      query.state.data?.items.some((d) => d.current?.extractionStatus === 'PENDING') ? 3000 : false,
  });
  const reindex = useMutation({
    mutationFn: (id: string) => api(`/knowledge/documents/${id}/reindex`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['knowledge', 'documents'] }),
  });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select
          aria-label="Categoría"
          className="w-auto"
          value={category}
          onChange={(e) => setCategory(e.target.value as KnowledgeCategory | '')}
        >
          <option value="">Todas las categorías</option>
          {KNOWLEDGE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {KNOWLEDGE_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Filtrar por título o etiqueta"
          placeholder="Filtrar por título o etiqueta"
          className="max-w-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {canManage && (
          <Button className="ml-auto" onClick={() => setUploading(true)}>
            <Upload className="size-4" aria-hidden /> Subir documentos
          </Button>
        )}
      </div>
      {reindex.error && <Alert tone="danger">{errorText(reindex.error)}</Alert>}
      {docs.isLoading ? (
        <Spinner />
      ) : !docs.data?.items.length ? (
        <Card className="p-8 text-center text-sm text-muted">No hay documentos.</Card>
      ) : (
        <ul className="space-y-2">
          {docs.data.items.map((d) => (
            <li key={d.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      {d.title}
                      {d.current && d.versionCount > 1 && (
                        <span className="ml-1 text-xs text-muted">v{d.current.version}</span>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <span>{KNOWLEDGE_CATEGORY_LABELS[d.category]}</span>
                      {d.system && <span>· {d.system}</span>}
                      <VisibilityBadge visibility={d.visibility} />
                      {d.current && (
                        <ExtractionBadge
                          status={d.current.extractionStatus}
                          ocrUsed={d.current.ocrUsed}
                          pagesWithoutText={d.current.pagesWithoutText}
                        />
                      )}
                    </div>
                    {d.description && <p className="text-sm">{d.description}</p>}
                    {(d.tags.length > 0 || d.links.length > 0) && (
                      <p className="flex flex-wrap gap-1 text-xs">
                        {d.tags.map((t) => (
                          <span key={t} className="rounded bg-bg px-1.5 py-0.5 text-muted">
                            #{t}
                          </span>
                        ))}
                        {d.links.map((l) => (
                          <Link
                            key={l.entityId}
                            to={linkTo(l)}
                            className="rounded bg-primary-soft px-1.5 py-0.5 text-primary hover:underline"
                          >
                            {l.label}
                          </Link>
                        ))}
                      </p>
                    )}
                    <p className="text-xs text-muted">
                      {d.author.fullName} · {formatDateTime(d.updatedAt)}
                      {d.current?.pageCount ? ` · ${d.current.pageCount} pág.` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {d.current?.file?.scanStatus === 'CLEAN' && (
                      <a
                        href={`/api/attachments/${d.current.file.id}?inline=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-sm hover:bg-primary-soft"
                      >
                        <ExternalLink className="size-4" aria-hidden /> Abrir
                      </a>
                    )}
                    {canManage && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Editar ${d.title}`}
                          onClick={() => setEditing(d)}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        {d.current &&
                          (d.current.extractionStatus === 'FAILED' ||
                            d.current.pagesWithoutText > 0) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Volver a leer el texto"
                              aria-label={`Volver a leer el texto de ${d.title}`}
                              loading={reindex.isPending && reindex.variables === d.id}
                              onClick={() => reindex.mutate(d.id)}
                            >
                              <RefreshCw className="size-4" aria-hidden />
                            </Button>
                          )}
                      </>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {uploading && <UploadDialog onClose={() => setUploading(false)} />}
      {editing && <EditDialog doc={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Carga masiva: cada archivo es un documento (el título sale del nombre del archivo). */
function UploadDialog({ onClose }: { onClose: () => void }) {
  const can = useHasPermission();
  const qc = useQueryClient();
  const files = useAttachmentUploads();
  const [category, setCategory] = useState<KnowledgeCategory>('PROCEDURES');
  const [visibility, setVisibility] = useState<KnowledgeVisibility>('INTERNAL');
  const [system, setSystem] = useState('');
  const [tags, setTags] = useState('');
  const [progress, setProgress] = useState<{ done: number; errors: string[] } | null>(null);
  const ready = files.items.filter((i) => !('uploading' in i) && files.ids.includes(i.id));

  async function save() {
    setProgress({ done: 0, errors: [] });
    const errors: string[] = [];
    for (const [n, f] of ready.entries()) {
      const name = 'name' in f ? f.name : 'documento';
      try {
        await api('/knowledge/documents', {
          method: 'POST',
          body: {
            title:
              name
                .replace(/\.[a-z0-9]+$/i, '')
                .replace(/[_-]+/g, ' ')
                .trim() || name,
            category,
            visibility,
            system: system || null,
            tags: parseTags(tags),
            attachmentId: f.id,
          },
        });
      } catch (e) {
        errors.push(`${name}: ${errorText(e)}`);
      }
      setProgress({ done: n + 1, errors: [...errors] });
    }
    void qc.invalidateQueries({ queryKey: ['knowledge', 'documents'] });
    if (!errors.length) onClose();
  }

  return (
    <Dialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title="Subir documentos a la biblioteca"
      description="Podés elegir varios archivos. El texto de los PDF y Word se indexa para la búsqueda; los escaneados necesitan OCR."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {progress ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button
            disabled={!ready.length || files.uploading || !!progress}
            onClick={() => void save()}
          >
            Subir {ready.length || ''} documento(s)
          </Button>
        </>
      }
    >
      <div className="space-y-4" onPaste={files.onPaste}>
        <AttachmentPicker state={files} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoría">
            {(p) => (
              <Select
                {...p}
                value={category}
                onChange={(e) => setCategory(e.target.value as KnowledgeCategory)}
              >
                {KNOWLEDGE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {KNOWLEDGE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Visibilidad">
            {(p) => (
              <Select
                {...p}
                disabled={!can('kb.publish')}
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as KnowledgeVisibility)}
              >
                {VISIBILITIES.map((v) => (
                  <option key={v} value={v}>
                    {VISIBILITY_LABELS[v]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Sistema" hint="Ej.: WMS, TMS. Opcional.">
            {(p) => <Input {...p} value={system} onChange={(e) => setSystem(e.target.value)} />}
          </Field>
          <Field label="Etiquetas" hint="Separadas por coma.">
            {(p) => <Input {...p} value={tags} onChange={(e) => setTags(e.target.value)} />}
          </Field>
        </div>
        {progress && (
          <Alert tone={progress.errors.length ? 'warning' : 'info'}>
            Subidos {progress.done} de {ready.length}.
            {progress.errors.map((e) => (
              <span key={e} className="block">
                {e}
              </span>
            ))}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

function EditDialog({ doc, onClose }: { doc: LibraryDocument; onClose: () => void }) {
  const can = useHasPermission();
  const qc = useQueryClient();
  const [f, setF] = useState({
    title: doc.title,
    description: doc.description ?? '',
    category: doc.category,
    system: doc.system ?? '',
    visibility: doc.visibility,
    tags: doc.tags.join(', '),
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () =>
      api(`/knowledge/documents/${doc.id}`, {
        method: 'PATCH',
        body: {
          title: f.title,
          description: f.description || null,
          category: f.category,
          system: f.system || null,
          tags: parseTags(f.tags),
          ...(can('kb.publish') ? { visibility: f.visibility } : {}),
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['knowledge'] });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Editar documento"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {save.error && <Alert tone="danger">{errorText(save.error)}</Alert>}
        <Field label="Título" required>
          {(p) => <Input {...p} value={f.title} onChange={(e) => set('title', e.target.value)} />}
        </Field>
        <Field label="Descripción">
          {(p) => (
            <Input
              {...p}
              value={f.description}
              onChange={(e) => set('description', e.target.value)}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoría">
            {(p) => (
              <Select
                {...p}
                value={f.category}
                onChange={(e) => set('category', e.target.value as KnowledgeCategory)}
              >
                {KNOWLEDGE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {KNOWLEDGE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Sistema">
            {(p) => (
              <Input {...p} value={f.system} onChange={(e) => set('system', e.target.value)} />
            )}
          </Field>
        </div>
        <Field
          label="Visibilidad"
          hint={can('kb.publish') ? undefined : 'Solo quien publica puede cambiarla.'}
        >
          {(p) => (
            <Select
              {...p}
              disabled={!can('kb.publish')}
              value={f.visibility}
              onChange={(e) => set('visibility', e.target.value as KnowledgeVisibility)}
            >
              {VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {VISIBILITY_LABELS[v]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Etiquetas" hint="Separadas por coma.">
          {(p) => <Input {...p} value={f.tags} onChange={(e) => set('tags', e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
