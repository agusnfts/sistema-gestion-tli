import { createBrowserRouter, Link, Navigate, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { ME_KEY } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { RequireAuth, RequirePermission, RequireStep } from '@/components/guards';
import { LoginPage } from '@/features/auth/LoginPage';
import { MfaVerifyPage } from '@/features/auth/MfaVerifyPage';
import { MfaSetupPage } from '@/features/auth/MfaSetupPage';
import { ForcedPasswordChangePage } from '@/features/auth/ForcedPasswordChangePage';
import { HomePage } from '@/features/home/HomePage';
import { AccountPage } from '@/features/account/AccountPage';
import { UsersPage } from '@/features/admin/UsersPage';
import { RolesPage } from '@/features/admin/RolesPage';
import { CatalogsPage } from '@/features/admin/CatalogsPage';
import { AuditPage } from '@/features/admin/AuditPage';
import { SettingsPage } from '@/features/admin/SettingsPage';
import { NewTicketPage } from '@/features/tickets/NewTicketPage';
import { MyTicketsPage } from '@/features/tickets/MyTicketsPage';
import { TicketsInboxPage } from '@/features/tickets/TicketsInboxPage';
import { TicketDetailPage } from '@/features/tickets/TicketDetailPage';
import { ProblemsPage } from '@/features/problems/ProblemsPage';
import { ProblemDetailPage } from '@/features/problems/ProblemDetailPage';
import { useHasPermission } from '@/lib/auth';

/** Admin e IT empiezan en Inicio; el usuario común, en "Mis tickets". */
function HomeRoute() {
  const can = useHasPermission();
  return can('dashboard.view') ? <HomePage /> : <Navigate to="/mis-tickets" replace />;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

// Si cualquier request devuelve 401 (sesión expirada o revocada), se vuelve al login.
queryClient.getQueryCache().subscribe((event) => {
  const error = event.query.state.error;
  if (event.type === 'updated' && error instanceof ApiError && error.status === 401) {
    queryClient.setQueryData(ME_KEY, null);
  }
});

const router = createBrowserRouter([
  { path: '/ingresar', element: <LoginPage /> },
  {
    path: '/ingresar/verificacion',
    element: (
      <RequireStep step="MFA_VERIFY">
        <MfaVerifyPage />
      </RequireStep>
    ),
  },
  {
    path: '/ingresar/configurar-mfa',
    element: (
      <RequireStep step="MFA_SETUP">
        <MfaSetupPage />
      </RequireStep>
    ),
  },
  {
    path: '/ingresar/cambiar-contrasena',
    element: (
      <RequireStep step="CHANGE_PASSWORD">
        <ForcedPasswordChangePage />
      </RequireStep>
    ),
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomeRoute /> },
          {
            path: 'mis-tickets',
            element: (
              <RequirePermission permission="ticket.read.own">
                <MyTicketsPage />
              </RequirePermission>
            ),
          },
          {
            path: 'tickets',
            element: (
              <RequirePermission permission="ticket.read.all">
                <TicketsInboxPage />
              </RequirePermission>
            ),
          },
          {
            path: 'tickets/nuevo',
            element: (
              <RequirePermission permission="ticket.create">
                <NewTicketPage />
              </RequirePermission>
            ),
          },
          { path: 'tickets/:id', element: <TicketDetailPage /> },
          {
            path: 'problemas',
            element: (
              <RequirePermission permission="problem.read">
                <ProblemsPage />
              </RequirePermission>
            ),
          },
          {
            path: 'problemas/:id',
            element: (
              <RequirePermission permission="problem.read">
                <ProblemDetailPage />
              </RequirePermission>
            ),
          },
          {
            path: 'admin/configuracion',
            element: (
              <RequirePermission permission="settings.manage">
                <SettingsPage />
              </RequirePermission>
            ),
          },
          { path: 'mi-cuenta', element: <AccountPage /> },
          {
            path: 'admin/usuarios',
            element: (
              <RequirePermission permission="user.manage">
                <UsersPage />
              </RequirePermission>
            ),
          },
          {
            path: 'admin/roles',
            element: (
              <RequirePermission permission="role.manage">
                <RolesPage />
              </RequirePermission>
            ),
          },
          {
            path: 'admin/catalogos',
            element: (
              <RequirePermission permission="catalog.manage">
                <CatalogsPage />
              </RequirePermission>
            ),
          },
          {
            path: 'admin/auditoria',
            element: (
              <RequirePermission permission="audit.read">
                <AuditPage />
              </RequirePermission>
            ),
          },
          {
            path: '*',
            element: (
              <div className="py-12 text-center">
                <p className="text-lg font-semibold">Página no encontrada</p>
                <Link to="/" className="mt-2 inline-block text-primary hover:underline">
                  Volver al inicio
                </Link>
              </div>
            ),
          },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
