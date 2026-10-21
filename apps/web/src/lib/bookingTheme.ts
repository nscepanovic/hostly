import type { CSSProperties } from 'react';
import type { BookingFont, BookingTheme } from '@hostly/shared';

/** Hostly's own booking page colors (the light theme), used when the owner picks none. */
export const DEFAULT_BACKGROUND = '#f3f5fa';
export const DEFAULT_ACCENT = '#0d9488';

const DARK_TEXT = '#111827';
const LIGHT_TEXT = '#f8fafc';

/** System font stacks: nothing extra is downloaded on the guest's phone. */
export const FONT_STACKS: Record<BookingFont, string> = {
  modern: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  classic: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
  friendly: "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Varela Round', 'Trebuchet MS', system-ui, sans-serif",
};

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance. */
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (none) to 21 (black on white). */
export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Dark or light text, whichever reads better on `bg`. */
export const inkFor = (bg: string) => (contrastRatio(bg, DARK_TEXT) >= contrastRatio(bg, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT);

export const isDarkColor = (bg: string) => inkFor(bg) === LIGHT_TEXT;

/**
 * CSS variables that re-skin the shared design tokens (bg, surface, text, accent...)
 * for one booking page. Surfaces and borders are mixed from the background so any
 * color the owner picks gets a matching, readable palette.
 */
export function bookingThemeStyle(theme: BookingTheme): CSSProperties {
  const bg = theme.backgroundColor ?? DEFAULT_BACKGROUND;
  const accent = theme.accentColor ?? DEFAULT_ACCENT;
  const dark = isDarkColor(bg);
  const text = dark ? LIGHT_TEXT : DARK_TEXT;
  const tint = dark ? '#ffffff' : '#000000';
  const mix = (pct: number, other = tint) => `color-mix(in srgb, ${bg}, ${other} ${pct}%)`;
  return {
    '--color-bg': bg,
    // The card: lifted off the page (whiter on light pages, lighter on dark ones).
    '--color-surface': dark ? mix(7) : mix(70, '#ffffff'),
    '--color-surface-2': dark ? mix(13) : mix(5),
    '--color-surface-3': dark ? mix(19) : mix(10),
    '--color-border': dark ? mix(24) : mix(14),
    '--color-text': text,
    '--color-muted': `color-mix(in srgb, ${text} 68%, ${bg})`,
    '--color-accent': accent,
    '--color-accent-ink': inkFor(accent),
    '--font-sans': FONT_STACKS[theme.font],
    colorScheme: dark ? 'dark' : 'light',
    fontFamily: FONT_STACKS[theme.font],
  } as CSSProperties;
}

/**
 * Buttons and selected dates must stand out from the card. Below 3:1 (WCAG for
 * large text and UI parts) the owner gets a warning in settings.
 */
export function accentContrast(theme: BookingTheme) {
  const bg = theme.backgroundColor ?? DEFAULT_BACKGROUND;
  return contrastRatio(theme.accentColor ?? DEFAULT_ACCENT, bg);
}
