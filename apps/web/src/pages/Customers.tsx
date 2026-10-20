import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Ban, CalendarCheck, Ghost, Plus, Search } from 'lucide-react';
import { formatPhone, phoneCountry, type CustomerDto } from '@hostly/shared';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { qk } from '@/lib/queries';
import { CustomerBadge, flagEmoji } from '@/features/reservation/ReservationCard';
import { CustomerFormModal } from '@/features/customers/CustomerForm';

type Sort = 'lastName' | 'firstName' | 'phone' | 'email' | 'visits';
const PAGE = 50;

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function Counters({ c }: { c: CustomerDto }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 tabular-nums">
      <span className="flex items-center gap-1" title={t('customers.visits')}>
        <CalendarCheck size={16} className="text-accent" /> {c.stats.visits}
      </span>
      <span className="flex items-center gap-1" title={t('customers.cancellations')}>
        <Ban size={16} className="text-muted" /> {c.stats.cancellations}
      </span>
      <span className={`flex items-center gap-1 ${c.stats.noShows ? 'text-warn' : ''}`} title={t('customers.noShows')}>
        <Ghost size={16} className={c.stats.noShows ? 'text-warn' : 'text-muted'} /> {c.stats.noShows}
      </span>
    </div>
  );
}

export default function CustomersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: Sort; dir: 'asc' | 'desc' }>({ key: 'lastName', dir: 'asc' });
  const [adding, setAdding] = useState(false);
  const q = useDebounced(search);
  const query = useInfiniteQuery({
    queryKey: [...qk.customers, q, sort],
    queryFn: ({ pageParam }) =>
      api.get<{ total: number; items: CustomerDto[] }>('/customers', { search: q, sort: sort.key, dir: sort.dir, limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  // Load the next page when the sentinel scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage());
    io.observe(el);
    return () => io.disconnect();
  }, [query]);

  const header = (key: Sort, label: string, className = '') => (
    <th className={`px-3 py-2 font-medium ${className}`}>
      <button
        type="button"
        className="inline-flex items-center gap-1 uppercase"
        onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))}
      >
        {label}
        {sort.key === key && (sort.dir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
      </button>
    </th>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-0 flex-1">
          <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            className="field pl-10"
            type="search"
            placeholder={t('customers.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-sm whitespace-nowrap text-muted">{t('customers.total', { count: total })}</span>
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => setAdding(true)}>
          <span className="hidden sm:inline">{t('customers.add')}</span>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Phones: cards */}
        <div className="flex flex-col gap-1.5 p-2 md:hidden">
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate(`/customers/${c.id}`)}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold">{[c.lastName, c.firstName].filter(Boolean).join(' ') || '—'}</span>
                  <CustomerBadge type={c.type} />
                </div>
                <div className="text-sm text-muted">
                  {formatPhone(c.phone)} {flagEmoji(phoneCountry(c.phone) === 'RS' ? null : phoneCountry(c.phone))}
                </div>
              </div>
              <Counters c={c} />
            </button>
          ))}
        </div>
        {/* Tablets and up: table */}
        <table className="hidden w-full text-left text-[15px] md:table">
          <thead className="sticky top-0 border-b border-border bg-surface text-xs text-muted">
            <tr>
              {header('lastName', t('customers.surname'))}
              {header('firstName', t('customers.name'))}
              {header('phone', t('customers.phone'))}
              {header('email', t('customers.email'), 'hidden lg:table-cell')}
              <th className="px-3 py-2 font-medium uppercase">{t('customers.tags')}</th>
              {header('visits', t('customers.visits'))}
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} onClick={() => navigate(`/customers/${c.id}`)} className="h-13 cursor-pointer border-b border-border/60 hover:bg-surface-2">
                <td className="px-3">
                  <div className="font-semibold">{c.lastName ?? '—'}</div>
                  {c.company && <div className="text-xs text-muted">{c.company}</div>}
                </td>
                <td className="px-3">{c.firstName}</td>
                <td className="px-3 whitespace-nowrap tabular-nums">
                  {formatPhone(c.phone)} {phoneCountry(c.phone) !== 'RS' && flagEmoji(phoneCountry(c.phone))}
                </td>
                <td className="hidden max-w-48 truncate px-3 text-muted lg:table-cell">{c.email}</td>
                <td className="px-3">
                  <div className="flex flex-wrap gap-1">
                    <CustomerBadge type={c.type} />
                    {c.tags.map((tag) => (
                      <span key={tag} className="rounded bg-surface-3 px-1.5 text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3">
                  <Counters c={c} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div ref={sentinel} className="h-10" />
        {query.isFetching && <p className="p-3 text-center text-muted">{t('common.loading')}</p>}
      </div>
      {adding && (
        <CustomerFormModal
          onClose={() => setAdding(false)}
          onSaved={(c) => {
            setAdding(false);
            navigate(`/customers/${c.id}`);
          }}
        />
      )}
    </div>
  );
}
