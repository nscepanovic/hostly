import { create } from 'zustand';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmState {
  request: { message: string; danger?: boolean; input?: string; resolve: (v: { ok: boolean; text: string }) => void } | null;
  text: string;
}

const useConfirmStore = create<ConfirmState>(() => ({ request: null, text: '' }));

/** Promise-based confirm dialog; `input` shows a text field (e.g. decline reason). */
export function confirmDialog(message: string, opts: { danger?: boolean; input?: string } = {}) {
  return new Promise<{ ok: boolean; text: string }>((resolve) =>
    useConfirmStore.setState({ request: { message, ...opts, resolve }, text: '' }),
  );
}

export function ConfirmHost() {
  const { t } = useTranslation();
  const { request, text } = useConfirmStore();
  const close = (ok: boolean) => {
    request?.resolve({ ok, text });
    useConfirmStore.setState({ request: null, text: '' });
  };
  return (
    <Modal open={!!request} nested onClose={() => close(false)} title={request?.message ?? ''} size="sm">
      {request?.input !== undefined && (
        <label className="mb-4 block">
          <span className="label">{request.input}</span>
          <textarea className="field" rows={3} value={text} onChange={(e) => useConfirmStore.setState({ text: e.target.value })} />
        </label>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={() => close(false)}>{t('common.no')}</Button>
        <Button variant={request?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
          {t('common.yes')}
        </Button>
      </div>
    </Modal>
  );
}
