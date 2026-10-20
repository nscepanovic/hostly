import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CUSTOMER_TYPES, formatPhone, LANGUAGES, type CustomerDto, type CustomerInput } from '@hostly/shared';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/queries';
import { TagInput } from '../reservation/TagInput';

type Draft = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  language: string;
  birthday: string;
  company: string;
  type: CustomerDto['type'];
  notes: string;
  tags: string[];
  averageSpend: string;
};

const toDraft = (c?: CustomerDto): Draft => ({
  firstName: c?.firstName ?? '',
  lastName: c?.lastName ?? '',
  phone: formatPhone(c?.phone),
  email: c?.email ?? '',
  language: c?.language ?? '',
  birthday: c?.birthday ?? '',
  company: c?.company ?? '',
  type: c?.type ?? 'regular',
  notes: c?.notes ?? '',
  tags: c?.tags ?? [],
  averageSpend: c?.averageSpend?.toString() ?? '',
});

const toInput = (d: Draft): CustomerInput => ({
  firstName: d.firstName || null,
  lastName: d.lastName || null,
  phone: d.phone || null,
  email: d.email || null,
  language: (d.language || null) as CustomerInput['language'],
  birthday: d.birthday || null,
  company: d.company || null,
  type: d.type,
  notes: d.notes || null,
  tags: d.tags,
  averageSpend: d.averageSpend ? Number(d.averageSpend) : null,
});

/** Contact details editor; used inline on the profile and in the "add customer" modal. */
export function CustomerFields({ customer, onSaved, onCancel }: { customer?: CustomerDto; onSaved: (c: CustomerDto) => void; onCancel?: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => toDraft(customer));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () => (customer ? api.put<CustomerDto>(`/customers/${customer.id}`, toInput(d)) : api.post<CustomerDto>('/customers', toInput(d))),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: qk.customers });
      qc.setQueryData(qk.customer(c.id), c);
      toast.success(t('common.saved'));
      onSaved(c);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const input = (k: keyof Draft, label: string, type = 'text') => (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      <input className="field" type={type} value={d[k] as string} onChange={(e) => set(k, e.target.value as never)} />
    </label>
  );

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      {input('lastName', t('customers.surname'))}
      {input('firstName', t('customers.name'))}
      {input('phone', t('customers.phone'), 'tel')}
      {input('email', t('customers.email'), 'email')}
      <label className="block">
        <span className="label">{t('customers.type')}</span>
        <select className="field" value={d.type} onChange={(e) => set('type', e.target.value as Draft['type'])}>
          {CUSTOMER_TYPES.map((ct) => (
            <option key={ct} value={ct}>
              {t(`customerType.${ct}`)}
            </option>
          ))}
        </select>
      </label>
      {input('company', t('customers.company'))}
      {input('birthday', t('customers.birthday'), 'date')}
      <label className="block">
        <span className="label">{t('customers.language')}</span>
        <select className="field" value={d.language} onChange={(e) => set('language', e.target.value)}>
          <option value="">—</option>
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {t(`language.${l}`)}
            </option>
          ))}
        </select>
      </label>
      {input('averageSpend', t('customers.averageSpend'), 'number')}
      <div className="col-span-2">
        <span className="label">{t('customers.tags')}</span>
        <TagInput kind="customer" tags={d.tags} onChange={(v) => set('tags', v)} />
      </div>
      <label className="col-span-2 block">
        <span className="label">{t('customers.notes')}</span>
        <textarea className="field" rows={3} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>
      <div className="col-span-2 flex justify-end gap-2">
        {onCancel && <Button onClick={onCancel}>{t('common.cancel')}</Button>}
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

export function CustomerFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: (c: CustomerDto) => void }) {
  const { t } = useTranslation();
  return (
    <Modal open onClose={onClose} title={t('customers.add')} size="md">
      <CustomerFields onSaved={onSaved} onCancel={onClose} />
    </Modal>
  );
}
