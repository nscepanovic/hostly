import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { normalizePhone, type CustomerDto } from '@hostly/shared';
import { api } from '@/lib/api';

/** Looks up a customer by phone once the typed number is a complete, valid number. */
export function useCustomerLookup(phone: string, enabled: boolean) {
  const [debounced, setDebounced] = useState(phone);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(phone), 300);
    return () => clearTimeout(id);
  }, [phone]);
  const normalized = normalizePhone(debounced);
  return useQuery({
    queryKey: ['customer-lookup', normalized],
    queryFn: () => api.get<CustomerDto | null>('/customers/lookup', { phone: normalized! }),
    enabled: enabled && !!normalized,
    staleTime: 60_000,
  });
}
