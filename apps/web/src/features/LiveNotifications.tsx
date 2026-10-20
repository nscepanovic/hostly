import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import type { WsEventPayloads } from '@hostly/shared';
import { useToasts } from '@/components/ui/Toast';
import { guestName } from '@/lib/day';
import { qk, useRestaurant } from '@/lib/queries';
import { useSocketEvent } from '@/lib/socket';
import { fmtDateTime } from '@/lib/time';
import { luxonLocale } from '@/i18n';
import { useUi } from '@/store/ui';
import { api } from '@/lib/api';

/** Two-tone chime generated with WebAudio (no asset to load, works offline). */
export function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const tone = (freq: number, start: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + 0.55);
    };
    tone(880, 0);
    tone(1320, 0.18);
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    // Audio blocked until the first user interaction; the pop-up still shows.
  }
}

/** Pop-ups for new online requests and free tables that fit someone on the waiting list. */
export function LiveNotifications() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data: restaurant } = useRestaurant();
  const push = useToasts((s) => s.push);
  const { openReservation, setPanelTab } = useUi();

  const onPriority = useCallback(
    ({ reservation: r }: WsEventPayloads['priority.new']) => {
      playChime();
      push({
        kind: 'info',
        duration: 0,
        message: (
          <>
            <b>{t('priority.newRequest')}</b>
            <br />
            {t('priority.newRequestBody', {
              name: guestName(r),
              covers: r.covers,
              when: restaurant ? fmtDateTime(r.arrivalAt, restaurant.timezone, luxonLocale(i18n.language)) : '',
            })}
          </>
        ),
        action: {
          label: t('priority.open'),
          onClick: () => {
            setPanelTab('priority');
            openReservation(r.id);
          },
        },
      });
    },
    [push, t, i18n.language, restaurant, openReservation, setPanelTab],
  );
  useSocketEvent('priority.new', onPriority);

  const onWaiting = useCallback(
    ({ entry, tableIds, labels }: WsEventPayloads['waiting.suggest']) => {
      playChime();
      const mins = Math.round((Date.now() - new Date(entry.createdAt).getTime()) / 60_000);
      push({
        duration: 0,
        message: (
          <>
            <b>{t('waiting.tableFreed', { labels: labels.join(' + ') })}</b>
            <br />
            {t('waiting.fits', { name: entry.guestName, covers: entry.covers, min: mins })}
          </>
        ),
        action: {
          label: t('waiting.seat'),
          onClick: () => {
            void api.patch(`/waiting/${entry.id}`, { status: 'seated', tableIds }).then(() => {
              void qc.invalidateQueries({ queryKey: qk.waiting });
              void qc.invalidateQueries({ queryKey: qk.reservationsAll });
            });
          },
        },
      });
    },
    [push, t, qc],
  );
  useSocketEvent('waiting.suggest', onWaiting);

  return null;
}
