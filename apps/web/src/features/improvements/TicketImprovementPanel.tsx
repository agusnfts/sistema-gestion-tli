import { useState } from 'react';
import { Link } from 'react-router';
import {
  IMPROVEMENT_SYSTEMS,
  OPEN_STATUSES,
  type ImprovementSystem,
  type TicketDetail,
} from '@tli/shared';
import { useHasPermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/misc';
import { CreateImprovementDialog, LinkToImprovementDialog } from './components';

/** Panel de IT en el detalle del ticket: mejora a la que se derivó o botones para derivarlo. */
export function TicketImprovementPanel({ ticket: t }: { ticket: TicketDetail }) {
  const canManage = useHasPermission()('improvement.manage');
  const [dialog, setDialog] = useState<'create' | 'link' | null>(null);
  const canDerive = canManage && OPEN_STATUSES.includes(t.status);
  if (!t.improvement && !canDerive) return null;

  const system = (IMPROVEMENT_SYSTEMS as readonly string[]).includes(t.category)
    ? (t.category as ImprovementSystem)
    : 'OTHER';
  // Las propuestas de automatización ya traen "cómo se hace hoy".
  const currentProcess = t.extraFields.currentProcess;

  return (
    <Card className="p-4 text-sm">
      <p className="mb-1 text-xs text-muted">Mejora</p>
      {t.improvement ? (
        <Link
          to={`/mejoras/${t.improvement.id}`}
          className="font-medium text-brand hover:underline"
        >
          {t.improvement.code} · {t.improvement.title}
        </Link>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            Si se resuelve con un cambio en un sistema, derivalo: queda en espera y se cierra cuando
            la mejora termine.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => setDialog('create')}>
              Crear mejora
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDialog('link')}>
              Derivar a mejora
            </Button>
          </div>
        </>
      )}
      {dialog === 'create' && (
        <CreateImprovementDialog
          ticketIds={[t.id]}
          defaults={{
            title: t.subject,
            system,
            currentSituation:
              typeof currentProcess === 'string' && currentProcess ? currentProcess : t.description,
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'link' && (
        <LinkToImprovementDialog ticketIds={[t.id]} onClose={() => setDialog(null)} />
      )}
    </Card>
  );
}
