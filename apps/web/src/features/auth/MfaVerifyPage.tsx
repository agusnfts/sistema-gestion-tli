import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { mfaVerifySchema } from '@tli/shared';
import { api, ApiError } from '@/lib/api';
import { STEP_ROUTES, useRefreshMe } from '@/lib/auth';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Alert } from '@/components/ui/misc';
import { useLogout } from './useLogout';

export function MfaVerifyPage() {
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const refreshMe = useRefreshMe();
  const navigate = useNavigate();
  const logout = useLogout();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = useRecovery ? { recoveryCode: value } : { code: value };
    const parsed = mfaVerifySchema.safeParse(body);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Código inválido');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api('/auth/mfa/verify', { method: 'POST', body: parsed.data });
      const me = await refreshMe();
      navigate(STEP_ROUTES[me?.next ?? 'DONE'], { replace: true });
    } catch (err) {
      // Si la cuenta se bloqueó por intentos fallidos, el servidor revocó la sesión.
      if (err instanceof ApiError && err.status === 401 && !(await refreshMe())) {
        navigate('/ingresar', { replace: true });
        return;
      }
      setError(err instanceof ApiError ? err.message : 'No pudimos verificar el código.');
      setValue('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Verificación en dos pasos"
      description={
        useRecovery
          ? 'Ingresá uno de los códigos de recuperación que guardaste al configurar el MFA.'
          : 'Ingresá el código de 6 dígitos de tu app de autenticación.'
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label={useRecovery ? 'Código de recuperación' : 'Código'}>
          {(p) => (
            <Input
              {...p}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              autoComplete="one-time-code"
              inputMode={useRecovery ? 'text' : 'numeric'}
              maxLength={useRecovery ? 11 : 6}
              className="text-center font-mono tracking-widest"
            />
          )}
        </Field>
        <Button type="submit" className="w-full" loading={loading}>
          Verificar
        </Button>
        <div className="flex justify-between text-sm">
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            onClick={() => {
              setUseRecovery((v) => !v);
              setValue('');
              setError(null);
            }}
          >
            {useRecovery ? 'Usar la app de autenticación' : 'Usar un código de recuperación'}
          </button>
          <button type="button" className="text-muted hover:underline" onClick={logout}>
            Salir
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
