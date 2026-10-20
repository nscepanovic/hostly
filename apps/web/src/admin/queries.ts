import { useQuery } from '@tanstack/react-query';
import type { AdminActivityDto, AdminMessageDto, AdminOverviewDto, AdminRestaurantDetail, AdminRestaurantRow, AdminUserDto } from '@hostly/shared';
import { api, ApiError } from '@/lib/api';

export const aq = {
  me: ['admin', 'me'] as const,
  overview: ['admin', 'overview'] as const,
  restaurants: ['admin', 'restaurants'] as const,
  restaurant: (id: string) => ['admin', 'restaurant', id] as const,
  activity: (restaurantId?: string) => ['admin', 'activity', restaurantId ?? ''] as const,
  messages: (status?: string, restaurantId?: string) => ['admin', 'messages', status ?? '', restaurantId ?? ''] as const,
};

export function useAdminMe() {
  return useQuery({
    queryKey: aq.me,
    queryFn: async () => {
      try {
        return await api.get<AdminUserDto>('/admin/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: Infinity,
  });
}

// Monitoring screens refresh on their own every 30 s.
const live = { refetchInterval: 30_000 };

export const useOverview = () => useQuery({ queryKey: aq.overview, queryFn: () => api.get<AdminOverviewDto>('/admin/overview'), ...live });
export const useAdminRestaurants = () =>
  useQuery({ queryKey: aq.restaurants, queryFn: () => api.get<AdminRestaurantRow[]>('/admin/restaurants'), ...live });
export const useAdminRestaurant = (id: string) =>
  useQuery({ queryKey: aq.restaurant(id), queryFn: () => api.get<AdminRestaurantDetail>(`/admin/restaurants/${id}`), ...live });
export const useActivity = (restaurantId?: string) =>
  useQuery({ queryKey: aq.activity(restaurantId), queryFn: () => api.get<AdminActivityDto[]>('/admin/activity', { restaurantId, limit: 200 }), ...live });
export const useMessages = (status?: string, restaurantId?: string) =>
  useQuery({
    queryKey: aq.messages(status, restaurantId),
    queryFn: () => api.get<AdminMessageDto[]>('/admin/messages', { status, restaurantId, limit: 200 }),
    ...live,
  });
