import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { FileText, Loader2, Paperclip, ShieldAlert, X } from 'lucide-react';
import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  type AttachmentInfo,
} from '@tli/shared';
import { api, uploadFile, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const ACCEPT = ALLOWED_ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(',');

type Item = AttachmentInfo | { id: string; name: string; uploading: true };

/**
 * Estado de los adjuntos de un formulario: subida inmediata, seguimiento del antivirus
 * y pegado de capturas desde el portapapeles.
 */
export function useAttachmentUploads() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pendingIds = items
    .filter((i): i is AttachmentInfo => !('uploading' in i) && i.scanStatus === 'PENDING_SCAN')
    .map((i) => i.id)
    .join(',');

  // Mientras el antivirus analiza, se consulta el estado cada 2 segundos.
  useEffect(() => {
    if (!pendingIds) return;
    const timer = setInterval(async () => {
      const updated = await api<AttachmentInfo[]>('/attachments/status', {
        query: { ids: pendingIds },
      }).catch(() => []);
      setItems((prev) => prev.map((i) => updated.find((u) => u.id === i.id) ?? i));
    }, 2000);
    return () => clearInterval(timer);
  }, [pendingIds]);

  async function add(files: File[]) {
    setError(null);
    for (const file of files) {
      if (items.length >= MAX_ATTACHMENTS) {
        setError(`Hasta ${MAX_ATTACHMENTS} adjuntos.`);
        return;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`"${file.name}" supera los 25 MB.`);
        continue;
      }
      const tempId = `tmp-${crypto.randomUUID()}`;
      setItems((prev) => [...prev, { id: tempId, name: file.name, uploading: true }]);
      try {
        const info = await uploadFile(file);
        setItems((prev) => prev.map((i) => (i.id === tempId ? info : i)));
      } catch (e) {
        setItems((prev) => prev.filter((i) => i.id !== tempId));
        setError(
          e instanceof ApiError ? `${file.name}: ${e.message}` : `No se pudo subir ${file.name}.`,
        );
      }
    }
  }

  /** Para el onPaste del formulario: toma imágenes pegadas (capturas de pantalla). */
  function onPaste(e: ClipboardEvent) {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    void add(
      files.map(
        (f, i) => new File([f], `captura-${stamp}${i ? `-${i}` : ''}.png`, { type: f.type }),
      ),
    );
  }

  const ready = items.filter(
    (i): i is AttachmentInfo => !('uploading' in i) && i.scanStatus !== 'INFECTED',
  );
  return {
    items,
    error,
    add,
    onPaste,
    remove: (id: string) => setItems((prev) => prev.filter((i) => i.id !== id)),
    clear: () => setItems([]),
    ids: ready.map((i) => i.id),
    uploading: items.some((i) => 'uploading' in i),
  };
}

export function AttachmentPicker({
  state,
  compact,
}: {
  state: ReturnType<typeof useAttachmentUploads>;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    void state.add([...e.dataTransfer.files]);
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 text-sm text-muted',
          compact ? 'py-2' : 'py-4',
          over ? 'border-brand bg-primary-soft' : 'border-border-strong',
        )}
      >
        <button
          type="button"
          className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline"
          onClick={() => input.current?.click()}
        >
          <Paperclip className="size-4" aria-hidden /> Adjuntar archivos
        </button>
        <span className="hidden sm:inline">
          o arrastralos acá. También podés pegar una captura con Ctrl+V.
        </span>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          aria-label="Adjuntar archivos"
          onChange={(e) => {
            void state.add([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </div>
      {!compact && (
        <p className="text-xs text-muted">
          Imágenes, PDF, Word, Excel, ZIP o texto. Hasta 25 MB cada uno.
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
      {state.items.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Archivos adjuntos">
          {state.items.map((i) => (
            <li
              key={i.id}
              className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 text-xs"
            >
              {'uploading' in i ? (
                <Loader2 className="size-3.5 animate-spin text-muted" aria-hidden />
              ) : i.scanStatus === 'INFECTED' ? (
                <ShieldAlert className="size-3.5 text-danger" aria-hidden />
              ) : (
                <FileText className="size-3.5 text-muted" aria-hidden />
              )}
              <span className="max-w-48 truncate">{i.name}</span>
              <span className="text-muted">
                {'uploading' in i
                  ? 'Subiendo…'
                  : i.scanStatus === 'PENDING_SCAN'
                    ? 'Analizando…'
                    : i.scanStatus === 'INFECTED'
                      ? 'Rechazado por el antivirus'
                      : formatBytes(i.size)}
              </span>
              {!('uploading' in i) && (
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-bg"
                  aria-label={`Quitar ${i.name}`}
                  onClick={() => state.remove(i.id)}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Adjuntos ya guardados: miniatura para imágenes, enlace de descarga para el resto. */
export function AttachmentList({ items }: { items: AttachmentInfo[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Adjuntos">
      {items.map((a) => {
        const url = `/api/attachments/${a.id}`;
        if (a.scanStatus !== 'CLEAN') {
          return (
            <li
              key={a.id}
              className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted"
            >
              {a.scanStatus === 'PENDING_SCAN' ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <ShieldAlert className="size-3.5 text-danger" aria-hidden />
              )}
              <span className="max-w-48 truncate">{a.name}</span>
              <span>
                {a.scanStatus === 'PENDING_SCAN' ? 'Analizando…' : 'Rechazado por el antivirus'}
              </span>
            </li>
          );
        }
        if (a.mimeType.startsWith('image/')) {
          return (
            <li key={a.id}>
              <a
                href={`${url}?inline=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                title={a.name}
              >
                <img
                  src={`${url}?inline=1`}
                  alt={a.name}
                  loading="lazy"
                  className="h-24 w-32 rounded-md border border-border object-cover hover:border-brand"
                />
              </a>
            </li>
          );
        }
        return (
          <li key={a.id}>
            <a
              href={url}
              className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:border-brand"
            >
              <FileText className="size-3.5 text-muted" aria-hidden />
              <span className="max-w-48 truncate text-brand">{a.name}</span>
              <span className="text-muted">{formatBytes(a.size)}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
