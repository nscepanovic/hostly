import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ReservationDto, ReservationStatus, TableSuggestion } from '@hostly/shared';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/queries';
import { toast } from '@/components/ui/Toast';
import { guestName } from '@/lib/day';
import { useReceiptUi } from '@/store/receipts';

/** Patches every cached day list with a changed reservation so the UI updates before the refetch. */
function useApplyReservation() {
  const qc = useQueryClient();
  return (r: ReservationDto) => {
    qc.setQueriesData<ReservationDto[]>({ queryKey: qk.reservationsAll }, (list) =>
      list?.map((x) => (x.id === r.id ? r : x)),
    );
    qc.setQueryData(qk.reservation(r.id), r);
    void qc.invalidateQueries({ queryKey: qk.reservationsAll });
    void qc.invalidateQueries({ queryKey: qk.priority });
    void qc.invalidateQueries({ queryKey: ['pace'] });
  };
}

export function useReservationActions() {
  const { t } = useTranslation();
  const apply = useApplyReservation();
  const onError = (err: unknown) => toast.error(errorMessage(err));

  const status = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: ReservationStatus; reason?: string }) =>
      api.post<ReservationDto>(`/reservations/${id}/status`, { status, reason }),
    onSuccess: (r) => {
      apply(r);
      toast.success(`${t(`status.${r.status}`)} · ${r.lastName ?? r.firstName ?? ''}`);
      // The guest has paid: offer to scan the fiscal receipt now.
      if (r.status === 'completed') useReceiptUi.getState().ask({ reservationId: r.id, guestName: guestName(r) });
    },
    onError,
  });

  const move = useMutation({
    mutationFn: ({ id, tableIds, arrivalAt, departureAt }: { id: string; tableIds: string[]; arrivalAt?: string; departureAt?: string }) =>
      api.post<ReservationDto>(`/reservations/${id}/move`, { tableIds, arrivalAt, departureAt }),
    onSuccess: apply,
    onError,
  });

  const accept = useMutation({
    mutationFn: ({ id, tableIds }: { id: string; tableIds: string[] }) => api.post<ReservationDto>(`/reservations/${id}/accept`, { tableIds }),
    onSuccess: (r) => {
      apply(r);
      toast.success(t('status.confirmed'));
    },
    onError,
  });

  const decline = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => api.post<ReservationDto>(`/reservations/${id}/decline`, { reason }),
    onSuccess: apply,
    onError,
  });

  return { status, move, accept, decline };
}

export function fetchSuggestions(r: Pick<ReservationDto, 'arrivalAt' | 'departureAt' | 'covers' | 'customerId' | 'areaId'> & { id?: string }) {
  return api.get<TableSuggestion[]>('/reservations/suggest', {
    arrivalAt: r.arrivalAt,
    departureAt: r.departureAt,
    covers: r.covers,
    customerId: r.customerId ?? undefined,
    excludeReservationId: r.id,
  });
}
