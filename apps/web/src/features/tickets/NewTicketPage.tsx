import { useState } from 'react';
import { Link } from 'react-router';
import { useForm, type FieldErrors } from 'react-hook-form';
import type { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, KeyRound, Lightbulb, Link2, Wrench } from 'lucide-react';
import {
  ACCESS_ACTION_LABELS,
  ACCESS_ACTIONS,
  createTicketSchema,
  fixedCategoryFor,
  INTEGRATION_COUNTERPART_LABELS,
  INTEGRATION_COUNTERPARTS,
  FREQUENCIES,
  FREQUENCY_LABELS,
  INTEGRATION_DIRECTION_LABELS,
  INTEGRATION_DIRECTIONS,
  INTEGRATION_PROCESS_LABELS,
  INTEGRATION_PROCESSES,
  PRIORITIES,
  PRIORITY_LABELS,
  CATEGORIES_BY_TYPE,
  CATEGORY_QUESTION,
  TICKET_CATEGORY_LABELS,
  TICKET_TYPE_LABELS,
  URGENCY_HELP,
  type CreateTicketInput,
  type CreateTicketResponse,
  type TicketType,
} from '@tli/shared';
import { useQueryClient } from '@tanstack/react-query';
import { api, applyServerErrors } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button, buttonClasses } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Card, PageHeader } from '@/components/ui/misc';
import { useCatalog } from '@/features/admin/api-hooks';

const TYPE_ICONS: Record<TicketType, typeof Wrench> = {
  SUPPORT: Wrench,
  AUTOMATION: Lightbulb,
  INTEGRATION: Link2,
  ACCESS: KeyRound,
};

const DESCRIPTION_HELP: Record<TicketType, string> = {
  SUPPORT: 'Contá qué estabas haciendo, qué esperabas que pasara y qué pasó.',
  AUTOMATION: 'Contá la idea con tus palabras.',
  INTEGRATION: 'Contá qué se necesita intercambiar y cualquier dato que tengas.',
  ACCESS: 'Contá qué permisos o qué perfil necesita (por ejemplo, "igual que Juan Pérez").',
};

const textareaClass =
  'w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm aria-[invalid=true]:border-danger';

