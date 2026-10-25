import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet } from 'lucide-react';
import { formatCuit, MAX_IMPORT_BYTES, type F50ImportResult } from '@tli/shared';
import { postForm } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/form';
import { Alert, Badge, Table, Td, Th } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';

const ACTION: Record<string, { label: string; tone: 'success' | 'info' | 'neutral' }> = {
  create: { label: 'Nuevo', tone: 'success' },
  update: { label: 'Actualiza', tone: 'info' },
  skip: { label: 'Sin cambios', tone: 'neutral' },
};

function importF50(file: File, sheet: string, dryRun: boolean): Promise<F50ImportResult> {
  const form = new FormData();
  form.append('file', file);
  const qs = new URLSearchParams({ dryRun: String(dryRun), ...(sheet ? { sheet } : {}) });
  return postForm<F50ImportResult>(`/clients/import?${qs}`, form, {
    tooLarge: 'El archivo supera los 5 MB',
  });
}

/**
 * Importación del F50: se elige el Excel, se ve qué va a pasar con cada fila y recién ahí se
 * confirma. Reimportar el mismo archivo no duplica nada.
 */
export function ImportF50Dialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState('');
  const [result, setResult] = useState<F50ImportResult | null>(null);
  const run = useMutation({
    mutationFn: (v: { file: File; sheet: string; dryRun: boolean }) =>
      importF50(v.file, v.sheet, v.dryRun),
    onSuccess: (r) => {
      setResult(r);
      setSheet(r.sheet);
      if (!r.dryRun) void qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });

  const choose = (f: File | undefined) => {
    if (!f) return;
    setResult(null);
    setSheet('');
    setFile(f);
    if (f.size > MAX_IMPORT_BYTES) return;
    run.mutate({ file: f, sheet: '', dryRun: true });
  };
  const done = result && !result.dryRun;
  const t = result?.totals;

  return (
    <Dialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title="Importar clientes del F50"
      description="Subí el Excel de respuestas del formulario de alta. Primero ves qué va a pasar; nada se guarda hasta que confirmes."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {done ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!done && (
            <Button
              disabled={!result || !t || t.create + t.update === 0}
              loading={run.isPending && !!result}
              onClick={() => file && run.mutate({ file, sheet, dryRun: false })}
            >
              Importar {t ? `(${t.create} nuevos, ${t.update} a actualizar)` : ''}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => choose(e.target.files?.[0])}
          />
          <Button variant="secondary" onClick={() => input.current?.click()} disabled={!!done}>
            <FileSpreadsheet className="size-4" aria-hidden />
            {file ? 'Elegir otro archivo' : 'Elegir el Excel'}
          </Button>
          {file && <span className="text-sm text-muted">{file.name}</span>}
          {result && result.sheets.length > 1 && !done && (
            <Field label="Hoja">
              {(p) => (
                <Select
                  {...p}
                  className="w-auto"
                  value={sheet}
                  onChange={(e) => {
                    setSheet(e.target.value);
                    if (file) run.mutate({ file, sheet: e.target.value, dryRun: true });
                  }}
                >
                  {result.sheets.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>

        {file && file.size > MAX_IMPORT_BYTES && (
          <Alert tone="danger">El archivo supera los 5 MB.</Alert>
        )}
        {run.error && <Alert tone="danger">{run.error.message}</Alert>}
        {run.isPending && !result && <p className="text-sm text-muted">Leyendo el archivo…</p>}

        {result && t && (
          <>
            <Alert tone={done ? 'success' : 'info'}>
              {done ? 'Importación terminada: ' : 'Vista previa: '}
              {t.create} cliente(s) nuevo(s), {t.update} actualizado(s), {t.skip} sin cambios y{' '}
              {t.contacts} contacto(s) nuevo(s).
            </Alert>
            <div className="max-h-[50vh] overflow-y-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Fila</Th>
                    <Th>Cliente</Th>
                    <Th>Qué pasa</Th>
                    <Th>Contactos</Th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.row} className="align-top">
                      <Td className="text-xs text-muted">
                        {r.row}
                        {r.folio && <span className="block">{r.folio}</span>}
                      </Td>
                      <Td>
                        <span className="font-medium">{r.legalName}</span>
                        <span className="block font-mono text-xs text-muted">
                          {r.cuit ? formatCuit(r.cuit) : 'Sin CUIT'}
                          {r.inactive && ' · de baja'}
                        </span>
                        {r.warnings.map((w) => (
                          <span key={w} className="block text-xs text-warning">
                            {w}
                          </span>
                        ))}
                      </Td>
                      <Td>
                        <Badge tone={ACTION[r.action]!.tone}>{ACTION[r.action]!.label}</Badge>
                        {r.matchedBy && (
                          <span className="block text-xs text-muted">
                            por{' '}
                            {r.matchedBy === 'cuit'
                              ? 'CUIT'
                              : r.matchedBy === 'folio'
                                ? 'folio'
                                : 'razón social'}
                          </span>
                        )}
                      </Td>
                      <Td>{r.newContacts || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
