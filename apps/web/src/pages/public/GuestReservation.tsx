import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';
import { CalendarCheck, CalendarX, Clock } from 'lucide-react';
import type { PublicReservationView } from '@hostly/shared';
import { Button } from '@/components/ui/Button';
import { api, errorMessage } from '@/lib/api';
import { luxonLocale, setLanguage } from '@/i18n';
import { langInfo } from '@/lib/time';
import { BrandedHeader, BrandedPage } from '@/features/booking/BrandedPage';

/** Guest self-service page linked from emails: /r/:token (?action=confirm|cancel). */
export default function GuestReservationPage() {
  const { token = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const key = ['guest', token];
  const view = useQuery({ queryKey: key, queryFn: () => api.get<PublicReservationView>(`/public/r/${token}`), retry: false });
  const [askCancel, setAskCancel] = useState(params.get('action') === 'cancel');
  const [thanks, setThanks] = useState(false);
  const confirmed = useRef(false);

  // Show the page in the reservation's language (the guest's, not the browser's).
  useEffect(() => {
    if (view.data) setLanguage(view.data.language, false);
  }, [view.data]);

  const cancel = useMutation({
    mutationFn: () => api.post<PublicReservationView>(`/public/r/${token}/cancel`),
    onSuccess: (v) => {
      qc.setQueryData(key, v);
      setAskCancel(false);
      setParams({});
    },
  });
  const confirm = useMutation({
    mutationFn: () => api.post<PublicReservationView>(`/public/r/${token}/confirm`),
    onSuccess: () => setThanks(true),
  });
  useEffect(() => {
    if (params.get('action') === 'confirm' && view.data && !confirmed.current) {
      confirmed.current = true;
      confirm.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.data]);

  const v = view.data;
  const at = v ? DateTime.fromISO(v.arrivalAt).setZone(v.timezone).setLocale(luxonLocale(i18n.language)) : null;
  const statusText =
    v?.status === 'confirmed' || v?.status === 'seated' || v?.status === 'completed'
      ? t('guest.confirmed')
      : v?.status === 'pending'
        ? t('guest.pending')
        : t('guest.cancelled');

  return (
    <BrandedPage branding={v?.branding}>
      {v && <BrandedHeader name={v.restaurantName} subtitle={t('guest.title')} branding={v.branding} />}
      <div className="p-5">
        {view.isLoading && <p className="text-muted">{t('common.loading')}</p>}
        {view.isError && <p>{t('guest.notFound')}</p>}
        {v && at && (
          <>
            <div className="mb-5 flex items-center gap-3 rounded-xl bg-surface-2 p-4">
              {v.status === 'cancelled' || v.status === 'no_show' ? (
                <CalendarX className="shrink-0 text-danger" size={32} />
              ) : v.status === 'pending' ? (
                <Clock className="shrink-0 text-warn" size={32} />
              ) : (
                <CalendarCheck className="shrink-0 text-accent" size={32} />
              )}
              <div>
                <div className="font-semibold">{statusText}</div>
                <div className="text-muted">{t('guest.when', { date: at.toFormat(langInfo(i18n.language).dateLong), time: at.toFormat('HH:mm'), covers: v.covers })}</div>
              </div>
            </div>
            {thanks && <p className="mb-4 font-semibold text-accent">{t('guest.thanks')}</p>}
            {(v.status === 'pending' || v.status === 'confirmed') &&
              (askCancel ? (
                <div className="rounded-xl border border-danger/40 p-4">
                  <p className="mb-3 font-semibold">{t('guest.cancelConfirm')}</p>
                  <div className="flex gap-2">
                    <Button onClick={() => setAskCancel(false)}>{t('common.no')}</Button>
                    <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                      {t('guest.cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  {v.status === 'confirmed' && !thanks && (
                    <Button variant="primary" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
                      {t('guest.confirm')}
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => setAskCancel(true)}>
                    {t('guest.cancel')}
                  </Button>
                </div>
              ))}
            {(cancel.isError || confirm.isError) && <p className="mt-3 text-sm text-danger">{errorMessage(cancel.error ?? confirm.error)}</p>}
          </>
        )}
      </div>
    </BrandedPage>
  );
}
