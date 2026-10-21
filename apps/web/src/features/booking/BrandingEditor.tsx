import { useRef, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, ImagePlus, Minus, Plus, Trash2 } from 'lucide-react';
import { BOOKING_FONTS, type BookingTheme, type BrandingImage, type RestaurantDto } from '@hostly/shared';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { accentContrast, bookingThemeStyle, DEFAULT_ACCENT, DEFAULT_BACKGROUND, FONT_STACKS, inkFor } from '@/lib/bookingTheme';
import { qk } from '@/lib/queries';
import { resizeImage } from '@/lib/resizeImage';
import { BrandedHeader } from './BrandedPage';

const BACKGROUNDS = ['#f6f1e7', '#efe6d8', '#e7efe9', '#e8eff8', '#f8ebec', '#ffffff', '#1f2328', '#0f1b2d', '#13261f', '#2a1218'];
const ACCENTS = ['#047857', '#1d4ed8', '#4338ca', '#9f1239', '#c2410c', '#b45309', '#111111', '#e8c37a'];

/** Upload sizes: the cover is shown up to ~520px wide (2x for sharp screens), the logo at 64px. */
const IMAGE_SIZE: Record<BrandingImage, Parameters<typeof resizeImage>[1]> = {
  cover: { maxWidth: 1600, maxHeight: 1000, type: 'image/jpeg', quality: 0.85 },
  logo: { maxWidth: 512, maxHeight: 512, type: 'image/png' },
};

