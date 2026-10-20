import { useState, type FormEvent } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Languages, LogOut, Moon, ShieldCheck, Sun } from 'lucide-react';
import type { AdminUserDto } from '@hostly/shared';
import { Button, IconButton } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { setLanguage } from '@/i18n';
import { useUi } from '@/store/ui';
import { aq, useAdminMe } from './queries';
import { OverviewPage } from './pages/Overview';
import { RestaurantsPage } from './pages/Restaurants';
import { RestaurantDetailPage } from './pages/RestaurantDetail';
import { ActivityPage } from './pages/Activity';
import { EmailsPage } from './pages/Emails';

/** Platform admin panel at /admin: its own login, layout and session (separate from restaurant staff). */
export default function AdminApp() {
  const { data: admin, isLoading } = useAdminMe();
  if (isLoading) return null;
  if (!admin) return <AdminLogin />;
  return (
    <AdminShell admin={admin}>
      <Routes>
        <Route index element={<OverviewPage />} />
        <Route path="restaurants" element={<RestaurantsPage />} />
        <Route path="restaurants/:id" element={<RestaurantDetailPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="emails" element={<EmailsPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AdminShell>
  );
}

function AdminShell({ admin, children }: { admin: AdminUserDto; children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useUi();
  const logout = async () => {
    await api.post('/admin/auth/logout');
    qc.setQueryData(aq.me, null);
    navigate('/admin');
  };
  const tabs = [
    { to: '/admin', label: t('admin.overview'), end: true },
    { to: '/admin/restaurants', label: t('admin.restaurants') },
    { to: '/admin/activity', label: t('admin.activity') },
    { to: '/admin/emails', label: t('admin.emails') },
  ];
  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2">
          <ShieldCheck className="text-accent" size={26} />
          <span className="text-lg font-bold">{t('admin.title')}</span>
          <div className="flex-1" />
          <span className="hidden text-sm text-muted sm:inline">{admin.name}</span>
          <IconButton label="Language" onClick={() => setLanguage(i18n.language === 'sr' ? 'en' : 'sr')}>
            <Languages size={20} />
          </IconButton>
          <IconButton label="Theme" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </IconButton>
          <IconButton label={t('admin.logout')} onClick={logout}>
            <LogOut size={20} />
          </IconButton>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap ${isActive ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text'}`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-3 pb-12">{children}</div>
      </main>
    </div>
  );
}

function AdminLogin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      qc.setQueryData(aq.me, await api.post<AdminUserDto>('/admin/auth/login', { email, password }));
    } catch {
      setError(t('login.failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-3">
          <ShieldCheck className="text-accent" size={40} />
          <div>
            <div className="text-xl font-bold">{t('admin.title')}</div>
            <div className="text-sm text-muted">{t('admin.signIn')}</div>
          </div>
        </div>
        <label className="mb-3 block">
          <span className="label">{t('login.email')}</span>
          <input className="field" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="mb-4 block">
          <span className="label">{t('login.password')}</span>
          <input className="field" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {t('login.submit')}
        </Button>
      </form>
    </div>
  );
}
