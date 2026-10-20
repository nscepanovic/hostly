import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import { WS_EVENTS, type WsEventPayloads } from '@hostly/shared';
import { qk } from './queries';

export const useConnection = create<{ connected: boolean }>(() => ({ connected: false }));

type Listener<E extends keyof WsEventPayloads> = (payload: WsEventPayloads[E]) => void;
const listeners = new Map<string, Set<Listener<never>>>();

/** Subscribe a component to a realtime event (in addition to cache invalidation). */
export function useSocketEvent<E extends keyof WsEventPayloads>(event: E, fn: Listener<E>) {
  useEffect(() => {
    const set = listeners.get(event) ?? new Set();
    listeners.set(event, set);
    set.add(fn as Listener<never>);
    return () => {
      set.delete(fn as Listener<never>);
    };
  }, [event, fn]);
}

/** One socket per signed-in session; every event invalidates the matching TanStack caches. */
export function useRealtime(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const socket: Socket = io({ path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
    const invalidateReservations = () => {
      void qc.invalidateQueries({ queryKey: qk.reservationsAll });
      void qc.invalidateQueries({ queryKey: qk.priority });
      void qc.invalidateQueries({ queryKey: ['pace'] });
      void qc.invalidateQueries({ queryKey: ['reservation'] });
      void qc.invalidateQueries({ queryKey: ['customer'] });
    };
    const handlers: { [E in keyof WsEventPayloads]: (p: WsEventPayloads[E]) => void } = {
      'reservation.created': invalidateReservations,
      'reservation.updated': invalidateReservations,
      'reservation.deleted': invalidateReservations,
      'table.status': invalidateReservations,
      'priority.new': invalidateReservations,
      'waiting.updated': () => void qc.invalidateQueries({ queryKey: qk.waiting }),
      'waiting.suggest': () => void qc.invalidateQueries({ queryKey: qk.waiting }),
      'floorplan.updated': () => {
        void qc.invalidateQueries({ queryKey: qk.tables });
        void qc.invalidateQueries({ queryKey: qk.areas });
        void qc.invalidateQueries({ queryKey: qk.joinGroups });
      },
      'customer.updated': () => {
        void qc.invalidateQueries({ queryKey: qk.customers });
        void qc.invalidateQueries({ queryKey: ['customer'] });
      },
      'settings.updated': () => void qc.invalidateQueries({ queryKey: qk.restaurant }),
    };
    for (const event of Object.values(WS_EVENTS)) {
      socket.on(event, (payload: never) => {
        (handlers[event] as (p: never) => void)(payload);
        listeners.get(event)?.forEach((fn) => fn(payload));
      });
    }
    socket.on('connect', () => {
      // After a reconnect we may have missed events: refetch everything live.
      if (useConnection.getState().connected === false) void qc.invalidateQueries();
      useConnection.setState({ connected: true });
    });
    socket.on('disconnect', () => useConnection.setState({ connected: false }));
    socket.on('auth.error', () => void qc.invalidateQueries({ queryKey: qk.me }));
    return () => {
      socket.disconnect();
      useConnection.setState({ connected: false });
    };
  }, [enabled, qc]);
}
