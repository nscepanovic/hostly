import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { UserDto } from '@hostly/shared';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { qk, useMe } from '@/lib/queries';
import { LanguageSelect } from '@/components/LanguagePicker';

export function LoginPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (me) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await api.post<UserDto>('/auth/login', { email, password });
      qc.setQueryData(qk.me, user);
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
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
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-2xl font-black text-accent-ink">H</div>
          <div>
            <div className="text-2xl font-bold">Hostly</div>
            <div className="text-sm text-muted">{t('login.title')}</div>
          </div>
        </div>
        <label className="mb-3 block">
          <span className="label">{t('login.email')}</span>
          <input className="field" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="mb-4 block">
          <span className="label">{t('login.password')}</span>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {t('login.submit')}
        </Button>
        <div className="mt-4 flex justify-center">
          <LanguageSelect />
        </div>
      </form>
    </div>
  );
}
