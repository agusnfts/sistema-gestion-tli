import { useQuery } from '@tanstack/react-query';
import type { UserRef } from '@tli/shared';
import { api } from '@/lib/api';

/** Nombre de una persona de IT por id (para mostrar un filtro de responsable). */
export function useStaffName(id: string): string {
  const staff = useQuery({
    queryKey: ['tickets', 'assignees'],
    queryFn: () => api<UserRef[]>('/tickets/assignees'),
    enabled: !!id,
  });
  return staff.data?.find((u) => u.id === id)?.fullName ?? 'seleccionado';
}
