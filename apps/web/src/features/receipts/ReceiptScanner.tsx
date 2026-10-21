import { lazy, Suspense } from 'react';
import { useReceiptUi } from '@/store/receipts';

// The QR library (camera + decoder) loads only when someone scans.
const ScannerDialog = lazy(() => import('./ScannerDialog'));

export function ReceiptScanner() {
  const target = useReceiptUi((s) => s.scanner);
  const close = useReceiptUi((s) => s.closeScanner);
  if (!target) return null;
  return (
    <Suspense fallback={null}>
      <ScannerDialog key={target.reservationId ?? 'none'} reservationId={target.reservationId} guestName={target.guestName} onClose={close} />
    </Suspense>
  );
}

