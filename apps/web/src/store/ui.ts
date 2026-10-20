import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PanelTab = 'booked' | 'waiting' | 'priority';
export type Theme = 'dark' | 'light';

export interface ReservationDraft {
  arrivalTime?: string;
  /** Explicit end, local "YYYY-MM-DDTHH:mm" (e.g. a walk-in that must leave before the next booking). */
  endAt?: string;
  covers?: number;
  tableIds?: string[];
  source?: 'phone' | 'walk_in' | 'staff';
  status?: 'confirmed' | 'seated';
  firstName?: string;
  phone?: string;
  waitingEntryId?: string;
}

interface UiState {
  /** Business date being viewed, or null for "today". */
  date: string | null;
  shift: string;
  areaId: string | null;
  panelTab: PanelTab;
  panelOpen: boolean;
  theme: Theme;
  search: string;
  /** Reservation modal: an id to edit, or a draft for a new one. */
  modal: { id?: string; draft?: ReservationDraft } | null;
  setDate: (d: string | null) => void;
  setShift: (s: string) => void;
  setAreaId: (id: string | null) => void;
  setPanelTab: (t: PanelTab) => void;
  setPanelOpen: (open: boolean) => void;
  toggleTheme: () => void;
  setSearch: (s: string) => void;
  openReservation: (id: string) => void;
  newReservation: (draft?: ReservationDraft) => void;
  closeModal: () => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      date: null,
      shift: 'all',
      areaId: null,
      panelTab: 'booked',
      panelOpen: true,
      theme: 'dark',
      search: '',
      modal: null,
      setDate: (date) => set({ date }),
      setShift: (shift) => set({ shift }),
      setAreaId: (areaId) => set({ areaId }),
      setPanelTab: (panelTab) => set({ panelTab, panelOpen: true }),
      setPanelOpen: (panelOpen) => set({ panelOpen }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setSearch: (search) => set({ search }),
      openReservation: (id) => set({ modal: { id } }),
      newReservation: (draft) => set({ modal: { draft: draft ?? {} } }),
      closeModal: () => set({ modal: null }),
    }),
    {
      name: 'hostly-ui',
      // Only per-device preferences survive reloads; the date always reopens on today.
      partialize: (s) => ({ theme: s.theme, areaId: s.areaId, panelOpen: s.panelOpen, shift: s.shift }),
    },
  ),
);
