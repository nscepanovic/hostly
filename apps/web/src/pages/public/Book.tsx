import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';
import { Camera, CheckCircle2, Globe, Minus, Plus } from 'lucide-react';
import { FALLBACK_LANGUAGE, isLanguage, pickLanguage, type PublicRestaurantInfo, type PublicSlot } from '@hostly/shared';
import { Button } from '@/components/ui/Button';
import { api, ApiError, errorMessage } from '@/lib/api';
import { luxonLocale, setLanguage } from '@/i18n';
import { LanguageSelect } from '@/components/LanguagePicker';
import { langInfo } from '@/lib/time';
import { BrandedHeader, BrandedPage } from '@/features/booking/BrandedPage';

/** Public booking widget: /book/:slug (add ?embed=1 inside an iframe). */
export default function BookPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const embed = params.get('embed') === '1';
  const { t, i18n } = useTranslation();
  const info = useQuery({ queryKey: ['public', slug], queryFn: () => api.get<PublicRestaurantInfo>(`/public/${slug}`), retry: false });
  const r = info.data;
  const [date, setDate] = useState('');
  const [covers, setCovers] = useState(2);
  const [time, setTime] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', notes: '', website: '' });
  const [done, setDone] = useState(false);

  // Guests see the page in their browser language when it is one we support (?lang= overrides).
  useEffect(() => {
    const fromUrl = params.get('lang');
    setLanguage(isLanguage(fromUrl) ? fromUrl : (pickLanguage(navigator.languages ?? [navigator.language]) ?? FALLBACK_LANGUAGE), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (r && !date) setDate(DateTime.now().setZone(r.timezone).toISODate()!);
  }, [r, date]);

  const days = useMemo(() => {
    if (!r) return [];
    const today = DateTime.now().setZone(r.timezone).startOf('day');
    return Array.from({ length: Math.min(r.daysAhead + 1, 21) }, (_, i) => today.plus({ days: i }));
  }, [r]);

  const slots = useQuery({
    queryKey: ['public-slots', slug, date, covers],
    queryFn: () => api.get<PublicSlot[]>(`/public/${slug}/availability`, { date, covers }),
    enabled: !!r?.enabled && !!date,
  });
  useEffect(() => setTime(''), [date, covers]);

  const book = useMutation({
    mutationFn: () =>
      api.post(`/public/${slug}/book`, {
        date,
        time,
        covers,
        ...form,
        notes: form.notes || undefined,
        website: form.website || undefined,
        language: isLanguage(i18n.language) ? i18n.language : r!.defaultLanguage,
      }),
    onSuccess: () => setDone(true),
    onError: () => void slots.refetch(),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    book.mutate();
  };

  const shell = (children: React.ReactNode, header?: React.ReactNode) => (
    <BrandedPage branding={r?.branding} embed={embed}>
      {header}
      <div className="p-5">{children}</div>
    </BrandedPage>
  );

  if (info.isLoading) return shell(<p className="text-muted">{t('common.loading')}</p>);
  if (!r) return shell(<p>{t('guest.notFound')}</p>);

  const header = (
    <BrandedHeader
      name={r.name}
      subtitle={t('book.title')}
      branding={r.branding}
      actions={
        <>
          {r.instagramUrl && (
            <a href={r.instagramUrl} target="_blank" rel="noreferrer" className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-2" aria-label="Instagram">
              <Camera size={20} />
            </a>
          )}
          {r.websiteUrl && (
            <a href={r.websiteUrl} target="_blank" rel="noreferrer" className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-2" aria-label="Website">
              <Globe size={20} />
            </a>
          )}
          <LanguageSelect persist={false} className="h-11" />
        </>
      }
    />
  );
  const intro = r.intro && <p className="mb-5 text-sm whitespace-pre-line">{r.intro}</p>;

  if (!r.enabled) return shell(<>{intro}<p>{t('book.closed')}</p></>, header);

  if (done) {
    return shell(
      <>
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircle2 size={56} className="text-accent" />
          <h2 className="mt-3 text-xl font-bold">{t('book.sent')}</h2>
          <p className="mt-2 text-muted">{t('book.sentBody')}</p>
          <p className="mt-3 font-semibold">
            {DateTime.fromISO(date).setLocale(luxonLocale(i18n.language)).toFormat(langInfo(i18n.language).dateLong)} · {time} · {covers}
          </p>
          <Button
            className="mt-6"
            onClick={() => {
              setDone(false);
              setTime('');
              book.reset();
            }}
          >
            {t('book.another')}
          </Button>
        </div>
      </>,
      header,
    );
  }

  const available = (slots.data ?? []).filter((s) => s.available);
  const conflict = book.error instanceof ApiError && book.error.status === 409;

  return shell(
    <>
      {intro}
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div>
          <span className="label">{t('book.guests')}</span>
          <div className="flex h-12 items-center gap-3">
            <button type="button" className="h-12 w-12 rounded-xl bg-surface-2" onClick={() => setCovers((c) => Math.max(1, c - 1))} aria-label="-">
              <Minus className="mx-auto" size={20} />
            </button>
            <span className="w-10 text-center text-2xl font-bold tabular-nums">{covers}</span>
            <button
              type="button"
              className="h-12 w-12 rounded-xl bg-surface-2"
              onClick={() => setCovers((c) => Math.min(r.maxPartySize, c + 1))}
              aria-label="+"
            >
              <Plus className="mx-auto" size={20} />
            </button>
            {covers >= r.maxPartySize && <span className="text-sm text-muted">{t('book.largeParty')}</span>}
          </div>
        </div>

        <div>
          <span className="label">{t('book.date')}</span>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {days.map((d) => {
              const iso = d.toISODate()!;
              const blocked = r.blockedDates.includes(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={blocked}
                  onClick={() => setDate(iso)}
                  className={`flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-xl border text-sm ${
                    iso === date ? 'border-accent bg-accent text-accent-ink' : 'border-border bg-surface-2'
                  } disabled:opacity-30`}
                >
                  <span className="text-xs uppercase">{d.setLocale(luxonLocale(i18n.language)).toFormat('ccc')}</span>
                  <span className="text-lg font-bold">{d.day}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="label">{t('book.time')}</span>
          {slots.isLoading ? (
            <p className="text-muted">{t('common.loading')}</p>
          ) : available.length === 0 ? (
            <p className="text-muted">{t('book.noSlots')}</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {available.map((s) => (
                <button
                  key={s.time}
                  type="button"
                  onClick={() => setTime(s.time)}
                  className={`h-11 rounded-lg text-[15px] font-semibold tabular-nums ${s.time === time ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}
                >
                  {s.time}
                </button>
              ))}
            </div>
          )}
        </div>

        {time && (
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label">{t('book.firstName')}</span>
              <input className="field" required autoComplete="given-name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </label>
            <label>
              <span className="label">{t('book.lastName')}</span>
              <input className="field" required autoComplete="family-name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </label>
            <label className="col-span-2 sm:col-span-1">
              <span className="label">{t('book.phone')}</span>
              <input className="field" required type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="col-span-2 sm:col-span-1">
              <span className="label">{t('book.email')}</span>
              <input className="field" required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="col-span-2">
              <span className="label">{t('book.notes')}</span>
              <textarea className="field" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            {/* Honeypot: hidden from people, filled by bots. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
            {book.isError && <p className="col-span-2 text-sm text-danger">{conflict ? t('book.noSlots') : errorMessage(book.error)}</p>}
            <Button type="submit" variant="primary" size="lg" className="col-span-2" disabled={book.isPending}>
              {t('book.submit')}
            </Button>
            <p className="col-span-2 text-center text-xs text-muted">{t('book.privacy')}</p>
          </div>
        )}
      </form>
    </>,
    header,
  );
}
