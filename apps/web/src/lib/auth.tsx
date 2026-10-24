import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthNextStep, MeResponse, PermissionKey } from '@tli/shared';
import { api, ApiError } from './api';

export const ME_KEY = ['auth', 'me'] as const;

/** Usuario actual. null = sin sesión. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async (): Promise<MeResponse | null> => {
      try {
        return await api<MeResponse>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useHasPermission(): (p: PermissionKey) => boolean {
  const { data } = useMe();
  return (p) => !!data?.permissions.includes(p);
}

export function useRefreshMe(): () => Promise<MeResponse | null | undefined> {
  const qc = useQueryClient();
  return async () => {
    await qc.invalidateQueries({ queryKey: ME_KEY });
    return qc.getQueryData<MeResponse | null>(ME_KEY);
  };
}

export const STEP_ROUTES: Record<AuthNextStep, string> = {
  MFA_VERIFY: '/ingresar/verificacion',
  MFA_SETUP: '/ingresar/configurar-mfa',
  CHANGE_PASSWORD: '/ingresar/cambiar-contrasena',
  DONE: '/',
};
