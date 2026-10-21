import { create } from 'zustand';

/** Whose receipt is being scanned (none = scan first, assign later). */
export interface ReceiptTarget {
  reservationId?: string;
  guestName?: string;
}

interface ReceiptUi {
  /** "Scan the receipt?" offer shown after a table is finished. */
  prompt: ReceiptTarget | null;
  scanner: ReceiptTarget | null;
  ask: (t: ReceiptTarget) => void;
  dismiss: () => void;
  openScanner: (t?: ReceiptTarget) => void;
  closeScanner: () => void;
}

export const useReceiptUi = create<ReceiptUi>()((set) => ({
  prompt: null,
  scanner: null,
  ask: (prompt) => set({ prompt }),
  dismiss: () => set({ prompt: null }),
  openScanner: (t = {}) => set({ scanner: t, prompt: null }),
  closeScanner: () => set({ scanner: null }),
}));
