import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from './Button';

/** Full-screen on phones, centered card on tablets and up. */
export function Modal({
  open,
  onClose,
  title,
  actions,
  children,
  size = 'lg',
  nested = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Opened from inside another modal: stacks above it. */
  nested?: boolean;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = size === 'sm' ? 'sm:max-w-md' : size === 'md' ? 'sm:max-w-xl' : 'sm:max-w-3xl';
  return createPortal(
    <div className={`fixed inset-0 ${nested ? 'z-[60]' : 'z-50'} flex items-stretch justify-center bg-black/60 sm:items-center sm:p-4`} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-full w-full flex-col bg-surface sm:max-h-[92vh] sm:rounded-2xl sm:border sm:border-border ${width}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h2>
          {actions}
          {!actions && (
            <IconButton label={t('common.close')} onClick={onClose}>
              <X size={22} />
            </IconButton>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
