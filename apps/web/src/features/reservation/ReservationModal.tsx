import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';
import { Check, UserRound, X, AlertTriangle, Mail } from 'lucide-react';
import {
  formatPhone,
  LANGUAGES,
  PURPOSES,
  RESERVATION_SOURCES,
  RESERVATION_STATUSES,
  type CustomerDto,
  type MessageDto,
  type ReservationDto,
  type ReservationInput,
  type TableSuggestion,
  type ValidationIssue,
} from '@hostly/shared';
import { Modal } from '@/components/ui/Modal';
import { Button, IconButton } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { api, ApiError, errorMessage } from '@/lib/api';
import { qk, useAreas, useRestaurant, useTables, useViewDate } from '@/lib/queries';
import { businessLocal, inZone } from '@/lib/time';
import { useUi, type ReservationDraft } from '@/store/ui';
import { CustomerBadge } from './ReservationCard';
import { SuggestionList } from './SuggestionSheet';
import { TagInput } from './TagInput';
import { TimeGrid } from './TimeGrid';
import { CoversPad } from './CoversPad';
import { TablePicker } from './TablePicker';
import { useCustomerLookup } from './useCustomerLookup';

interface FormState {
  status: ReservationDto['status'];
  purpose: ReservationDto['purpose'];
  date: string;
  time: string;
  covers: number | null;
  lastName: string;
  firstName: string;
  phone: string;
  email: string;
  areaId: string;
  tableIds: string[];
  source: ReservationDto['source'];
  returnTime: string;
  fixMenu: boolean;
  notes: string;
  tags: string[];
  dietary: string[];
  birthday: string;
  cake: boolean;
  smoking: boolean;
  discount: string;
  language: string;
  spend: string;
  customerId: string | null;
}

function emptyForm(date: string, draft: ReservationDraft): FormState {
  return {
    status: draft.status ?? 'confirmed',
    purpose: 'food',
    date,
    time: draft.arrivalTime ?? '',
    covers: draft.covers ?? null,
    lastName: '',
    firstName: draft.firstName ?? '',
    phone: draft.phone ?? '',
    email: '',
    areaId: '',
    tableIds: draft.tableIds ?? [],
    source: draft.source ?? 'phone',
    returnTime: '',
    fixMenu: false,
    notes: '',
    tags: [],
    dietary: [],
    birthday: '',
    cake: false,
    smoking: false,
    discount: '',
    language: '',
    spend: '',
    customerId: null,
  };
}

function fromReservation(r: ReservationDto, tz: string, businessDate: string): FormState {
  const a = inZone(r.arrivalAt, tz);
  const d = inZone(r.departureAt, tz);
  return {
    status: r.status,
    purpose: r.purpose,
    date: businessDate,
    time: a.toFormat('HH:mm'),
    covers: r.covers,
    lastName: r.lastName ?? '',
    firstName: r.firstName ?? '',
    phone: formatPhone(r.phone),
    email: r.email ?? '',
    areaId: r.areaId ?? '',
    tableIds: r.tableIds,
    source: r.source,
    returnTime: d.toFormat('HH:mm'),
    fixMenu: r.fixMenu,
    notes: r.notes ?? '',
    tags: r.tags,
    dietary: r.dietary,
    birthday: '',
    cake: !!r.extras.cake,
    smoking: !!r.extras.smoking,
    discount: r.extras.discount ?? '',
    language: r.language,
    spend: r.spend?.toString() ?? '',
    customerId: r.customerId,
  };
}

export function ReservationModal() {
  const modal = useUi((s) => s.modal);
  const close = useUi((s) => s.closeModal);
  if (!modal) return null;
  // Remount per reservation so the form state starts fresh.
  return <ReservationForm key={modal.id ?? 'new'} id={modal.id} draft={modal.draft ?? {}} onClose={close} />;
}