/** Booking page look: cover, logo, colors, font, with a live preview. */
export function BrandingEditor({ restaurant, theme, onChange }: { restaurant: RestaurantDto; theme: BookingTheme; onChange: (t: BookingTheme) => void }) {
  const { t } = useTranslation();
  const lowContrast = accentContrast(theme) < 3;
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-5">
        <p className="text-sm text-muted">{t('online.appearanceHint')}</p>
        <ImageField kind="cover" restaurant={restaurant} label={t('online.coverImage')} hint={t('online.coverHint')} />
        <ImageField kind="logo" restaurant={restaurant} label={t('online.logo')} hint={t('online.logoHint')} />

        <ColorField
          label={t('online.backgroundColor')}
          value={theme.backgroundColor}
          fallback={DEFAULT_BACKGROUND}
          presets={BACKGROUNDS}
          onChange={(backgroundColor) => onChange({ ...theme, backgroundColor })}
        />
        <ColorField
          label={t('online.accentColor')}
          value={theme.accentColor}
          fallback={DEFAULT_ACCENT}
          presets={ACCENTS}
          onChange={(accentColor) => onChange({ ...theme, accentColor })}
        />
        {lowContrast && (
          <p role="alert" className="-mt-3 flex items-start gap-2 rounded-lg bg-warn/15 px-3 py-2 text-sm text-warn">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {t('online.lowContrast')}
          </p>
        )}

        <div>
          <span className="label">{t('online.font')}</span>
          <div className="grid grid-cols-3 gap-2">
            {BOOKING_FONTS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={theme.font === f}
                onClick={() => onChange({ ...theme, font: f })}
                style={{ fontFamily: FONT_STACKS[f] }}
                className={`flex h-14 flex-col items-center justify-center rounded-lg border text-[15px] ${
                  theme.font === f ? 'border-accent bg-accent/10 font-semibold' : 'border-border bg-surface-2'
                }`}
              >
                <span className="text-lg leading-none">Aa</span>
                <span className="text-xs">{t(`online.fonts.${f}`)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <span className="label">{t('online.preview')}</span>
        <div className="md:sticky md:top-3">
          <BookingPreview restaurant={restaurant} theme={theme} />
        </div>
      </div>
    </div>
  );
}

function ImageField({ kind, restaurant, label, hint }: { kind: BrandingImage; restaurant: RestaurantDto; label: string; hint: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const url = restaurant.images[kind];
  const done = (r: RestaurantDto, message: string) => {
    qc.setQueryData(qk.restaurant, r);
    toast.success(message);
  };
  const upload = useMutation({
    mutationFn: async (file: File) => api.upload<RestaurantDto>(`/restaurant/images/${kind}`, await resizeImage(file, IMAGE_SIZE[kind]), `${kind}.${kind === 'logo' ? 'png' : 'jpg'}`),
    onSuccess: (r) => done(r, t('online.imageSaved')),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete<RestaurantDto>(`/restaurant/images/${kind}`),
    onSuccess: (r) => done(r, t('online.imageRemoved')),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const busy = upload.isPending || remove.isPending;

  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label={url ? t('online.change') : t('online.upload')}
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-surface-2 text-muted ${
            kind === 'cover' ? 'aspect-[16/7] w-40 sm:w-48' : 'h-16 w-16'
          } ${busy ? 'animate-pulse' : ''}`}
        >
          {url ? <img src={url} alt="" className={`h-full w-full ${kind === 'cover' ? 'object-cover' : 'object-contain'}`} /> : <ImagePlus size={22} />}
        </button>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs text-muted">{hint}</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
              {url ? t('online.change') : t('online.upload')}
            </Button>
            {url && (
              <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} disabled={busy} onClick={() => remove.mutate()}>
                {t('online.remove')}
              </Button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) upload.mutate(file);
        }}
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  fallback,
  presets,
  onChange,
}: {
  label: string;
  value: string | null;
  fallback: string;
  presets: string[];
  onChange: (v: string | null) => void;
}) {
  const { t } = useTranslation();
  const custom = value !== null && !presets.includes(value);
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <Swatch color={fallback} selected={value === null} label={t('common.default')} onClick={() => onChange(null)}>
          <span className="text-[10px] font-bold">A</span>
        </Swatch>
        {presets.map((c) => (
          <Swatch key={c} color={c} selected={value === c} label={c} onClick={() => onChange(c)} />
        ))}
        <label
          className={`relative flex h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm ${custom ? 'border-accent ring-2 ring-accent/30' : 'border-border'}`}
        >
          <span className="h-5 w-5 rounded-full border border-border" style={{ background: value ?? fallback }} />
          {t('online.customColor')}
          <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={value ?? fallback} onChange={(e) => onChange(e.target.value)} />
        </label>
      </div>
    </div>
  );
}

function Swatch({ color, selected, label, onClick, children }: { color: string; selected: boolean; label: string; onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      style={{ background: color, color: inkFor(color) }}
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-border ${selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''}`}
    >
      {selected ? <Check size={16} /> : children}
    </button>
  );
}

/** A small, non-interactive copy of the booking page in the chosen look. */
function BookingPreview({ restaurant, theme }: { restaurant: RestaurantDto; theme: BookingTheme }) {
  const { t } = useTranslation();
  const branding = { theme, images: restaurant.images };
  return (
    <div style={bookingThemeStyle(theme)} className="pointer-events-none rounded-2xl border border-border bg-bg p-3 text-text select-none" aria-hidden="true">
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <BrandedHeader name={restaurant.name} subtitle={t('book.title')} branding={branding} />
        <div className="flex flex-col gap-3 p-4">
          {restaurant.onlineSettings.intro && <p className="line-clamp-2 text-xs whitespace-pre-line">{restaurant.onlineSettings.intro}</p>}
          <div>
            <span className="label">{t('book.guests')}</span>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2"><Minus size={16} /></span>
              <span className="w-6 text-center text-lg font-bold">2</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2"><Plus size={16} /></span>
            </div>
          </div>
          <div className="flex gap-1.5">
            {[14, 15, 16, 17, 18].map((d, i) => (
              <span key={d} className={`flex h-12 w-10 flex-col items-center justify-center rounded-lg border text-xs ${i === 1 ? 'border-accent bg-accent text-accent-ink' : 'border-border bg-surface-2'}`}>
                <span className="text-sm font-bold">{d}</span>
              </span>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {['19:00', '19:15', '19:30', '19:45'].map((time, i) => (
              <span key={time} className={`flex h-8 items-center justify-center rounded-md text-xs font-semibold ${i === 2 ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}>
                {time}
              </span>
            ))}
          </div>
          <span className="flex h-10 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accent-ink">{t('book.submit')}</span>
        </div>
      </div>
    </div>
  );
}
