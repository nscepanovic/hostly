import { create } from 'zustand';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface Toast {
  id: number;
  message: ReactNode;
  kind: 'info' | 'error' | 'success';
  action?: { label: string; onClick: () => void };
  /** ms; 0 keeps it until dismissed. */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'duration' | 'kind'> & Partial<Pick<Toast, 'duration' | 'kind'>>) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    const toast: Toast = { kind: 'info', duration: 4000, ...t, id };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (toast.duration) setTimeout(() => get().dismiss(id), toast.duration);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  info: (message: ReactNode) => useToasts.getState().push({ message }),
  success: (message: ReactNode) => useToasts.getState().push({ message, kind: 'success' }),
  error: (message: ReactNode) => useToasts.getState().push({ message, kind: 'error', duration: 7000 }),
};

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[60] flex flex-col items-center gap-2 px-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 shadow-xl ${
            t.kind === 'error'
              ? 'border-danger/50 bg-[#3a1220] text-white'
              : t.kind === 'success'
                ? 'border-ok/40 bg-surface text-text'
                : 'border-border bg-surface text-text'
          }`}
        >
          <div className="min-w-0 flex-1 text-sm whitespace-pre-line">{t.message}</div>
          {t.action && (
            <button
              className="shrink-0 rounded-md bg-accent px-3 py-1 text-sm font-semibold text-accent-ink"
              onClick={() => {
                t.action!.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="shrink-0 text-muted" onClick={() => dismiss(t.id)} aria-label="close">
            <X size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}