export function NewTicketPage() {
  const [type, setType] = useState<TicketType | null>(null);
  const [created, setCreated] = useState<CreateTicketResponse | null>(null);

  if (created) {
    return (
      <Card className="mx-auto max-w-lg p-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-accent-strong" aria-hidden />
        <h1 className="mt-3 text-xl font-bold text-brand">Ticket {created.number} creado</h1>
        <p className="mt-2 text-sm text-muted">
          Lo vas a encontrar en "Mis tickets". Te avisamos por la campana cuando haya novedades.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link to={`/tickets/${created.id}`} className={buttonClasses()}>
            Ver ticket
          </Link>
          <Link to="/mis-tickets" className={buttonClasses('secondary')}>
            Ir a Mis tickets
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Nuevo ticket"
        description={type ? TICKET_TYPE_LABELS[type].title : '¿Qué querés hacer?'}
      />
      {!type ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(TICKET_TYPE_LABELS) as TicketType[]).map((t) => {
            const Icon = TYPE_ICONS[t];
            return (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => setType(t)}
                  className="flex h-full w-full items-start gap-3 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-brand"
                >
                  <Icon className="mt-0.5 size-6 shrink-0 text-brand" aria-hidden />
                  <span>
                    <span className="block font-semibold">{TICKET_TYPE_LABELS[t].title}</span>
                    <span className="text-sm text-muted">{TICKET_TYPE_LABELS[t].help}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <TicketForm type={type} onBack={() => setType(null)} onCreated={setCreated} />
      )}
    </>
  );
}

function TicketForm({
  type,
  onBack,
  onCreated,
}: {
  type: TicketType;
  onBack: () => void;
  onCreated: (r: CreateTicketResponse) => void;
}) {
  const qc = useQueryClient();
  const warehouses = useCatalog('warehouses');
  const areas = useCatalog('areas');
  const fixedCategory = fixedCategoryFor(type);
  const [error, setError] = useState<string | null>(null);
  // Soporte y accesos tienen SLA completo: se pide la urgencia percibida.
  const isSupport = type === 'SUPPORT' || type === 'ACCESS';

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createTicketSchema>, unknown, CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      type,
      // Cada tipo ofrece solo sus categorías; la primera es la sugerida.
      category: CATEGORIES_BY_TYPE[type][0],
      userUrgency: isSupport ? 'MEDIUM' : undefined,
      extra: {},
    } as z.input<typeof createTicketSchema>,
  });

  // Los errores de `extra` dependen del tipo; se leen genéricamente.
  const extraErrors = (errors as FieldErrors<{ extra: Record<string, { message?: string }> }>)
    .extra as Record<string, { message?: string }> | undefined;
  const reg = (name: string) => register(name as never);
  const urgency = watch('userUrgency') as string | undefined;
  const counterpart = watch('extra.counterpartType' as never) as unknown as string | undefined;
  const counterpartLabel =
    counterpart === 'CLIENT'
      ? 'Cliente'
      : counterpart === 'CARRIER'
        ? 'Expreso'
        : '¿Con quién es la integración?';

  // Un solo selector para el sector: el valor es "w:<id>" (depósito) o "a:<id>" (área).
  const onSectorChange = (value: string) => {
    const [kind, id] = value.split(':');
    setValue('warehouseId', kind === 'w' ? id : undefined);
    setValue('areaId', kind === 'a' ? id : undefined);
  };

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await api<CreateTicketResponse>('/tickets', { method: 'POST', body: values });
      await qc.invalidateQueries({ queryKey: ['tickets'] });
      onCreated(res);
    } catch (e) {
      setError(applyServerErrors(e, setFieldError));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-3xl space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}
      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* En un pedido de integración la categoría es fija: el formulario no cambia con ella. */}
          {!fixedCategory && (
            <Field label={CATEGORY_QUESTION[type]} required error={errors.category?.message}>
              {(p) => (
                <Select {...p} {...register('category')}>
                  {CATEGORIES_BY_TYPE[type].map((c) => (
                    <option key={c} value={c}>
                      {TICKET_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field
            label="Sector"
            error={errors.areaId?.message ?? errors.warehouseId?.message}
            hint="Depósito o área a la que afecta, si corresponde."
          >
            {(p) => (
              <Select {...p} defaultValue="" onChange={(e) => onSectorChange(e.target.value)}>
                <option value="">No aplica</option>
                <optgroup label="Depósitos">
                  {warehouses.data?.map((w) => (
                    <option key={w.id} value={`w:${w.id}`}>
                      {w.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Áreas">
                  {areas.data?.map((a) => (
                    <option key={a.id} value={`a:${a.id}`}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              </Select>
            )}
          </Field>
        </div>
        <Field
          label="Asunto"
          required
          error={errors.subject?.message}
          hint="En pocas palabras, de qué se trata."
        >
          {(p) => <Input {...p} maxLength={150} {...register('subject')} />}
        </Field>
        <Field
          label="Descripción"
          required
          error={errors.description?.message}
          hint={DESCRIPTION_HELP[type]}
        >
          {(p) => (
            <textarea {...p} rows={5} className={textareaClass} {...register('description')} />
          )}
        </Field>
      </Card>

      {type === 'SUPPORT' && (
        <Card className="space-y-4 p-5">
          <Field label="Mensaje de error (si apareció)" error={extraErrors?.errorMessage?.message}>
            {(p) => (
              <textarea {...p} rows={2} className={textareaClass} {...reg('extra.errorMessage')} />
            )}
          </Field>
        </Card>
      )}

      {type === 'ACCESS' && (
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="¿Qué necesitás?" required error={extraErrors?.accessAction?.message}>
            {(p) => (
              <Select {...p} {...reg('extra.accessAction')}>
                <option value="">Elegí una opción</option>
                {ACCESS_ACTIONS.map((x) => (
                  <option key={x} value={x}>
                    {ACCESS_ACTION_LABELS[x]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="¿Para quién es?"
            required
            error={extraErrors?.forWhom?.message}
            hint="Nombre y apellido de la persona."
          >
            {(p) => <Input {...p} {...reg('extra.forWhom')} />}
          </Field>
          <Field label="¿Para cuándo lo necesitás?" error={extraErrors?.neededBy?.message}>
            {(p) => <Input {...p} type="date" {...reg('extra.neededBy')} />}
          </Field>
        </Card>
      )}

      {type === 'AUTOMATION' && (
        <Card className="space-y-4 p-5">
          <Field label="¿Cómo se hace hoy?" required error={extraErrors?.currentProcess?.message}>
            {(p) => (
              <textarea
                {...p}
                rows={3}
                className={textareaClass}
                {...reg('extra.currentProcess')}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="¿Cada cuánto?" required error={extraErrors?.frequency?.message}>
              {(p) => (
                <Select {...p} {...reg('extra.frequency')}>
                  <option value="">Elegí una opción</option>
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {FREQUENCY_LABELS[f]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="¿Cuántos minutos lleva cada vez?"
              error={extraErrors?.minutesPerOccurrence?.message}
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  {...register('extra.minutesPerOccurrence' as never, {
                    setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
                  })}
                />
              )}
            </Field>
          </div>
          <Field label="¿Qué ganaríamos?" required error={extraErrors?.expectedBenefit?.message}>
            {(p) => (
              <textarea
                {...p}
                rows={2}
                className={textareaClass}
                {...reg('extra.expectedBenefit')}
              />
            )}
          </Field>
        </Card>
      )}

      {type === 'INTEGRATION' && (
        <Card className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="La integración es con"
              required
              error={extraErrors?.counterpartType?.message}
            >
              {(p) => (
                <Select {...p} {...reg('extra.counterpartType')}>
                  <option value="">Elegí una opción</option>
                  {INTEGRATION_COUNTERPARTS.map((x) => (
                    <option key={x} value={x}>
                      {INTEGRATION_COUNTERPART_LABELS[x]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={counterpartLabel} required error={extraErrors?.counterpartName?.message}>
              {(p) => <Input {...p} {...reg('extra.counterpartName')} />}
            </Field>
            <Field label="Proceso" required error={extraErrors?.process?.message}>
              {(p) => (
                <Select {...p} {...reg('extra.process')}>
                  <option value="">Elegí una opción</option>
                  {INTEGRATION_PROCESSES.map((x) => (
                    <option key={x} value={x}>
                      {INTEGRATION_PROCESS_LABELS[x]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Sentido" required error={extraErrors?.direction?.message}>
              {(p) => (
                <Select {...p} {...reg('extra.direction')}>
                  <option value="">Elegí una opción</option>
                  {INTEGRATION_DIRECTIONS.map((x) => (
                    <option key={x} value={x}>
                      {INTEGRATION_DIRECTION_LABELS[x]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Fecha deseada" error={extraErrors?.desiredDate?.message}>
              {(p) => <Input {...p} type="date" {...reg('extra.desiredDate')} />}
            </Field>
          </div>
          <Field label="Formato o canal, si lo sabés" hint="Ej.: CSV por FTP, Excel por mail, API.">
            {(p) => <Input {...p} {...reg('extra.formatOrChannel')} />}
          </Field>
          <Field label="Volumen estimado" hint="Ej.: 200 pedidos por día.">
            {(p) => <Input {...p} {...reg('extra.volume')} />}
          </Field>
        </Card>
      )}

      {isSupport && (
        <Card className="p-5">
          <fieldset>
            <legend className="text-sm font-medium">
              ¿Qué tan urgente es para vos?{' '}
              <span className="text-danger" aria-hidden>
                *
              </span>
            </legend>
            <p className="text-xs text-muted">La prioridad final la define IT.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {PRIORITIES.map((p) => (
                <label
                  key={p}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm',
                    urgency === p ? 'border-brand bg-primary-soft' : 'border-border',
                  )}
                >
                  <input
                    type="radio"
                    value={p}
                    className="mt-1 accent-primary"
                    {...reg('userUrgency')}
                  />
                  <span>
                    <span className="font-medium">{PRIORITY_LABELS[p]}</span>
                    <span className="block text-xs text-muted">{URGENCY_HELP[p]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onBack}>
          Volver
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Enviar ticket
        </Button>
      </div>
    </form>
  );
}
