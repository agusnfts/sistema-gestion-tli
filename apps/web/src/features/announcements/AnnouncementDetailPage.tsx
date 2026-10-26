import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, Send } from 'lucide-react';
import {
  ANNOUNCEMENT_IMPACT_LABELS,
  ANNOUNCEMENT_SEND_KIND_LABELS,
  BUSINESS_SYSTEM_LABELS,
  buildAnnouncementEmail,
  formatWindow,
  isAnnouncementOpen,
  type AnnouncementDetail,
  type SendAnnouncementResponse,
} from '@tli/shared';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert, Card, Spinner } from '@/components/ui/misc';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import {
  AnnouncementFormDialog,
  AnnouncementStatusBadge,
  CloseAnnouncementDialog,
  errorText,
} from './components';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function AnnouncementDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [closing, setClosing] = useState<'done' | 'cancel' | null>(null);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['announcements', 'detail', id],
    queryFn: () => api<AnnouncementDetail>(`/announcements/${id}`),
  });
  const send = useMutation({
    mutationFn: () =>
      api<SendAnnouncementResponse>(`/announcements/${id}/send`, { method: 'POST' }),
    onSuccess: (r) => {
      qc.setQueryData(['announcements', 'detail', id], r.announcement);
      // Lista y cartel de próximas actualizaciones.
      void qc.invalidateQueries({ queryKey: ['announcements', 'list'] });
      void qc.invalidateQueries({ queryKey: ['announcements', 'upcoming'] });
      setConfirmSend(false);
      setNotice(
        r.emailed
          ? `Aviso enviado a ${plural(r.emailCount, 'dirección', 'direcciones')} de mail.`
          : `Aviso registrado. El mail todavía no está activo: lo vieron en la campana ${plural(r.userCount, 'usuario', 'usuarios')} del sistema.`,
      );
    },
    onError: () => setConfirmSend(false),
  });

  if (query.isLoading) return <Spinner />;
  if (query.error || !query.data) {
    return <Alert tone="danger">{errorText(query.error ?? new Error())}</Alert>;
  }
  const a = query.data;
  const open = isAnnouncementOpen(a.status);
  const hasRecipients = a.recipients.emailCount > 0;
  const mailFor = (kind: 'NOTICE' | 'DONE' | 'CANCELLED') =>
    buildAnnouncementEmail(
      {
        ...a,
        startsAt: new Date(a.startsAt),
        endsAt: a.endsAt ? new Date(a.endsAt) : null,
      },
      kind,
      window.location.origin,
    );
  const previewMail = mailFor(
    a.status === 'DONE' ? 'DONE' : a.status === 'CANCELLED' ? 'CANCELLED' : 'NOTICE',
  );

  return (
    <>
      <Link
        to="/actualizaciones"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden /> Actualizaciones
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted">{a.code}</p>
          <h1 className="text-2xl font-bold text-brand">{a.title}</h1>
        </div>
        <AnnouncementStatusBadge status={a.status} />
      </div>

      <div className="mb-4 space-y-2">
        {notice && <Alert tone="success">{notice}</Alert>}
        {send.error && <Alert tone="danger">{errorText(send.error)}</Alert>}
        {open && !a.emailActive && (
          <Alert tone="warning" title="El mail todavía no está activo">
            Al enviar, el aviso queda registrado y los usuarios del sistema lo ven en la campana.
            Cuando el Admin active el mail (Configuración), podés reenviarlo.
          </Alert>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-5">
          <Card className="space-y-3 p-5 text-sm">
            <Row label="Cuándo">
              {formatWindow(new Date(a.startsAt), a.endsAt ? new Date(a.endsAt) : null)}
            </Row>
            <Row label="Sistemas">
              {a.providers.map((p) => (
                <span key={p.system} className="mr-3 inline-block">
                  {BUSINESS_SYSTEM_LABELS[p.system]}
                  {p.provider && <span className="text-muted"> · {p.provider}</span>}
                </span>
              ))}
            </Row>
            <Row label="Impacto">{ANNOUNCEMENT_IMPACT_LABELS[a.impact]}</Row>
            <Row label="Motivo">
              <span className="whitespace-pre-wrap">{a.reason}</span>
            </Row>
            {a.details && (
              <Row label="Indicaciones">
                <span className="whitespace-pre-wrap">{a.details}</span>
              </Row>
            )}
            {a.closingNote && (
              <Row label={a.status === 'CANCELLED' ? 'Motivo de cancelación' : 'Cierre'}>
                <span className="whitespace-pre-wrap">{a.closingNote}</span>
              </Row>
            )}
            <p className="pt-2 text-xs text-muted">
              Cargado por {a.createdBy.fullName} · {formatDateTime(a.createdAt)}
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Destinatarios</h2>
            <ul className="space-y-1 text-sm">
              {a.distributionLists.map((l) => (
                <li key={l.id}>
                  Lista <span className="font-medium">{l.name}</span>{' '}
                  <span className="text-muted">({plural(l.emailCount, 'mail', 'mails')})</span>
                </li>
              ))}
              {a.warehouses.length > 0 && (
                <li>
                  Usuarios de los depósitos:{' '}
                  <span className="font-medium">{a.warehouses.map((w) => w.name).join(', ')}</span>
                </li>
              )}
              {a.areas.length > 0 && (
                <li>
                  Usuarios de las áreas:{' '}
                  <span className="font-medium">{a.areas.map((x) => x.name).join(', ')}</span>
                </li>
              )}
            </ul>
            {hasRecipients ? (
              <p className="mt-3 text-sm text-muted">
                En total: {plural(a.recipients.emailCount, 'dirección', 'direcciones')} de mail
                {a.recipients.userCount > 0 &&
                  ` (${plural(a.recipients.userCount, 'usuario', 'usuarios')} del sistema también lo ven en la campana)`}
                .
              </p>
            ) : (
              <p className="text-sm text-muted">
                Sin destinatarios. Editá el aviso y elegí listas, depósitos o áreas.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Envíos</h2>
            {a.sends.length === 0 ? (
              <p className="text-sm text-muted">Todavía no se envió.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {a.sends.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <span className="font-medium">{ANNOUNCEMENT_SEND_KIND_LABELS[s.kind]}</span>
                      {' · '}
                      {s.emailed
                        ? plural(s.emailCount, 'mail', 'mails')
                        : 'sin mail (solo campana)'}
                      {s.userCount > 0 && ` · ${plural(s.userCount, 'usuario', 'usuarios')}`}
                      {s.sentBy ? ` · ${s.sentBy.fullName}` : ' · automático'}
                    </span>
                    <span className="text-xs text-muted">{formatDateTime(s.createdAt)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="order-first space-y-4 lg:order-none">
          <Card className="space-y-3 p-4 text-sm">
            {open ? (
              <>
                <Button
                  className="w-full"
                  disabled={!hasRecipients}
                  onClick={() => setConfirmSend(true)}
                >
                  <Send className="size-4" aria-hidden />
                  {a.sentAt ? 'Reenviar aviso' : 'Enviar aviso'}
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => setPreview(true)}>
                  <Mail className="size-4" aria-hidden /> Ver cómo llega el mail
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => setEditing(true)}>
                  Editar
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => setClosing('done')}>
                  Marcar realizada
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => setClosing('cancel')}>
                  Cancelar actualización
                </Button>
              </>
            ) : (
              <Button variant="secondary" className="w-full" onClick={() => setPreview(true)}>
                <Mail className="size-4" aria-hidden /> Ver el último mail
              </Button>
            )}
            {a.sentAt && (
              <p className="text-xs text-muted">Último aviso: {formatDateTime(a.sentAt)}</p>
            )}
            {a.reminderHours && open && (
              <p className="text-xs text-muted">
                {a.reminderSentAt
                  ? `Recordatorio enviado el ${formatDateTime(a.reminderSentAt)}`
                  : `Recordatorio automático ${plural(a.reminderHours, 'hora', 'horas')} antes del inicio`}
              </p>
            )}
            {a.closedAt && (
              <p className="text-xs text-muted">Cerrada el {formatDateTime(a.closedAt)}</p>
            )}
          </Card>
        </aside>
      </div>

      {editing && <AnnouncementFormDialog announcement={a} onClose={() => setEditing(false)} />}
      {closing && (
        <CloseAnnouncementDialog announcement={a} mode={closing} onClose={() => setClosing(null)} />
      )}
      <ConfirmDialog
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title={a.sentAt ? '¿Reenviar el aviso?' : '¿Enviar el aviso?'}
        description={
          a.emailActive
            ? `Sale un mail a ${plural(a.recipients.emailCount, 'dirección', 'direcciones')}.`
            : 'El mail no está activo: queda registrado y se avisa en la campana a los usuarios del sistema.'
        }
        confirmLabel={a.sentAt ? 'Reenviar' : 'Enviar'}
        loading={send.isPending}
        onConfirm={() => send.mutate()}
      />
      <Dialog
        open={preview}
        onOpenChange={setPreview}
        wide
        title="Vista previa del mail"
        description="Así lo recibe cada destinatario (un mail por persona: nadie ve las direcciones de los demás)."
      >
        <div className="rounded-md border border-border bg-bg p-4 text-sm">
          <p className="mb-3 font-semibold">{previewMail.subject}</p>
          <pre className="whitespace-pre-wrap font-sans">{previewMail.text}</pre>
        </div>
      </Dialog>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_1fr]">
      <span className="text-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}