function ReservationForm({ id, draft, onClose }: { id?: string; draft: ReservationDraft; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: restaurant } = useRestaurant();
  const { data: areas = [] } = useAreas();
  const { data: tables = [] } = useTables();
  const viewDate = useViewDate();
  const existing = useQuery({ queryKey: qk.reservation(id ?? ''), queryFn: () => api.get<ReservationDto>(`/reservations/${id}`), enabled: !!id });
  const messages = useQuery({
    queryKey: ['messages', id],
    queryFn: () => api.get<MessageDto[]>(`/reservations/${id}/messages`),
    enabled: !!id,
  });
  const [form, setForm] = useState<FormState | null>(id ? null : emptyForm(viewDate ?? DateTime.now().toISODate()!, draft));
  const [showMore, setShowMore] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [pickTables, setPickTables] = useState(false);
  const [timeOpen, setTimeOpen] = useState(!id && !draft.arrivalTime);
  const [customer, setCustomer] = useState<CustomerDto | null>(null);

  useEffect(() => {
    if (existing.data && restaurant && !form) {
      const business = (() => {
        const local = inZone(existing.data.arrivalAt, restaurant.timezone);
        const [h, m] = restaurant.dayStart.split(':').map(Number);
        return (local.hour * 60 + local.minute < h * 60 + m ? local.minus({ days: 1 }) : local).toISODate()!;
      })();
      setForm(fromReservation(existing.data, restaurant.timezone, business));
    }
  }, [existing.data, restaurant, form]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  // Phone autocomplete: fill the guest's details from the customer record.
  const lookup = useCustomerLookup(form?.phone ?? '', !form?.customerId);
  useEffect(() => {
    const c = lookup.data;
    if (!c || !form || form.customerId) return;
    setCustomer(c);
    setForm((f) =>
      f && {
        ...f,
        customerId: c.id,
        lastName: f.lastName || c.lastName || '',
        firstName: f.firstName || c.firstName || '',
        email: f.email || c.email || '',
        language: f.language || c.language || '',
        tags: [...new Set([...f.tags, ...c.tags])],
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup.data]);
  const customerQuery = useQuery({
    queryKey: qk.customer(form?.customerId ?? ''),
    queryFn: () => api.get<CustomerDto>(`/customers/${form!.customerId}`),
    enabled: !!form?.customerId && !customer,
  });
  const linkedCustomer = customer ?? customerQuery.data ?? null;

  const arrivalLocal = form && restaurant && form.time ? businessLocal(restaurant, form.date, form.time) : null;
  const departureLocal = useMemo(() => {
    if (!form || !restaurant || !arrivalLocal) return null;
    if (!form.returnTime) return DateTime.fromISO(arrivalLocal).plus({ minutes: restaurant.defaultDurationMin }).toFormat("yyyy-LL-dd'T'HH:mm");
    const ret = businessLocal(restaurant, form.date, form.returnTime);
    // A return time "before" arrival means after midnight.
    return ret <= arrivalLocal ? DateTime.fromISO(ret).plus({ days: 1 }).toFormat("yyyy-LL-dd'T'HH:mm") : ret;
  }, [form, restaurant, arrivalLocal]);

  // Auto table suggestion once covers and time are known.
  const suggestions = useQuery({
    queryKey: ['suggest', arrivalLocal, departureLocal, form?.covers, form?.customerId, form?.areaId, id],
    queryFn: () =>
      api.get<TableSuggestion[]>('/reservations/suggest', {
        arrivalAt: arrivalLocal!,
        departureAt: departureLocal!,
        covers: form!.covers!,
        customerId: form!.customerId ?? undefined,
        areaId: form!.areaId || undefined,
        excludeReservationId: id,
      }),
    enabled: !!arrivalLocal && !!departureLocal && !!form?.covers,
  });
  // Pre-select the best suggestion on new reservations, and keep following it (e.g. once a
  // VIP is recognised) until the host picks tables themselves.
  const autoPicked = useRef(!id && !draft.tableIds);
  useEffect(() => {
    if (autoPicked.current && suggestions.data) set('tableIds', suggestions.data[0]?.tableIds ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions.data]);
  const setTablesManually = (ids: string[]) => {
    autoPicked.current = false;
    set('tableIds', ids);
  };

  const buildPayload = (force: boolean): ReservationInput => ({
    status: form!.status,
    purpose: form!.purpose,
    arrivalAt: arrivalLocal!,
    departureAt: departureLocal,
    covers: form!.covers!,
    firstName: form!.firstName || null,
    lastName: form!.lastName || null,
    phone: form!.phone || null,
    email: form!.email || null,
    customerId: form!.customerId,
    areaId: form!.areaId || null,
    tableIds: form!.tableIds,
    source: form!.source,
    notes: form!.notes || null,
    tags: form!.tags,
    dietary: form!.dietary,
    fixMenu: form!.fixMenu,
    language: (form!.language || null) as ReservationInput['language'],
    birthday: form!.birthday || null,
    extras: { cake: form!.cake || undefined, smoking: form!.smoking || undefined, discount: form!.discount || undefined },
    spend: form!.spend ? Number(form!.spend) : null,
    force,
  });

  const save = useMutation({
    mutationFn: (force: boolean) =>
      id ? api.patch<ReservationDto>(`/reservations/${id}`, buildPayload(force)) : api.post<ReservationDto>('/reservations', buildPayload(force)),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: qk.reservationsAll });
      void qc.invalidateQueries({ queryKey: qk.priority });
      void qc.invalidateQueries({ queryKey: ['pace'] });
      qc.setQueryData(qk.reservation(r.id), r);
      if (draft.waitingEntryId) void api.patch(`/waiting/${draft.waitingEntryId}`, { status: 'seated' });
      toast.success(t('reservation.created'));
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409 && Array.isArray(err.body.issues)) {
        setIssues(err.body.issues as unknown as ValidationIssue[]);
      } else toast.error(errorMessage(err));
    },
  });

  if (!form || !restaurant) {
    return (
      <Modal open onClose={onClose} title={t('reservation.title')}>
        <p className="text-muted">{t('common.loading')}</p>
      </Modal>
    );
  }

  // 24h return-time choices from one slot after arrival up to 8 hours.
  const returnOptions = arrivalLocal
    ? Array.from({ length: Math.floor(480 / restaurant.slotMinutes) }, (_, i) => {
        const at = DateTime.fromISO(arrivalLocal).plus({ minutes: (i + 1) * restaurant.slotMinutes });
        const mins = (i + 1) * restaurant.slotMinutes;
        return { value: at.toFormat('HH:mm'), label: `${at.toFormat('HH:mm')}  (${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''})` };
      })
    : [];
  const currentReturn = departureLocal?.slice(11, 16);
  if (currentReturn && !returnOptions.some((o) => o.value === currentReturn)) returnOptions.unshift({ value: currentReturn, label: currentReturn });
  const canSave = !!form.time && !!form.covers && !save.isPending;
  const labelOf = new Map(tables.map((tb) => [tb.id, tb.label]));
  const chosenSeats = tables.filter((tb) => form.tableIds.includes(tb.id)).reduce((n, tb) => n + tb.maxSeats, 0);
  const hasHardIssue = issues.some((i) => i.hard);

  return (
    <Modal
      open
      onClose={onClose}
      title={id ? t('reservation.title') : t('reservation.newTitle')}
      actions={
        <div className="flex items-center gap-2">
          {form.customerId && (
            <IconButton
              label={t('reservation.customerProfile')}
              className="border border-border"
              onClick={() => {
                onClose();
                navigate(`/customers/${form.customerId}`);
              }}
            >
              <UserRound size={20} />
            </IconButton>
          )}
          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              setIssues([]);
              save.mutate(false);
            }}
            className="flex h-11 w-14 items-center justify-center rounded-lg bg-ok text-white disabled:opacity-40"
            aria-label={t('common.save')}
          >
            <Check size={24} />
          </button>
          <button type="button" onClick={onClose} className="flex h-11 w-14 items-center justify-center rounded-lg bg-danger text-white" aria-label={t('common.close')}>
            <X size={24} />
          </button>
        </div>
      }
    >
      {issues.length > 0 && (
        <div className={`mb-4 rounded-xl border p-3 ${hasHardIssue ? 'border-danger/50 bg-danger/10' : 'border-warn/50 bg-warn/10'}`}>
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <AlertTriangle size={18} /> {t('reservation.issues')}
          </div>
          <ul className="ml-6 list-disc text-sm">
            {issues.map((i) => (
              <li key={i.code}>
                {t(`issues.${i.code}`)} <span className="text-muted">({i.message})</span>
              </li>
            ))}
          </ul>
          {!hasHardIssue && (
            <Button className="mt-2" variant="primary" size="sm" onClick={() => save.mutate(true)}>
              {t('common.forceSave')}
            </Button>
          )}
        </div>
      )}

      {/* Row 1: the essentials */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label={t('reservation.status')}>
          <select className="field" value={form.status} onChange={(e) => set('status', e.target.value as FormState['status'])}>
            {RESERVATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('reservation.purpose')}>
          <select className="field" value={form.purpose} onChange={(e) => set('purpose', e.target.value as FormState['purpose'])}>
            {PURPOSES.map((p) => (
              <option key={p} value={p}>
                {t(`purpose.${p}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('reservation.arrivalDate')}>
          <input className="field" type="date" required value={form.date} onChange={(e) => e.target.value && set('date', e.target.value)} />
        </Field>
        <Field label={t('reservation.arrivalTime')}>
          <button type="button" className={`field text-left tabular-nums ${!form.time ? 'border-accent text-muted' : ''}`} onClick={() => setTimeOpen(true)}>
            {form.time || t('reservation.selectTime')}
          </button>
        </Field>
        <Field label={t('reservation.covers')} className="col-span-2 sm:col-span-1">
          <CoversPad value={form.covers} onChange={(v) => set('covers', v)} max={restaurant.maxPartySize} autoOpen={!form.covers && !!form.time && !timeOpen} />
        </Field>
      </div>

      {timeOpen && (
        <TimeGrid
          restaurant={restaurant}
          date={form.date}
          value={form.time}
          onPick={(time) => {
            set('time', time);
            setTimeOpen(false);
          }}
          onClose={() => setTimeOpen(false)}
        />
      )}

      {/* Row 2: guest */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={t('reservation.telephone')} className="col-span-2 sm:col-span-1">
          <input
            className="field"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={form.phone}
            onChange={(e) => {
              set('phone', e.target.value);
              if (form.customerId && !id) {
                set('customerId', null);
                setCustomer(null);
              }
            }}
          />
        </Field>
        <Field label={t('reservation.surname')}>
          <input className="field" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </Field>
        <Field label={t('reservation.name')}>
          <input className="field" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
        </Field>
        <Field label={t('reservation.email')} className="col-span-2 sm:col-span-1">
          <input className="field" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
      </div>
      {linkedCustomer && (
        <div
          className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            linkedCustomer.type === 'blacklisted' ? 'bg-danger/15' : 'bg-accent/10'
          }`}
        >
          <UserRound size={16} />
          <b>{t('reservation.knownCustomer')}</b>
          <CustomerBadge type={linkedCustomer.type} />
          <span className="text-muted">
            {t('reservation.visits', { count: linkedCustomer.stats.visits })} · {t('customers.noShows')}: {linkedCustomer.stats.noShows}
          </span>
          {linkedCustomer.notes && <span className="w-full text-muted italic">{linkedCustomer.notes}</span>}
        </div>
      )}

      {/* Tables */}
      <div className="mt-4 rounded-xl border border-border p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="label mb-0">{t('reservation.tables')}</span>
          <span className="font-semibold">{form.tableIds.map((tid) => labelOf.get(tid)).join(' + ') || '—'}</span>
          {form.tableIds.length > 0 && form.covers && chosenSeats < form.covers && (
            <span className="text-sm text-warn">{t('issues.table_capacity')}</span>
          )}
          <div className="flex-1" />
          {areas.length > 1 && (
            <select className="field h-9 w-auto" value={form.areaId} onChange={(e) => set('areaId', e.target.value)} aria-label={t('reservation.area')}>
              <option value="">{t('common.all')}</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" onClick={() => setPickTables(true)}>
            {t('reservation.pickManually')}
          </Button>
          {form.tableIds.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setTablesManually([])}>
              <X size={16} />
            </Button>
          )}
        </div>
        {form.covers && form.time ? (
          suggestions.isLoading ? (
            <p className="text-sm text-muted">{t('common.loading')}</p>
          ) : (
            <SuggestionList suggestions={suggestions.data ?? []} selected={form.tableIds} onPick={(s) => setTablesManually(s.tableIds)} />
          )
        ) : (
          <p className="text-sm text-muted">{t('reservation.suggestions')}: {t('reservation.arrivalTime').toLowerCase()} + {t('reservation.covers').toLowerCase()}</p>
        )}
      </div>
      {pickTables && (
        <TablePicker
          tables={tables.filter((tb) => tb.active)}
          areas={areas}
          selected={form.tableIds}
          arrivalAt={arrivalLocal}
          departureAt={departureLocal}
          excludeReservationId={id}
          onChange={setTablesManually}
          onClose={() => setPickTables(false)}
        />
      )}

      {/* Row 3 */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={t('reservation.source')}>
          <select className="field" value={form.source} onChange={(e) => set('source', e.target.value as FormState['source'])}>
            {RESERVATION_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`source.${s}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('reservation.returnTime')}>
          <select
            className="field tabular-nums"
            value={departureLocal ? departureLocal.slice(11, 16) : ''}
            disabled={!arrivalLocal}
            onChange={(e) => set('returnTime', e.target.value)}
          >
            {returnOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('reservation.type')}>
          <select className="field" disabled>
            <option>{t('reservation.typeSimple')}</option>
          </select>
        </Field>
        <label className="flex h-11 items-center gap-2 self-end">
          <input type="checkbox" className="h-5 w-5 accent-[var(--color-accent)]" checked={form.fixMenu} onChange={(e) => set('fixMenu', e.target.checked)} />
          {t('reservation.fixMenu')}
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={t('reservation.notesTags')}>
          <TagInput kind="note" tags={form.tags} onChange={(v) => set('tags', v)} />
          <textarea className="field mt-2" rows={2} placeholder={t('reservation.typeHere')} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <Field label={t('reservation.dietary')}>
          <TagInput kind="dietary" tags={form.dietary} onChange={(v) => set('dietary', v)} />
        </Field>
      </div>

      <button type="button" className="mt-3 text-sm font-semibold text-accent" onClick={() => setShowMore((v) => !v)}>
        {showMore ? t('common.less') : t('common.more')}
      </button>
      {showMore && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label={t('reservation.birthday')}>
            <input className="field" type="date" value={form.birthday} onChange={(e) => set('birthday', e.target.value)} />
          </Field>
          <Field label={t('reservation.language')}>
            <select className="field" value={form.language} onChange={(e) => set('language', e.target.value)}>
              <option value="">{t(`language.${restaurant.defaultLanguage}`)} (default)</option>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {t(`language.${l}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('reservation.discount')}>
            <input className="field" value={form.discount} onChange={(e) => set('discount', e.target.value)} />
          </Field>
          <Field label={t('reservation.spend')}>
            <input className="field" type="number" min={0} inputMode="decimal" value={form.spend} onChange={(e) => set('spend', e.target.value)} />
          </Field>
          <label className="flex h-11 items-center gap-2">
            <input type="checkbox" className="h-5 w-5" checked={form.cake} onChange={(e) => set('cake', e.target.checked)} />
            {t('reservation.cake')}
          </label>
          <label className="flex h-11 items-center gap-2">
            <input type="checkbox" className="h-5 w-5" checked={form.smoking} onChange={(e) => set('smoking', e.target.checked)} />
            {t('reservation.smoking')}
          </label>
        </div>
      )}

      {id && (messages.data?.length ?? 0) > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="label">{t('reservation.messages')}</div>
          <ul className="text-sm text-muted">
            {messages.data!.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <Mail size={14} /> {m.templateKey} · {m.language.toUpperCase()} · {m.recipient} · {t(`reservation.messageStatus.${m.status}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {existing.data?.declineReason && (
        <p className="mt-3 text-sm text-muted">
          {t('reservation.declineReason')}: {existing.data.declineReason}
        </p>
      )}
    </Modal>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}
