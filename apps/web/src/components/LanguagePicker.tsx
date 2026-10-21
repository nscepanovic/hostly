import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Languages } from 'lucide-react';
import { LANGUAGE_INFO, LANGUAGES, type Language } from '@hostly/shared';
import { setLanguage } from '@/i18n';
import { IconButton } from './ui/Button';
import { Modal } from './ui/Modal';

/** Every registered language, by its own name; grows automatically when one is added. */
export function LanguageList({ persist = true, onPicked }: { persist?: boolean; onPicked?: () => void }) {
  const { i18n } = useTranslation();
  return (
    <div className="flex flex-col gap-1">
      {LANGUAGES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          onClick={() => {
            setLanguage(l, persist);
            onPicked?.();
          }}
          className="flex h-12 items-center gap-3 rounded-lg px-3 text-left hover:bg-surface-2"
        >
          <span className="w-8 text-xs font-semibold text-muted uppercase">{l}</span>
          <span className="flex-1">{LANGUAGE_INFO[l].nativeName}</span>
          {i18n.language === l && <Check size={18} className="text-accent" />}
        </button>
      ))}
    </div>
  );
}

/** Icon button that opens the language list (rail, admin header). */
export function LanguageButton({ className = '', persist = true }: { className?: string; persist?: boolean }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label={`${t('common.language')}: ${LANGUAGE_INFO[i18n.language as Language]?.nativeName ?? i18n.language}`} onClick={() => setOpen(true)} className={className}>
        <Languages size={22} />
      </IconButton>
      <Modal open={open} onClose={() => setOpen(false)} title={t('common.language')} size="sm" nested>
        <LanguageList persist={persist} onPicked={() => setOpen(false)} />
      </Modal>
    </>
  );
}

/** Compact select for login and public pages. */
export function LanguageSelect({ persist = true, className = '' }: { persist?: boolean; className?: string }) {
  const { t, i18n } = useTranslation();
  return (
    <select
      aria-label={t('common.language')}
      className={`field h-10 w-auto ${className}`}
      value={i18n.language}
      onChange={(e) => setLanguage(e.target.value as Language, persist)}
    >
      {LANGUAGES.map((l) => (
        <option key={l} value={l}>
          {LANGUAGE_INFO[l].nativeName}
        </option>
      ))}
    </select>
  );
}
