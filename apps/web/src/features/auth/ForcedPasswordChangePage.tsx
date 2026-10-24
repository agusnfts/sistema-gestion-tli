import { useNavigate } from 'react-router';
import { STEP_ROUTES, useRefreshMe } from '@/lib/auth';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { ChangePasswordForm } from './ChangePasswordForm';
import { useLogout } from './useLogout';

export function ForcedPasswordChangePage() {
  const refreshMe = useRefreshMe();
  const navigate = useNavigate();
  const logout = useLogout();
  return (
    <AuthLayout
      title="Elegí tu contraseña"
      description="Estás usando una contraseña temporal. Antes de seguir, elegí una propia."
    >
      <ChangePasswordForm
        currentLabel="Contraseña temporal"
        submitLabel="Guardar y continuar"
        onDone={async () => {
          const me = await refreshMe();
          navigate(STEP_ROUTES[me?.next ?? 'DONE'], { replace: true });
        }}
      />
      <button type="button" className="mt-4 text-sm text-muted hover:underline" onClick={logout}>
        Salir
      </button>
    </AuthLayout>
  );
}
