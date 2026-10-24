import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { AuthNextStep, PermissionKey } from '@tli/shared';
import { STEP_ROUTES, useMe } from '@/lib/auth';
import { Spinner, Alert } from '@/components/ui/misc';

/** Rutas que requieren sesión completa (MFA y contraseña al día). */
export function RequireAuth() {
  const { data: me, isLoading, isError } = useMe();
  const location = useLocation();
  if (isLoading) return <Spinner />;
  if (isError)
    return (
      <div className="p-6">
        <Alert tone="danger" title="No pudimos conectar con el servidor" />
      </div>
    );
  if (!me) return <Navigate to="/ingresar" replace state={{ from: location.pathname }} />;
  if (me.next !== 'DONE') return <Navigate to={STEP_ROUTES[me.next]} replace />;
  return <Outlet />;
}

/** Pantallas intermedias del login: solo se ven si ese es el paso pendiente. */
export function RequireStep({ step, children }: { step: AuthNextStep; children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Spinner />;
  if (!me) return <Navigate to="/ingresar" replace />;
  if (me.next !== step) return <Navigate to={STEP_ROUTES[me.next]} replace />;
  return <>{children}</>;
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionKey;
  children: ReactNode;
}) {
  const { data: me } = useMe();
  if (!me?.permissions.includes(permission)) {
    return <Alert tone="warning" title="No tenés permiso para ver esta sección." />;
  }
  return <>{children}</>;
}
