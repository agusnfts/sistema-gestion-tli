import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import {
  PRIORITIES,
  PRIORITY_LABELS,
  WEEKDAY_LABELS,
  formatBusinessDuration,
  minutesPerBusinessDay,
  type AutoCloseSettings,
  type BusinessHours,
  type Holiday,
  type SlaPolicies,
} from '@tli/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { Alert, Card, PageHeader, Spinner, Table, Td, Th } from '@/components/ui/misc';

function errorText(e: unknown): string {
  return e instanceof ApiError
    ? [e.message, ...e.issues.map((i) => i.message)].join(' · ')
    : 'Error inesperado';
}

export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Configuración"
        description="SLA, horario hábil, feriados y cierre automático de tickets."
      />
      <div className="space-y-6">
        <SlaSection />
        <BusinessHoursSection />
        <HolidaysSection />
        <AutoCloseSection />
      </div>
    </>
  );
}

function useSetting<T>(path: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['settings', path],
    queryFn: () => api<T>(`/settings/${path}`),
  });
  const save = useMutation({
    mutationFn: (value: T) => api<T>(`/settings/${path}`, { method: 'PUT', body: value }),
    onSuccess: (data) => qc.setQueryData(['settings', path], data),
  });
  return { query, save };
}

function SlaSection() {
  const { query, save } = useSetting<SlaPolicies>('sla');
  const hours = useQuery({
    queryKey: ['settings', 'business-hours'],
    queryFn: () => api<BusinessHours>('/settings/business-hours'),
  });
  const [draft, setDraft] = useState<SlaPolicies | null>(null);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  const dayMinutes = hours.data ? minutesPerBusinessDay(hours.data) : 540;

  if (!draft) return <Spinner />;
  const setSupport = (
    p: (typeof PRIORITIES)[number],
    field: 'firstResponseMinutes' | 'resolutionMinutes',
    v: number,
  ) =>
    setDraft({ ...draft, support: { ...draft.support, [p]: { ...draft.support[p], [field]: v } } });

  return (
    <Card className="p-5">
      <h2 className="font-semibold">SLA por prioridad</h2>
      <p className="mt-1 text-sm text-muted">
        En minutos hábiles. Un día hábil tiene {dayMinutes} minutos según el horario configurado.
        Los cambios aplican a tickets nuevos.
      </p>
      {save.error && (
        <div className="mt-3">
          <Alert tone="danger">{errorText(save.error)}</Alert>
        </div>
      )}
      {save.isSuccess && (
        <div className="mt-3">
          <Alert tone="success">SLA guardado.</Alert>
        </div>
      )}
      <div className="mt-4">
        <Table>
          <thead>
            <tr>
              <Th>Prioridad</Th>
              <Th>1ª respuesta (min)</Th>
              <Th>Resolución (min)</Th>
            </tr>
          </thead>
          <tbody>
            {PRIORITIES.map((p) => (
              <tr key={p}>
                <Td className="font-medium">{PRIORITY_LABELS[p]}</Td>
                {(['firstResponseMinutes', 'resolutionMinutes'] as const).map((f) => (
                  <Td key={f}>
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`${PRIORITY_LABELS[p]}: ${f === 'firstResponseMinutes' ? 'primera respuesta' : 'resolución'}`}
                        type="number"
                        min={1}
                        className="w-28"
                        value={draft.support[p][f]}
                        onChange={(e) => setSupport(p, f, Number(e.target.value))}
                      />
                      <span className="text-xs text-muted">
                        {formatBusinessDuration(draft.support[p][f], dayMinutes)}
                      </span>
                    </div>
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <div className="mt-4 max-w-sm">
        <Field
          label="Propuestas e integraciones: 1ª respuesta (min)"
          hint={`${formatBusinessDuration(draft.proposalFirstResponseMinutes, dayMinutes)}. No tienen SLA de resolución.`}
        >
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              value={draft.proposalFirstResponseMinutes}
              onChange={(e) =>
                setDraft({ ...draft, proposalFirstResponseMinutes: Number(e.target.value) })
              }
            />
          )}
        </Field>
      </div>
      <Button className="mt-4" loading={save.isPending} onClick={() => save.mutate(draft)}>
        Guardar SLA
      </Button>
    </Card>
  );
}

function BusinessHoursSection() {
  const { query, save } = useSetting<BusinessHours>('business-hours');
  const [draft, setDraft] = useState<BusinessHours | null>(null);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  if (!draft) return <Spinner />;
  const days = [1, 2, 3, 4, 5, 6, 0] as const;

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Horario hábil</h2>
      <p className="mt-1 text-sm text-muted">
        Zona horaria: {draft.timezone}. El SLA solo corre dentro de este horario.
      </p>
      {save.error && (
        <div className="mt-3">
          <Alert tone="danger">{errorText(save.error)}</Alert>
        </div>
      )}
      {save.isSuccess && (
        <div className="mt-3">
          <Alert tone="success">Horario guardado.</Alert>
        </div>
      )}
      <ul className="mt-4 space-y-2">
        {days.map((d) => {
          const h = draft.days[d];
          return (
            <li key={d} className="flex flex-wrap items-center gap-3 text-sm">
              <Checkbox
                className="w-32"
                label={WEEKDAY_LABELS[d]}
                checked={!!h}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    days: {
                      ...draft.days,
                      [d]: e.target.checked ? { start: '08:00', end: '17:00' } : undefined,
                    },
                  })
                }
              />
              {h && (
                <>
                  <Input
                    aria-label={`${WEEKDAY_LABELS[d]}: desde`}
                    type="time"
                    className="w-32"
                    value={h.start}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        days: { ...draft.days, [d]: { ...h, start: e.target.value } },
                      })
                    }
                  />
                  <span className="text-muted">a</span>
                  <Input
                    aria-label={`${WEEKDAY_LABELS[d]}: hasta`}
                    type="time"
                    className="w-32"
                    value={h.end}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        days: { ...draft.days, [d]: { ...h, end: e.target.value } },
                      })
                    }
                  />
                </>
              )}
            </li>
          );
        })}
      </ul>
      <Button className="mt-4" loading={save.isPending} onClick={() => save.mutate(draft)}>
        Guardar horario
      </Button>
    </Card>
  );
}

