import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { checkPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@tli/shared';
import { api, applyServerErrors } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Alert } from '@/components/ui/misc';

type Values = { currentPassword: string; newPassword: string; confirm: string };

export function ChangePasswordForm({
  currentLabel = 'Contraseña actual',
  submitLabel = 'Cambiar contraseña',
  onDone,
}: {
  currentLabel?: string;
  submitLabel?: string;
  onDone: () => void | Promise<void>;
}) {
  const { data: me } = useMe();
  const [error, setError] = useState<string | null>(null);

  // La misma política que valida el servidor, para avisar antes de enviar.
  const schema = z
    .object({
      currentPassword: z.string().min(1, 'Ingresá tu contraseña actual'),
      newPassword: z.string().max(PASSWORD_MAX_LENGTH),
      confirm: z.string(),
    })
    .superRefine((v, ctx) => {
      for (const message of checkPassword(v.newPassword, {
        email: me?.email,
        fullName: me?.fullName,
      })) {
        ctx.addIssue({ code: 'custom', path: ['newPassword'], message });
      }
      if (v.newPassword !== v.confirm) {
        ctx.addIssue({
          code: 'custom',
          path: ['confirm'],
          message: 'Las contraseñas no coinciden',
        });
      }
    });

  const {
    register,
    handleSubmit,
    setError: setFieldError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setError(null);
    try {
      await api('/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
      reset();
      await onDone();
    } catch (e) {
      setError(applyServerErrors(e, setFieldError));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label={currentLabel} error={errors.currentPassword?.message}>
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="current-password"
            {...register('currentPassword')}
          />
        )}
      </Field>
      <Field
        label="Contraseña nueva"
        error={errors.newPassword?.message}
        hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Conviene una frase fácil de recordar para vos.`}
      >
        {(p) => (
          <Input {...p} type="password" autoComplete="new-password" {...register('newPassword')} />
        )}
      </Field>
      <Field label="Repetí la contraseña nueva" error={errors.confirm?.message}>
        {(p) => (
          <Input {...p} type="password" autoComplete="new-password" {...register('confirm')} />
        )}
      </Field>
      <Button type="submit" loading={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
