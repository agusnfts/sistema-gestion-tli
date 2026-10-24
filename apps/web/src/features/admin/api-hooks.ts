import { useQuery } from '@tanstack/react-query';
import type { CatalogItem, CatalogKind, RoleItem } from '@tli/shared';
import { api } from '@/lib/api';

export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => api<RoleItem[]>('/roles') });
}

export function useCatalog(kind: CatalogKind, includeInactive = false) {
  return useQuery({
    queryKey: ['catalogs', kind, includeInactive],
    queryFn: () => api<CatalogItem[]>(`/catalogs/${kind}`, { query: { includeInactive } }),
  });
}
