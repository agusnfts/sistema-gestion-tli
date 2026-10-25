import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import {
  CONTACT_KINDS,
  CONTACT_KIND_LABELS,
  formatCuit,
  type ClientContactItem,
  type ClientDetail,
  type ContactKind,
} from '@tli/shared';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { useHasPermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Card, Spinner } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { errorText } from '@/features/problems/components';
import { DocumentsCard } from '@/features/documents/DocumentsCard';
import { ImprovementStatusBadge } from '@/features/improvements/components';
import { CreateIntegrationDialog } from '@/features/integrations/components';
import { IntegrationsTable } from '@/features/integrations/IntegrationsPage';
import { ClientFormDialog, ClientStatusBadge } from './ClientsPage';

type Tab = 'data' | 'contacts' | 'integrations' | 'documents' | 'improvements';

export function ClientDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const can = useHasPermission();
  const canManage = can('client.manage');
  const key = ['clients', 'detail', id];
  const client = useQuery({ queryKey: key, queryFn: () => api<ClientDetail>(`/clients/${id}`) });
  const [tab, setTab] = useState<Tab>('data');
  const [editing, setEditing] = useState(false);
  const [newIntegration, setNewIntegration] = useState(false);

  if (client.isLoading) return <Spinner />;
  if (!client.data) return <Alert tone="warning" title="No encontramos el cliente" />;
  const c = client.data;
  const refresh = (d: ClientDetail) => qc.setQueryData(key, d);

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'data', label: 'Datos', show: true },
    { id: 'contacts', label: `Contactos (${c.contacts.length})`, show: true },
    {
      id: 'integrations',
      label: `Integraciones (${c.integrations.length})`,
      show: can('integration.read'),
    },
    { id: 'documents', label: `Documentos (${c.documents.length})`, show: true },
    {
      id: 'improvements',
      label: `Mejoras (${c.improvements.length})`,
      show: can('improvement.read'),
    },
  ];

  return (
    <>
      <Link
        to="/clientes"
        className="mb-3 inline-flex items-center gap-1 text-sm text-brand hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> Clientes
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-brand">{c.shortName ?? c.legalName}</h1>
          <p className="mt-1 text-sm text-muted">
            {c.shortName && `${c.legalName} · `}
            {c.cuit ? `CUIT ${formatCuit(c.cuit)}` : 'Sin CUIT'}
            {c.warehouses.length > 0 && ` · ${c.warehouses.map((w) => w.name).join(', ')}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ClientStatusBadge status={c.status} />
          {canManage && (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden /> Editar
            </Button>
          )}
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Secciones"
        className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0"
      >
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'shrink-0 rounded-md px-3 py-1.5 text-sm',
                tab === t.id
                  ? 'bg-primary-soft font-medium text-primary'
                  : 'text-muted hover:bg-panel',
              )}
            >
              {t.label}
            </button>
          ))}
      </div>

      {tab === 'data' && (
        <Card className="space-y-3 p-5 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Razón social</dt>
              <dd className="font-medium">{c.legalName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">CUIT</dt>
              <dd className="font-mono">{c.cuit ? formatCuit(c.cuit) : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Depósitos</dt>
              <dd>{c.warehouses.map((w) => w.name).join(', ') || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Integraciones</dt>
              <dd>
                {c.pendingIntegrationCount} pendientes de {c.integrationCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Domicilio</dt>
              <dd>{c.address || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Folio F50</dt>
              <dd>{c.f50Folio || '—'}</dd>
            </div>
          </dl>
          <div>
            <p className="text-xs text-muted">Notas</p>
            <p className="whitespace-pre-wrap">{c.notes || '—'}</p>
          </div>
          <p className="text-xs text-muted">Alta: {formatDateTime(c.createdAt)}</p>
        </Card>
      )}

      {tab === 'contacts' && <ContactsCard client={c} canManage={canManage} onSaved={refresh} />}

      {tab === 'integrations' && (
        <div className="space-y-3">
          {can('integration.manage') && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setNewIntegration(true)}>
                <Plus className="size-4" aria-hidden /> Nueva integración
              </Button>
            </div>
          )}
          {c.integrations.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted">Sin integraciones.</Card>
          ) : (
            <IntegrationsTable items={c.integrations} />
          )}
        </div>
      )}

      {tab === 'documents' && (
        <DocumentsCard
          documents={c.documents}
          endpoint={`/clients/${id}/documents`}
          canManage={canManage}
          onChanged={() => void qc.invalidateQueries({ queryKey: key })}
        />
      )}

      {tab === 'improvements' && (
        <Card className="p-5">
          {c.improvements.length === 0 ? (
            <p className="text-sm text-muted">
              Ninguna mejora vinculada. Se vinculan desde el detalle de la mejora.
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {c.improvements.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                  <Link to={`/mejoras/${i.id}`} className="min-w-0 hover:underline">
                    <span className="font-mono text-xs text-muted">{i.code}</span> {i.title}
                  </Link>
                  <ImprovementStatusBadge status={i.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {editing && (
        <ClientFormDialog client={c} onClose={() => setEditing(false)} onSaved={refresh} />
      )}
      {newIntegration && (
        <CreateIntegrationDialog
          defaults={{ counterpartType: 'CLIENT', clientId: c.id }}
          onClose={() => setNewIntegration(false)}
        />
      )}
    </>
  );
}

function ContactsCard({
  client: c,
  canManage,
  onSaved,
}: {
  client: ClientDetail;
  canManage: boolean;
  onSaved: (d: ClientDetail) => void;
}) {
  const [editing, setEditing] = useState<ClientContactItem | 'new' | null>(null);
  const remove = useMutation({
    mutationFn: (contactId: string) =>
      api<ClientDetail>(`/clients/${c.id}/contacts/${contactId}`, { method: 'DELETE' }),
    onSuccess: onSaved,
  });

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Contactos</h2>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> Agregar
          </Button>
        )}
      </div>
      {remove.error && (
        <div className="mb-3">
          <Alert tone="danger">{errorText(remove.error)}</Alert>
        </div>
      )}
      {c.contacts.length === 0 ? (
        <p className="text-sm text-muted">Sin contactos cargados.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {c.contacts.map((k) => (
            <li key={k.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {k.name}{' '}
                  <span className="text-xs font-normal text-muted">
                    · {k.role ?? CONTACT_KIND_LABELS[k.kind]}
                  </span>
                </p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                  {k.email && (
                    <a
                      href={`mailto:${k.email}`}
                      className="inline-flex items-center gap-1 text-brand hover:underline"
                    >
                      <Mail className="size-3" aria-hidden /> {k.email}
                    </a>
                  )}
                  {k.phone && (
                    <a
                      href={`tel:${k.phone}`}
                      className="inline-flex items-center gap-1 text-brand hover:underline"
                    >
                      <Phone className="size-3" aria-hidden /> {k.phone}
                    </a>
                  )}
                </p>
                {k.notes && <p className="mt-1 text-xs text-muted">{k.notes}</p>}
              </div>
              {canManage && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Editar ${k.name}`}
                    onClick={() => setEditing(k)}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Borrar ${k.name}`}
                    onClick={() => remove.mutate(k.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ContactDialog
          clientId={c.id}
          contact={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(d) => {
            setEditing(null);
            onSaved(d);
          }}
        />
      )}
    </Card>
  );
}

function ContactDialog({
  clientId,
  contact,
  onClose,
  onSaved,
}: {
  clientId: string;
  contact?: ClientContactItem;
  onClose: () => void;
  onSaved: (d: ClientDetail) => void;
}) {
  const [f, setF] = useState({
    kind: contact?.kind ?? ('SYSTEMS' as ContactKind),
    role: contact?.role ?? '',
    name: contact?.name ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    notes: contact?.notes ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () =>
      contact
        ? api<ClientDetail>(`/clients/${clientId}/contacts/${contact.id}`, {
            method: 'PATCH',
            body: f,
          })
        : api<ClientDetail>(`/clients/${clientId}/contacts`, { method: 'POST', body: f }),
    onSuccess: onSaved,
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={contact ? 'Editar contacto' : 'Nuevo contacto'}
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
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <Field label="Nombre" required>
            {(p) => <Input {...p} value={f.name} onChange={(e) => set('name', e.target.value)} />}
          </Field>
          <Field label="Tipo">
            {(p) => (
              <Select
                {...p}
                value={f.kind}
                onChange={(e) => set('kind', e.target.value as ContactKind)}
              >
                {CONTACT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CONTACT_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Área" hint="Ej.: Operaciones, Facturación, Tráfico.">
          {(p) => <Input {...p} value={f.role} onChange={(e) => set('role', e.target.value)} />}
        </Field>
        <Field label="Email">
          {(p) => (
            <Input
              {...p}
              type="email"
              value={f.email}
              onChange={(e) => set('email', e.target.value)}
            />
          )}
        </Field>
        <Field label="Teléfono">
          {(p) => (
            <Input
              {...p}
              type="tel"
              value={f.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          )}
        </Field>
        <Field label="Notas" hint="Ej.: horario, qué temas ve.">
          {(p) => <Input {...p} value={f.notes} onChange={(e) => set('notes', e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
