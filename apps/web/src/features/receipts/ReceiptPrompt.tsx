import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ReceiptText, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { useReceiptUi } from '@/store/receipts';

/** How long the "scan the receipt?" offer stays after finishing a table. */
const PROMPT_MS = 20_000;

/**
 * Offered right after a table is marked finished: scanning now is the common
 * case; "Later" leaves it for the reservation's history.
 */
export function ReceiptPrompt() {
  const { t } = useTranslation();
  const prompt = useReceiptUi((s) => s.prompt);
  const dismiss = useReceiptUi((s) => s.dismiss);
  const openScanner = useReceiptUi((s) => s.openScanner);
  useEffect(() => {
    if (!prompt) return;
    const id = setTimeout(dismiss, PROMPT_MS);
    return () => clearTimeout(id);
  }, [prompt, dismiss]);
  if (!prompt) return null;
  return (
    <div className="safe-bottom fixed inset-x-3 bottom-20 z-[70] mx-auto max-w-md md:bottom-4" role="dialog" aria-label={t('receipts.promptTitle')}>
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-2xl">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <ReceiptText size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{t('receipts.promptTitle')}</div>
          {prompt.guestName && <div className="truncate text-sm text-muted">{prompt.guestName}</div>}
        </div>
        <Button variant="primary" onClick={() => openScanner(prompt)}>
          {t('receipts.scan')}
        </Button>
        <IconButton label={t('receipts.later')} onClick={dismiss}>
          <X size={20} />
        </IconButton>
      </div>
    </div>
  );
}
