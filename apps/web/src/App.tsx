import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './components/AppShell';
import { ConfirmHost } from './components/ui/Confirm';
import { Toaster } from './components/ui/Toast';
import { ApiError } from './lib/api';
import { useMe } from './lib/queries';
import { useRealtime } from './lib/socket';
import { useUi } from './store/ui';
import { LoginPage } from './pages/Login';
import { FloorPage } from './pages/Floor';
import { LiveNotifications } from './features/LiveNotifications';
import { ReservationModal } from './features/reservation/ReservationModal';

const ReservationsPage = lazy(() => import('./pages/Reservations'));
const CustomersPage = lazy(() => import('./pages/Customers'));
const CustomerPage = lazy(() => import('./pages/Customer'));
const TimelinePage = lazy(() => import('./pages/Timeline'));
const EditorPage = lazy(() => import('./pages/Editor'));
const OnlinePage = lazy(() => import('./pages/Online'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const BookPage = lazy(() => import('./pages/public/Book'));
const GuestReservationPage = lazy(() => import('./pages/public/GuestReservation'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

function ThemeSync() {
  const theme = useUi((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1020' : '#f3f5fa');
  }, [theme]);
  return null;
}

function Spinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-surface-3 border-t-accent" />
    </div>
  );
}

function Protected() {
  const { data: me, isLoading } = useMe();
  const location = useLocation();
  useRealtime(!!me);
  if (isLoading) return <Spinner />;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <>
      <AppShell user={me} />
      <ReservationModal />
      <LiveNotifications />
    </>
  );
}

function OwnerOnly({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Spinner />;
  if (!me) return <Navigate to="/login" replace />;
  return me.role === 'owner' ? <>{children}</> : <Navigate to="/" replace />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <BrowserRouter>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/book/:slug" element={<BookPage />} />
            <Route path="/r/:token" element={<GuestReservationPage />} />
            <Route path="/editor" element={<OwnerOnly><EditorPage /></OwnerOnly>} />
            <Route element={<Protected />}>
              <Route index element={<FloorPage />} />
              <Route path="reservations" element={<ReservationsPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="customers/:id" element={<CustomerPage />} />
              <Route path="timeline" element={<TimelinePage />} />
              <Route path="online" element={<OwnerOnly><OnlinePage /></OwnerOnly>} />
              <Route path="settings" element={<OwnerOnly><SettingsPage /></OwnerOnly>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster />
      <ConfirmHost />
    </QueryClientProvider>
  );
}