function HolidaysSection() {
  const qc = useQueryClient();
  const holidays = useQuery({
    queryKey: ['settings', 'holidays'],
    queryFn: () => api<Holiday[]>('/settings/holidays'),
  });
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['settings', 'holidays'] });
  const add = useMutation({
    mutationFn: () => api('/settings/holidays', { method: 'POST', body: { date, name } }),
    onSuccess: () => {
      setDate('');
      setName('');
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/settings/holidays/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const year = new Date().getFullYear();
  const upcoming = holidays.data?.filter((h) => h.date >= `${year}-01-01`) ?? [];

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Feriados</h2>
      <p className="mt-1 text-sm text-muted">
        Feriados nacionales argentinos. Los días no laborables con fines turísticos ("puentes") se
        definen cada año por decreto: agregalos acá.
      </p>
      {(add.error || remove.error) && (
        <div className="mt-3">
          <Alert tone="danger">{errorText(add.error ?? remove.error)}</Alert>
        </div>
      )}
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <div className="w-44">
          <Field label="Fecha">
            {(p) => (
              <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            )}
          </Field>
        </div>
        <div className="min-w-48 flex-1">
          <Field label="Nombre">
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
        </div>
        <Button
          type="submit"
          variant="secondary"
          loading={add.isPending}
          disabled={!date || name.trim().length < 2}
        >
          Agregar
        </Button>
      </form>
      {holidays.isLoading ? (
        <Spinner />
      ) : (
        <ul className="mt-4 divide-y divide-border text-sm">
          {upcoming.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                <span className="font-mono text-xs text-muted">
                  {h.date.split('-').reverse().join('/')}
                </span>{' '}
                · {h.name}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Eliminar ${h.name} (${h.date})`}
                onClick={() => remove.mutate(h.id)}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
          {upcoming.length === 0 && (
            <li className="py-2 text-muted">No hay feriados cargados para este año.</li>
          )}
        </ul>
      )}
    </Card>
  );
}

function AutoCloseSection() {
  const { query, save } = useSetting<AutoCloseSettings>('auto-close');
  const [draft, setDraft] = useState<AutoCloseSettings | null>(null);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  if (!draft) return <Spinner />;
  return (
    <Card className="p-5">
      <h2 className="font-semibold">Cierre automático</h2>
      <p className="mt-1 text-sm text-muted">
        Cierra los tickets resueltos cuando el usuario no responde en el plazo indicado.
        Deshabilitado por defecto.
      </p>
      {save.isSuccess && (
        <div className="mt-3">
          <Alert tone="success">Guardado.</Alert>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <Checkbox
          label="Habilitar cierre automático"
          checked={draft.enabled}
          onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
        />
        <div className="w-40">
          <Field label="Días hábiles">
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                max={60}
                disabled={!draft.enabled}
                value={draft.businessDays}
                onChange={(e) => setDraft({ ...draft, businessDays: Number(e.target.value) })}
              />
            )}
          </Field>
        </div>
      </div>
      <Button className="mt-4" loading={save.isPending} onClick={() => save.mutate(draft)}>
        Guardar
      </Button>
    </Card>
  );
}
