import { create } from 'zustand';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface DragState {
  /** Reservation being dragged from the list. */
  reservationId: string | null;
  label: string;
  x: number;
  y: number;
  overTableId: string | null;
}

export const useDrag = create<DragState>(() => ({ reservationId: null, label: '', x: 0, y: 0, overTableId: null }));

function tableAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  return (el?.closest('[data-table-id]') as HTMLElement | SVGElement | null)?.getAttribute('data-table-id') ?? null;
}

/**
 * Pointer-based drag (works with touch, unlike HTML5 drag and drop). Spread the
 * returned handler on a drag handle; `onDrop` gets the table under the finger.
 */
export function startReservationDrag(
  e: ReactPointerEvent<HTMLElement>,
  reservationId: string,
  label: string,
  onDrop: (tableId: string) => void,
) {
  e.preventDefault();
  const handle = e.currentTarget;
  handle.setPointerCapture(e.pointerId);
  useDrag.setState({ reservationId, label, x: e.clientX, y: e.clientY, overTableId: null });

  const move = (ev: PointerEvent) => useDrag.setState({ x: ev.clientX, y: ev.clientY, overTableId: tableAt(ev.clientX, ev.clientY) });
  const end = (ev: PointerEvent) => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', cancel);
    const target = tableAt(ev.clientX, ev.clientY);
    useDrag.setState({ reservationId: null, overTableId: null });
    if (target) onDrop(target);
  };
  const cancel = () => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', cancel);
    useDrag.setState({ reservationId: null, overTableId: null });
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', cancel);
}

export function DragGhost() {
  const { reservationId, label, x, y } = useDrag();
  if (!reservationId) return null;
  return (
    <div
      className="pointer-events-none fixed z-[70] -translate-x-1/2 -translate-y-[130%] rounded-lg bg-accent px-3 py-2 text-sm font-bold whitespace-nowrap text-accent-ink shadow-2xl"
      style={{ left: x, top: y }}
    >
      {label}
    </div>
  );
}
