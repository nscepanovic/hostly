import { useQuery } from '@tanstack/react-query';
import type {
  AreaDto,
  JoinGroupDto,
  ReservationDto,
  RestaurantDto,
  TableDto,
  TagDto,
  UserDto,
  WaitingEntryDto,
} from '@hostly/shared';
import { useUi } from '@/store/ui';
import { api, ApiError } from './api';
import { todayBusinessDate } from './time';

export const qk = {
  me: ['me'] as const,
  restaurant: ['restaurant'] as const,
  areas: ['areas'] as const,
  tables: ['tables'] as const,
  joinGroups: ['join-groups'] as const,
  tags: ['tags'] as const,
  reservations: (date: string) => ['reservations', date] as const,
  reservationsAll: ['reservations'] as const,
  reservation: (id: string) => ['reservation', id] as const,
  priority: ['priority'] as const,
  waiting: ['waiting'] as const,
  customers: ['customers'] as const,
  customer: (id: string) => ['customer', id] as const,
  pace: (date: string) => ['pace', date] as const,
  users: ['users'] as const,
};

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        return await api.get<UserDto>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: Infinity,
  });
}

export const useRestaurant = () =>
  useQuery({ queryKey: qk.restaurant, queryFn: () => api.get<RestaurantDto>('/restaurant'), staleTime: 5 * 60_000 });
export const useAreas = () => useQuery({ queryKey: qk.areas, queryFn: () => api.get<AreaDto[]>('/areas'), staleTime: 5 * 60_000 });
export const useTables = () => useQuery({ queryKey: qk.tables, queryFn: () => api.get<TableDto[]>('/tables'), staleTime: 5 * 60_000 });
export const useJoinGroups = () =>
  useQuery({ queryKey: qk.joinGroups, queryFn: () => api.get<JoinGroupDto[]>('/join-groups'), staleTime: 5 * 60_000 });
export const useTags = () => useQuery({ queryKey: qk.tags, queryFn: () => api.get<TagDto[]>('/tags'), staleTime: 5 * 60_000 });

/** The business date currently viewed (falls back to today in the restaurant timezone). */
export function useViewDate(): string | null {
  const date = useUi((s) => s.date);
  const { data: r } = useRestaurant();
  if (date) return date;
  return r ? todayBusinessDate(r) : null;
}

export function useReservations(date: string | null) {
  return useQuery({
    queryKey: qk.reservations(date ?? ''),
    queryFn: () => api.get<ReservationDto[]>('/reservations', { date: date! }),
    enabled: !!date,
  });
}

export const usePriority = () =>
  useQuery({ queryKey: qk.priority, queryFn: () => api.get<ReservationDto[]>('/reservations/priority') });

export const useWaiting = () => useQuery({ queryKey: qk.waiting, queryFn: () => api.get<WaitingEntryDto[]>('/waiting') });
