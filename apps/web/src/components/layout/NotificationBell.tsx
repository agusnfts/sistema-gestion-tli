import { useNavigate } from 'react-router';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import type { NotificationItem } from '@tli/shared';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';

const COUNT_KEY = ['notifications', 'count'] as const;
const LIST_KEY = ['notifications', 'list'] as const;

/** Campana de avisos dentro del sistema. Consulta el contador cada 30 segundos. */
export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const count = useQuery({
    queryKey: COUNT_KEY,
    queryFn: () => api<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 30_000,
  });
  const list = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => api<NotificationItem[]>('/notifications'),
    enabled: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const markAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: refresh,
  });
  const unread = count.data?.count ?? 0;

  return (
    <DropdownMenu.Root onOpenChange={(open) => open && void list.refetch()}>
      <DropdownMenu.Trigger
        aria-label={unread ? `Notificaciones: ${unread} sin leer` : 'Notificaciones'}
        className="relative rounded-md p-2 hover:bg-bg"
      >
        <Bell className="size-5 text-muted" aria-hidden />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[min(24rem,calc(100vw-2rem))] rounded-md border border-border bg-surface text-sm shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-semibold">Notificaciones</span>
            {unread > 0 && (
              <button
                type="button"
                className="text-xs text-brand hover:underline"
                onClick={() => markAll.mutate()}
              >
                Marcar todas como leídas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {list.isFetching && !list.data ? (
              <p className="p-4 text-center text-muted">Cargando…</p>
            ) : !list.data?.length ? (
              <p className="p-4 text-center text-muted">No tenés notificaciones.</p>
            ) : (
              list.data.map((n) => (
                <DropdownMenu.Item
                  key={n.id}
                  onSelect={() => {
                    if (!n.readAt) markRead.mutate(n.id);
                    if (n.link) navigate(n.link);
                  }}
                  className={cn(
                    'flex cursor-pointer gap-2 border-b border-border px-3 py-2 outline-none last:border-0 data-[highlighted]:bg-bg',
                    !n.readAt && 'bg-primary-soft/60',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      n.readAt
                        ? 'bg-transparent'
                        : n.kind === 'TICKET_SLA_BREACHED'
                          ? 'bg-danger'
                          : n.kind === 'TICKET_SLA_AT_RISK'
                            ? 'bg-warning'
                            : 'bg-brand',
                    )}
                  />
                  <span className="min-w-0">
                    <span className={cn('block', !n.readAt && 'font-medium')}>{n.title}</span>
                    {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                    <span className="block text-xs text-muted">{formatDateTime(n.createdAt)}</span>
                  </span>
                </DropdownMenu.Item>
              ))
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
