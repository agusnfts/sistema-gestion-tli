import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput, type LoginResponse } from '@tli/shared';
import { api, ApiError } from '@/lib/api';
import { STEP_ROUTES, useMe, useRefreshMe } from '@/lib/auth';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Alert } from '@/components/ui/misc';

export function LoginPage() {
  const { data: me } = useMe();
  const refreshMe = useRefreshMe();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  if (me?.next === 'DONE') return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await api<LoginResponse>('/auth/login', { method: 'POST', body: values });
      await refreshMe();
      navigate(STEP_ROUTES[res.next], { replace: true });
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 429
          ? 'Demasiados intentos. Esperá un minuto y probá de nuevo.'
          : e instanceof ApiError
            ? e.message
            : 'No pudimos conectar con el servidor.',
      );
    }
  });

  return (
    <AuthLayout
      title="Iniciar sesión"
      description="Ingresá con el usuario que te dio el área de TLI."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Email" error={errors.email?.message}>
          {(p) => (
            <Input {...p} type="email" autoComplete="username" autoFocus {...register('email')} />
          )}
        </Field>
        <Field label="Contraseña" error={errors.password?.message}>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
          )}
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Ingresar
        </Button>
        <p className="text-center text-xs text-muted">
          ¿Olvidaste tu contraseña? Pedile a un administrador que la resetee.
        </p>
      </form>
    </AuthLayout>
  );
}
