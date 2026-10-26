import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import {
  BUSINESS_SYSTEM_LABELS,
  CATALOG_KINDS,
  CATALOG_LABELS,
  PLATFORM_CATEGORIES,
  PLATFORM_CATEGORY_LABELS,
  catalogItemSchema,
  type BusinessSystem,
  type PlatformCategory,
  type CatalogItem,
  type CatalogKind,
} from '@tli/shared';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Badge, PageHeader, Spinner, Table, Td, Th } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { useCatalog } from './api-hooks';
import { useSystems } from '@/features/announcements/components';

export function CatalogsPage() {
  const [tab, setTab] = useState<CatalogKind | 'systems'>('areas');
  return tab === 'systems' ? (
    <CatalogsLayout tab={tab} onTab={setTab}>
      <SystemsTab />
    </CatalogsLayout>
  ) : (
    <CatalogTab kind={tab} onTab={setTab} />
  );
}

function CatalogsLayout({
  tab,
  onTab,
  actions,
  children,
}: {
  tab: CatalogKind | 'systems';
  onTab: (t: CatalogKind | 'systems') => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const tabs = [
    ...CATALOG_KINDS.map((k) => ({ value: k, label: CATALOG_LABELS[k].plural })),
    { value: 'systems' as const, label: 'Sistemas' },
  ];
  return (
    <>
      <PageHeader
        title="Catálogos"
        description="Valores que se usan en los formularios. Desactivar un valor lo oculta sin borrar el historial."
        actions={actions}
      />
      <div
        role="tablist"
        aria-label="Catálogo"
        className="mb-4 flex flex-wrap gap-1 border-b border-border"
      >
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={t.value === tab}
            onClick={() => onTab(t.value)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              t.value === tab
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {children}
    </>
  );
}

/** Proveedor de cada sistema propio: se propone al crear mejoras y se muestra en los avisos. */
function SystemsTab() {
  const systems = useSystems();
  const providers = useCatalog('providers');
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: ({ key, providerId }: { key: BusinessSystem; providerId: string | null }) =>
      api(`/systems/${key}`, { method: 'PATCH', body: { providerId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['systems'] }),
  });
  if (systems.isLoading) return <Spinner />;
  return (
    <>
      {save.error && (
        <div className="mb-3">
          <Alert tone="danger">
            {save.error instanceof ApiError ? save.error.message : 'Error'}
          </Alert>
        </div>
      )}
      <Table>
        <thead>
          <tr>
            <Th>Sistema</Th>
            <Th>Proveedor</Th>
          </tr>
        </thead>
        <tbody>
          {systems.data?.map((s) => (
            <tr key={s.key}>
              <Td className="font-medium">{BUSINESS_SYSTEM_LABELS[s.key]}</Td>
              <Td>
                <Select
                  aria-label={`Proveedor de ${BUSINESS_SYSTEM_LABELS[s.key]}`}
                  className="max-w-xs"
                  value={s.provider?.id ?? ''}
                  disabled={save.isPending}
                  onChange={(e) => save.mutate({ key: s.key, providerId: e.target.value || null })}
                >
                  <option value="">Sin proveedor</option>
                  {providers.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="mt-3 text-xs text-muted">
        Al crear una mejora de un sistema se propone su proveedor (después se puede cambiar).
      </p>
    </>
  );
}

function CatalogTab({
  kind,
  onTab,
}: {
  kind: CatalogKind;
  onTab: (t: CatalogKind | 'systems') => void;
}) {
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
    <CatalogsLayout
      tab={kind}
      onTab={onTab}
      actions={
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden /> Nuevo {labels.singular.toLowerCase()}
        </Button>
      }
    >
      {items.isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Nombre</Th>
              {kind === 'platforms' && <Th>Categoría</Th>}
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
                {kind === 'platforms' && (
                  <Td>{PLATFORM_CATEGORY_LABELS[item.category ?? 'OTHER']}</Td>
                )}
                <Td>
                  {item.active ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>}
                </Td>
                <Td className="space-x-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>
                    {kind === 'platforms' ? 'Editar' : 'Renombrar'}
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
    </CatalogsLayout>
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
  const [category, setCategory] = useState<PlatformCategory>(item?.category ?? 'ECOMMERCE');
  const isPlatform = kind === 'platforms';
  const body = isPlatform ? { name, category } : { name };
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      item
        ? api(`/catalogs/${kind}/${item.id}`, { method: 'PATCH', body })
        : api(`/catalogs/${kind}`, { method: 'POST', body }),
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
      title={
        item
          ? `${isPlatform ? 'Editar' : 'Renombrar'} ${label.toLowerCase()}`
          : `${isPlatform ? 'Nueva' : 'Nuevo'} ${label.toLowerCase()}`
      }
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
        {isPlatform && (
          <Field label="Categoría">
            {(p) => (
              <Select
                {...p}
                value={category}
                onChange={(e) => setCategory(e.target.value as PlatformCategory)}
              >
                {PLATFORM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {PLATFORM_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </form>
    </Dialog>
  );
}
