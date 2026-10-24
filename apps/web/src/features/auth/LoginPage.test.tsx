import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { LoginPage } from './LoginPage';

type Route = { status: number; body?: unknown };

// El cliente cachea el token CSRF a nivel módulo: todos los tests usan el mismo.
const CSRF = 'csrf-123';

function mockFetch(routes: Record<string, Route | Route[]>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const key = Object.keys(routes).find((k) => url.startsWith(k));
      const entry = key ? routes[key]! : { status: 404 };
      const r = Array.isArray(entry) ? (entry.length > 1 ? entry.shift()! : entry[0]!) : entry;
      return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
        status: r.status,
      });
    }),
  );
  return calls;
}

function renderLogin() {
  const router = createMemoryRouter(
    [
      { path: '/ingresar', element: <LoginPage /> },
      { path: '/', element: <p>Inicio</p> },
      { path: '/ingresar/verificacion', element: <p>Pantalla MFA</p> },
    ],
    { initialEntries: ['/ingresar'] },
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('valida el email antes de llamar a la API', async () => {
    const calls = mockFetch({ '/api/auth/me': { status: 401, body: {} } });
    renderLogin();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'no-es-email');
    await user.type(screen.getByLabelText('Contraseña'), 'algo');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Ingresá un email válido')).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/auth/login')).toBe(false);
  });

  it('muestra el error genérico del servidor', async () => {
    mockFetch({
      '/api/auth/me': { status: 401, body: {} },
      '/api/auth/csrf': { status: 200, body: { token: CSRF } },
      '/api/auth/login': {
        status: 401,
        body: { statusCode: 401, message: 'No pudimos iniciar sesión.' },
      },
    });
    renderLogin();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'persona@tml.com.ar');
    await user.type(screen.getByLabelText('Contraseña'), 'incorrecta');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos iniciar sesión.');
  });

  it('envía el token CSRF y lleva al paso de MFA cuando corresponde', async () => {
    const me = {
      id: '1',
      email: 'it@tml.com.ar',
      fullName: 'IT',
      roles: [],
      permissions: [],
      mfaRequired: true,
      mfaEnabled: true,
      next: 'MFA_VERIFY',
    };
    const calls = mockFetch({
      '/api/auth/me': [
        { status: 401, body: {} },
        { status: 200, body: me },
      ],
      '/api/auth/csrf': { status: 200, body: { token: CSRF } },
      '/api/auth/login': { status: 200, body: { next: 'MFA_VERIFY' } },
    });
    renderLogin();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'it@tml.com.ar');
    await user.type(screen.getByLabelText('Contraseña'), 'una clave cualquiera');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Pantalla MFA')).toBeInTheDocument();
    const login = calls.find((c) => c.url === '/api/auth/login');
    expect((login?.init?.headers as Record<string, string>)['X-CSRF-Token']).toBe(CSRF);
  });
});
