import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Camera {
  /** World point at the centre of the view. */
  cx: number;
  cy: number;
  /** 1 = everything fits; larger is closer. No practical lower limit. */
  z: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 10;
const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
/** Movement (px) after which a press counts as a drag, not a tap. */
const TAP_SLOP = 6;

const fitCamera = (b: Bounds): Camera => ({ cx: b.x + b.w / 2, cy: b.y + b.h / 2, z: 1 });

/**
 * Map-style camera for an SVG plan: drag to pan, wheel / pinch / buttons to zoom
 * around a point, `reset()` to fit and centre. Returns the SVG viewBox.
 * The camera resets whenever `resetKey` changes (e.g. another area is shown).
 */
export function usePanZoom(containerRef: RefObject<HTMLDivElement | null>, size: { width: number; height: number }, bounds: Bounds, resetKey: string) {
  const [cam, setCam] = useState<Camera>(() => fitCamera(bounds));
  const camRef = useRef(cam);
  camRef.current = cam;

  // Reset when the area changes (not on every table update).
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  useEffect(() => setCam(fitCamera(boundsRef.current)), [resetKey]);

  // Pixels per world unit at zoom 1 (everything fits).
  const fit = size.width && size.height ? Math.min(size.width / bounds.w, size.height / bounds.h) : 1;
  const scale = fit * cam.z;
  const vw = (size.width || bounds.w) / scale;
  const vh = (size.height || bounds.h) / scale;
  const viewBox = { x: cam.cx - vw / 2, y: cam.cy - vh / 2, w: vw, h: vh };

  /** Zooms by `factor`, keeping the world point under (px, py) — container pixels — in place. */
  const zoomAt = useCallback(
    (factor: number, px?: number, py?: number) => {
      setCam((c) => {
        const z = clamp(c.z * factor);
        if (px === undefined || py === undefined || !size.width) return { ...c, z };
        const s1 = fit * c.z;
        const s2 = fit * z;
        // World point under the anchor before zooming...
        const wx = c.cx + (px - size.width / 2) / s1;
        const wy = c.cy + (py - size.height / 2) / s1;
        // ...stays under the anchor after zooming.
        return { z, cx: wx - (px - size.width / 2) / s2, cy: wy - (py - size.height / 2) / s2 };
      });
    },
    [fit, size.width, size.height],
  );

  const panBy = useCallback((dxPx: number, dyPx: number) => {
    setCam((c) => ({ ...c, cx: c.cx - dxPx / (fit * c.z), cy: c.cy - dyPx / (fit * c.z) }));
  }, [fit]);

  const reset = useCallback(() => setCam(fitCamera(boundsRef.current)), []);

  // Gestures: one pointer pans, two pointers pinch-zoom. A press that moved is not a tap.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(false);
  const startedAt = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      // Trackpad pinch arrives as ctrl+wheel with small deltas; mouse wheels as larger steps.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      zoomAt(factor, p.x, p.y);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      pointers.current.set(e.pointerId, local(e));
      if (pointers.current.size === 1) {
        dragged.current = false;
        startedAt.current = local(e);
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.current.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      if (pointers.current.size === 1) {
        if (startedAt.current && Math.hypot(p.x - startedAt.current.x, p.y - startedAt.current.y) > TAP_SLOP) dragged.current = true;
        if (dragged.current) panBy(p.x - prev.x, p.y - prev.y);
      } else if (pointers.current.size === 2) {
        dragged.current = true;
        const [a, b] = [...pointers.current.entries()].map(([id, pt]) => (id === e.pointerId ? p : pt));
        const [pa, pb] = [...pointers.current.values()];
        const before = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        const after = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const prevMid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
        if (before > 0) zoomAt(after / before, mid.x, mid.y);
        panBy(mid.x - prevMid.x, mid.y - prevMid.y);
      }
      pointers.current.set(e.pointerId, p);
    };
    const onUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      if (!pointers.current.size) startedAt.current = null;
    };
    // A tap that turned into a drag must not also "click" a table.
    const onClickCapture = (e: MouseEvent) => {
      if (dragged.current) {
        e.stopPropagation();
        e.preventDefault();
        dragged.current = false;
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    el.addEventListener('click', onClickCapture, true);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, [containerRef, zoomAt, panBy]);

  return {
    viewBox,
    zoom: cam.z,
    zoomIn: () => zoomAt(1.3, size.width / 2, size.height / 2),
    zoomOut: () => zoomAt(1 / 1.3, size.width / 2, size.height / 2),
    reset,
  };
}
