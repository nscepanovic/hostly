import { useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Globe,
  LayoutGrid,
  List,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  GanttChart,
  Users,
} from 'lucide-react';
import type { UserDto } from '@hostly/shared';
import { api } from '@/lib/api';
import { useDayReservations } from '@/lib/day';
import { qk, useRestaurant } from '@/lib/queries';
import { useConnection } from '@/lib/socket';
import { fmtDate, shiftDate, todayBusinessDate } from '@/lib/time';
import { LanguageButton, LanguageList } from './LanguagePicker';
import { useUi } from '@/store/ui';
import { IconButton } from './ui/Button';
import { Modal } from './ui/Modal';

interface NavItem {
  to: string;
  icon: ReactNode;
  label: string;
  ownerOnly?: boolean;
}

/** Routes whose top bar shows the day navigation and summary line. */
const DAY_ROUTES = ['/', '/reservations', '/timeline'];

export function AppShell({ user }: { user: UserDto }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const [moreOpen, setMoreOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const items: NavItem[] = [
    { to: '/', icon: <LayoutGrid size={24} />, label: t('nav.floor') },
    { to: '/reservations', icon: <List size={24} />, label: t('nav.list') },
    { to: '/customers', icon: <Users size={24} />, label: t('nav.customers') },
    { to: '/timeline', icon: <GanttChart size={24} />, label: t('nav.timeline') },
    { to: '/online', icon: <Globe size={24} />, label: t('nav.online'), ownerOnly: true },
    { to: '/settings', icon: <Settings size={24} />, label: t('nav.settings'), ownerOnly: true },
  ].filter((i) => !i.ownerOnly || user.role === 'owner');

  const logout = async () => {
    await api.post('/auth/logout');
    qc.setQueryData(qk.me, null);
    qc.clear();
    navigate('/login');
  };

  const utilities = [
    { key: 'theme', icon: theme === 'dark' ? <Sun size={22} /> : <Moon size={22} />, label: t('nav.theme'), onClick: toggleTheme },
    { key: 'help', icon: <CircleHelp size={22} />, label: t('nav.help'), onClick: () => setHelpOpen(true) },
    { key: 'logout', icon: <LogOut size={22} />, label: t('nav.logout'), onClick: logout },
  ];

  const showDay = DAY_ROUTES.includes(pathname);
  const current = items.find((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to)));

  return (
    <div className="flex h-full">
      {/* Tablet and up: icon rail */}
      <nav className="hidden w-[72px] shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-3 md:flex">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent font-black text-accent-ink">H</div>
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.to === '/'}
            title={i.label}
            aria-label={i.label}
            className={({ isActive }) =>
              `flex h-13 w-13 items-center justify-center rounded-xl transition ${isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-text'}`
            }
          >
            {i.icon}
          </NavLink>
        ))}
        <div className="flex-1" />
        <LanguageButton className="text-muted" />
        {utilities.map((u) => (
          <IconButton key={u.key} label={u.label} onClick={u.onClick} className="text-muted">
            {u.icon}
          </IconButton>
        ))}
        <div className="mt-2 max-w-[64px] truncate text-center text-[10px] text-muted" title={user.name}>
          {user.name}
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={current?.label ?? ''} showDay={showDay} />
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>

        {/* Phones: bottom tab bar */}
        <nav className="safe-bottom grid shrink-0 grid-cols-5 border-t border-border bg-surface md:hidden">
          {items.slice(0, 4).map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.to === '/'}
              className={({ isActive }) =>
                `flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] ${isActive ? 'text-accent' : 'text-muted'}`
              }
            >
              {i.icon}
              <span className="max-w-full truncate px-1">{i.label}</span>
            </NavLink>
          ))}
          <button className="flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] text-muted" onClick={() => setMoreOpen(true)}>
            <Menu size={24} />
            <span>{t('common.more').replace('…', '')}</span>
          </button>
        </nav>
      </div>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title={user.name} size="sm">
        <div className="flex flex-col gap-1">
          {items.slice(4).map((i) => (
            <NavLink key={i.to} to={i.to} onClick={() => setMoreOpen(false)} className="flex h-12 items-center gap-3 rounded-lg px-3 hover:bg-surface-2">
              {i.icon}
              {i.label}
            </NavLink>
          ))}
          {utilities.map((u) => (
            <button
              key={u.key}
              className="flex h-12 items-center gap-3 rounded-lg px-3 text-left hover:bg-surface-2"
              onClick={() => {
                setMoreOpen(false);
                void u.onClick();
              }}
            >
              {u.icon}
              {u.label}
            </button>
          ))}
          <div className="mt-2 border-t border-border pt-2">
            <div className="label px-3">{t('common.language')}</div>
            <LanguageList onPicked={() => setMoreOpen(false)} />
          </div>
        </div>
      </Modal>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('help.title')} size="sm">
        <p className="leading-relaxed text-muted">{t('help.body')}</p>
      </Modal>
    </div>
  );
}

