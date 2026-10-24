import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Copy, Download } from 'lucide-react';
import { totpCodeSchema, type MfaConfirmResponse, type MfaSetupResponse } from '@tli/shared';
import { api, ApiError } from '@/lib/api';
import { STEP_ROUTES, useRefreshMe } from '@/lib/auth';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { Alert } from '@/components/ui/misc';
import { useLogout } from './useLogout';

export function MfaSetupPage() {
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const refreshMe = useRefreshMe();
  const navigate = useNavigate();
  const logout = useLogout();

  async function generate() {
    setError(null);
    setLoading(true);
    try {
      setSetup(await api<MfaSetupResponse>('/auth/mfa/setup', { method: 'POST' }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos generar el código QR.');
    } finally {
      setLoading(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    const parsed = totpCodeSchema.safeParse(code);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Código inválido');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api<MfaConfirmResponse>('/auth/mfa/setup/confirm', {
        method: 'POST',
        body: { code: parsed.data },
      });
      setRecoveryCodes(res.recoveryCodes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos confirmar el código.');
    } finally {
      setLoading(false);
    }
  }

  async function finish() {
    const me = await refreshMe();
    navigate(STEP_ROUTES[me?.next ?? 'DONE'], { replace: true });
  }

  if (recoveryCodes) {
    const text = recoveryCodes.join('\n');
    return (
      <AuthLayout
        title="Guardá tus códigos de recuperación"
        description="Si perdés el celular, cada código te deja entrar una vez. No se van a volver a mostrar."
      >
        <ul
          className="grid grid-cols-2 gap-2 rounded-md bg-bg p-3 font-mono text-sm"
          aria-label="Códigos de recuperación"
        >
          {recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => navigator.clipboard.writeText(text)}>
            <Copy className="size-4" aria-hidden /> Copiar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([text + '\n'], { type: 'text/plain' }));
              const a = Object.assign(document.createElement('a'), {
                href: url,
                download: 'codigos-recuperacion-tli.txt',
              });
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="size-4" aria-hidden /> Descargar
          </Button>
        </div>
        <Checkbox
          className="mt-4"
          label="Guardé los códigos en un lugar seguro"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        <Button className="mt-4 w-full" disabled={!saved} onClick={finish}>
          Continuar
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Configurá la verificación en dos pasos"
      description="Tu rol requiere MFA. Usá Google Authenticator, Microsoft Authenticator o una app compatible."
    >
      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      {!setup ? (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Instalá una app de autenticación en el celular.</li>
            <li>Generá el código QR y escanealo con la app.</li>
            <li>Ingresá el código de 6 dígitos que te muestra la app.</li>
          </ol>
          <Button className="w-full" loading={loading} onClick={generate}>
            Generar código QR
          </Button>
        </div>
      ) : (
        <form onSubmit={confirm} noValidate className="space-y-4">
          <div className="flex flex-col items-center gap-2">
            <img
              src={setup.qrDataUrl}
              alt="Código QR para configurar la app de autenticación"
              className="size-48"
            />
            <details className="w-full text-sm">
              <summary className="cursor-pointer text-primary">No puedo escanear el código</summary>
              <p className="mt-2 text-muted">
                Cargá esta clave a mano en la app (tipo: basada en tiempo):
              </p>
              <code className="mt-1 block break-all rounded bg-bg p-2 font-mono text-xs">
                {setup.secret}
              </code>
            </details>
          </div>
          <Field label="Código de la app">
            {(p) => (
              <Input
                {...p}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                className="text-center font-mono tracking-widest"
              />
            )}
          </Field>
          <Button type="submit" className="w-full" loading={loading}>
            Activar MFA
          </Button>
        </form>
      )}
      <button type="button" className="mt-4 text-sm text-muted hover:underline" onClick={logout}>
        Salir
      </button>
    </AuthLayout>
  );
}
