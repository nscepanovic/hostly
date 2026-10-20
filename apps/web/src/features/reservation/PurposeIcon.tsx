import { Utensils, Wine } from 'lucide-react';
import type { Purpose } from '@hostly/shared';

/** Food, drink, or both (fork and glass side by side). */
export function PurposeIcon({ purpose, size = 14 }: { purpose: Purpose; size?: number }) {
  if (purpose === 'drink') return <Wine size={size} />;
  if (purpose === 'food_drink') {
    return (
      <span className="inline-flex items-center">
        <Utensils size={size} />
        <Wine size={size} className="-ml-0.5" />
      </span>
    );
  }
  return <Utensils size={size} />;
}
