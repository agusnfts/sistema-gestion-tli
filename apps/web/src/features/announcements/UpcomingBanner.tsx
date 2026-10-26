import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { formatWindow, type UpcomingAnnouncement } from '@tli/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { systemNames } from './components';

/** Cartel para todos los usuarios con las actualizaciones avisadas, en curso o próximas. */
export function UpcomingBanner() {
  const upcoming = useQuery({
    queryKey: ['announcements', 'upcoming'],
    queryFn: () => api<UpcomingAnnouncement[]>('/announcements/upcoming'),
    refetchInterval: 5 * 60_000,
  });
  if (!upcoming.data?.length) return null;
  return (
    <section aria-label="Actualizaciones de sistemas" className="mb-4 space-y-2">
      {upcoming.data.map((u) => (
        <div
          key={u.id}
          className={cn(
            'flex gap-3 rounded-md p-3 text-sm',
            u.inProgress ? 'bg-warning-soft text-warning' : 'bg-info-soft text-info',
          )}
        >
          <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <span className="font-medium">
              {u.inProgress ? 'Actualización en curso' : 'Próxima actualización'} de{' '}
              {systemNames(u.systems)}:
            </span>{' '}
            {u.title}. {formatWindow(new Date(u.startsAt), u.endsAt ? new Date(u.endsAt) : null)}.
            {u.impact === 'OUTAGE' && ' El sistema va a estar fuera de servicio.'}
          </p>
        </div>
      ))}
    </section>
  );
}
