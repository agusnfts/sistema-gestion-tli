import { useState } from 'react';
import { Link } from 'react-router';
import {
  INTEGRATION_FLOWS,
  OPEN_STATUSES,
  type IntegrationCounterpart,
  type IntegrationFlow,
  type IntegrationProcess,
  type TicketDetail,
} from '@tli/shared';
import { useHasPermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/misc';
import { CreateIntegrationDialog, LinkToIntegrationDialog } from './components';

/**
 * Panel de IT en el detalle del ticket: integración a la que se derivó o botones para
 * derivarlo. Se muestra en los pedidos de integración (o si el ticket ya tiene una).
 */
export function TicketIntegrationPanel({ ticket: t }: { ticket: TicketDetail }) {
  const canManage = useHasPermission()('integration.manage');
  const [dialog, setDialog] = useState<'create' | 'link' | null>(null);
  const canDerive = canManage && t.type === 'INTEGRATION' && OPEN_STATUSES.includes(t.status);
  if (!t.integration && !canDerive) return null;

  // El pedido trae con quién, el proceso y el sentido: se precargan.
  const x = t.extraFields as {
    counterpartType?: IntegrationCounterpart;
    counterpartName?: string;
    process?: IntegrationProcess;
    processes?: IntegrationProcess[];
    direction?: string;
  };
  const direction = (INTEGRATION_FLOWS as readonly string[]).includes(x.direction ?? '')
    ? (x.direction as IntegrationFlow)
    : null;

  return (
    <Card className="p-4 text-sm">
      <p className="mb-1 text-xs text-muted">Integración</p>
      {t.integration ? (
        <Link
          to={`/integraciones/${t.integration.id}`}
          className="font-medium text-brand hover:underline"
        >
          {t.integration.code} · {t.integration.name}
        </Link>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            Pasalo a un proyecto de integración: queda en espera y se cierra cuando esté funcionando
            o se decida no hacerla.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => setDialog('create')}>
              Crear integración
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDialog('link')}>
              Derivar a integración
            </Button>
          </div>
        </>
      )}
      {dialog === 'create' && (
        <CreateIntegrationDialog
          ticketIds={[t.id]}
          defaults={{
            name: t.subject,
            counterpartType: x.counterpartType,
            // Con cliente hay que elegirlo del maestro; el nombre del pedido queda como ayuda.
            counterpartName: x.counterpartName,
            processes: x.processes ?? (x.process ? [x.process] : []),
            direction,
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'link' && (
        <LinkToIntegrationDialog ticketIds={[t.id]} onClose={() => setDialog(null)} />
      )}
    </Card>
  );
}
