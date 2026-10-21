import type { ReactNode } from 'react';
import { DEFAULT_BOOKING_THEME, type PublicBranding } from '@hostly/shared';
import { bookingThemeStyle } from '@/lib/bookingTheme';

/**
 * Page in the restaurant's own look: background color, button color, font.
 * A card on tablets and up, full width on phones and inside an iframe.
 */
export function BrandedPage({ branding, embed = false, children }: { branding?: PublicBranding; embed?: boolean; children: ReactNode }) {
  return (
    <div style={bookingThemeStyle(branding?.theme ?? DEFAULT_BOOKING_THEME)} className={`min-h-full bg-bg text-text ${embed ? '' : 'sm:py-8'}`}>
      <div className={`mx-auto w-full max-w-lg overflow-hidden bg-surface ${embed ? '' : 'sm:rounded-2xl sm:border sm:border-border sm:shadow-lg'}`}>
        {children}
      </div>
    </div>
  );
}

/** Cover image, logo and restaurant name at the top of guest pages. */
export function BrandedHeader({
  name,
  subtitle,
  branding,
  actions,
}: {
  name: string;
  subtitle?: string;
  branding?: PublicBranding;
  actions?: ReactNode;
}) {
  const cover = branding?.images.cover;
  const logo = branding?.images.logo;
  return (
    <header>
      {cover && <img src={cover} alt="" className="aspect-[16/7] w-full object-cover" />}
      {/* Buttons wrap under the name on narrow phones instead of squeezing it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pt-4">
        {logo && (
          <img
            src={logo}
            alt=""
            // Overlaps the cover like a profile picture; sits beside the name without one.
            className={`h-16 w-16 shrink-0 rounded-2xl border-4 border-surface bg-surface object-contain shadow-sm ${cover ? '-mt-12 self-start' : ''}`}
          />
        )}
        <div className="min-w-36 flex-1">
          <h1 className="text-2xl leading-tight font-bold break-words">{name}</h1>
          {subtitle && <p className="text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="ml-auto flex shrink-0 gap-1">{actions}</div>}
      </div>
    </header>
  );
}