function TopBar({ title, showDay }: { title: string; showDay: boolean }) {
  const { t, i18n } = useTranslation();
  const { data: restaurant } = useRestaurant();
  const { date, shifts, summary } = useDayReservations();
  const { shift, setShift, setDate, newReservation, search, setSearch } = useUi();
  const connected = useConnection((s) => s.connected);
  const dateInput = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const isToday = !!restaurant && date === todayBusinessDate(restaurant);

  return (
    <header className="shrink-0 border-b border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <h1 className="mr-1 truncate text-xl font-bold text-accent md:min-w-28">{title}</h1>
        <span
          className={`h-3 w-3 shrink-0 rounded-full ${connected ? 'bg-accent shadow-[0_0_8px] shadow-accent' : 'bg-danger'}`}
          title={connected ? t('common.online') : t('common.offline')}
        />
        <div className="flex-1" />
        {searchOpen ? (
          <input
            autoFocus
            className="field h-11 w-44 sm:w-60"
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => !search && setSearchOpen(false)}
          />
        ) : (
          <IconButton label={t('common.search')} onClick={() => setSearchOpen(true)}>
            <Search size={22} />
          </IconButton>
        )}
        <button
          type="button"
          onClick={() => newReservation()}
          className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-accent px-3 font-semibold text-accent-ink active:scale-95"
          aria-label={t('topbar.newReservation')}
        >
          <Plus size={22} />
          <span className="hidden sm:inline">{t('topbar.newReservation')}</span>
        </button>
      </div>

      {showDay && date && (
        // Day controls centered; the summary sits on the right (below them on phones).
        <div className="grid grid-cols-1 items-center gap-2 px-3 pb-2 md:grid-cols-[1fr_auto_1fr]">
          <div className="hidden md:block" />
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setDate(null)}
              className={`h-11 rounded-lg px-4 font-semibold ${isToday ? 'bg-accent text-accent-ink' : 'border border-border bg-surface-2'}`}
            >
              {t('common.today')}
            </button>
            <div className="flex items-center rounded-lg border border-border bg-surface-2">
              <IconButton label={t('topbar.prevDay')} onClick={() => setDate(shiftDate(date, -1))}>
                <ChevronLeft size={22} />
              </IconButton>
              <button
                type="button"
                className="relative flex h-11 items-center gap-2 px-2 text-[15px] font-medium tabular-nums"
                onClick={() => dateInput.current?.showPicker?.()}
              >
                <CalendarDays size={18} className="text-muted" />
                {fmtDate(date, i18n.language)}
                <input
                  ref={dateInput}
                  type="date"
                  aria-label={t('topbar.pickDate')}
                  className="pointer-events-none absolute inset-0 opacity-0"
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                />
              </button>
              <IconButton label={t('topbar.nextDay')} onClick={() => setDate(shiftDate(date, 1))}>
                <ChevronRight size={22} />
              </IconButton>
            </div>
            <select className="field h-11 w-auto min-w-28 flex-none" value={shift} onChange={(e) => setShift(e.target.value)}>
              <option value="all">
                {t('topbar.allDay')} {restaurant ? `${restaurant.dayStart}` : ''}
              </option>
              {shifts.map((s) => (
                <option key={s.name} value={s.name}>
                  {t(`shift.${s.name}`, { defaultValue: s.name })} {s.start.toFormat('HH:mm')}–{s.end.toFormat('HH:mm')}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-center gap-3 text-sm text-muted tabular-nums md:justify-end">
            <span>
              {t('common.reservationsShort')} <b className="text-text">{summary.reservations}</b>
            </span>
            <span>
              {t('common.coversShort')} <b className="text-text">{summary.covers}</b>
            </span>
            {summary.withoutTable > 0 && (
              <span className="rounded-md bg-warn/15 px-2 py-0.5 text-warn">
                {t('topbar.withoutTable')}: <b>{summary.withoutTable}</b>
              </span>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
