import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import {
  CATALOG_KINDS,
  CATALOG_LABELS,
  catalogItemSchema,
  type CatalogItem,
  type CatalogKind,
} from '@tli/shared';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Alert, Badge, PageHeader, Spinner, Table, Td, Th } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { useCatalog } from './api-hooks';

export function CatalogsPage() {
  const [kind, setKind] = useState<CatalogKind>('areas');
  const [editing, setEditing] = useState<CatalogItem | 'new' | null>(null);
  const items = useCatalog(kind, true);
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (item: CatalogItem) =>
      api(`/catalogs/${kind}/${item.id}`, { method: 'PATCH', body: { active: !item.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogs', kind] }),
  });
  const labels = CATALOG_LABELS[kind];

  return (
    <>
      <PageHeader
        title="Catálogos"
        description="Valores que se usan en los formularios. Desactivar un valor lo oculta sin borrar el historial."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> Nuevo {labels.singular.toLowerCase()}
          </Button>
        }
      />
      <div role="tablist" aria-label="Catálogo" className="mb-4 flex gap-1 border-b border-border">
        {CATALOG_KINDS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={k === kind}
            onClick={() => setKind(k)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              k === kind
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {CATALOG_LABELS[k].plural}
          </button>
        ))}
      </div>
      {items.isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>Estado</Th>
              <Th>
                <span className="sr-only">Acciones</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {items.data?.map((item) => (
              <tr key={item.id}>
                <Td className="font-medium">{item.name}</Td>
                <Td>
                  {item.active ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>}
                </Td>
                <Td className="space-x-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>
                    Renombrar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => toggle.mutate(item)}>
                    {item.active ? 'Desactivar' : 'Activar'}
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && (
        <CatalogItemDialog
          kind={kind}
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function CatalogItemDialog({
  kind,
  item,
  onClose,
}: {
  kind: CatalogKind;
  item: CatalogItem | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(item?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      item
        ? api(`/catalogs/${kind}/${item.id}`, { method: 'PATCH', body: { name } })
        : api(`/catalogs/${kind}`, { method: 'POST', body: { name } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalogs', kind] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Error'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = catalogItemSchema.shape.name.safeParse(name);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Nombre inválido');
    save.mutate();
  }

  const label = CATALOG_LABELS[kind].singular;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={item ? `Renombrar ${label.toLowerCase()}` : `Nuevo ${label.toLowerCase()}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="catalog-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="catalog-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Nombre" required>
          {(p) => <Input {...p} autoFocus value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
      </form>
    </Dialog>
  );
}
