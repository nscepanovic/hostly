const KEY = 'hostly-device';
let cached: string | null = null;

/**
 * Stable id of this browser/tablet. The server uses it to skip push for
 * devices that have Hostly on screen (they get the in-app pop-up instead).
 */
export function deviceId(): string {
  if (cached) return cached;
  try {
    cached = localStorage.getItem(KEY);
    if (!cached) {
      cached = crypto.randomUUID();
      localStorage.setItem(KEY, cached);
    }
  } catch {
    cached ??= crypto.randomUUID();
  }
  return cached;
}
