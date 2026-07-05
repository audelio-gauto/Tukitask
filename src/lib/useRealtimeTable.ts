'use client';

import { useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

/**
 * Generic hook: subscribe to Supabase Realtime postgres_changes on any table.
 * Automatically manages channel lifecycle (subscribe + cleanup).
 *
 * @param channelName  Unique channel name (must be stable or memoized)
 * @param table        Table name to subscribe to
 * @param opts         Filter, event type, and callback
 *
 * Usage:
 *   useRealtimeTable('orders-client-abc', 'orders', {
 *     event: '*',
 *     filter: `client_email=eq.${email}`,
 *     onPayload: (payload) => { ... },
 *   });
 */
export function useRealtimeTable(
  channelName: string,
  table: string,
  opts: {
    event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
    filter?: string;
    onPayload: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
    enabled?: boolean;
  },
) {
  const cbRef = useRef(opts.onPayload);
  cbRef.current = opts.onPayload;

  const enabled = opts.enabled !== false;

  useEffect(() => {
    if (!enabled || !channelName) return;

    const ch: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as never,
        {
          event: opts.event ?? '*',
          schema: 'public',
          table,
          ...(opts.filter ? { filter: opts.filter } : {}),
        } as never,
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          cbRef.current(payload);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
     
  }, [channelName, table, opts.event, opts.filter, enabled]);
}

/**
 * Subscribe to multiple tables on a single channel (reduces connection count).
 * Each listener gets its own (table, event, filter, callback).
 */
export function useRealtimeMulti(
  channelName: string,
  listeners: Array<{
    table: string;
    event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
    filter?: string;
    onPayload: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  }>,
  enabled = true,
) {
  const listenersRef = useRef(listeners);
  listenersRef.current = listeners;

  // Stable key so useEffect doesn't re-run unless listeners shape changes
  const key = listeners.map(l => `${l.table}|${l.event ?? '*'}|${l.filter ?? ''}`).join(';');

  useEffect(() => {
    if (!enabled || !channelName || listenersRef.current.length === 0) return;

    let ch = supabase.channel(channelName);

    for (const l of listenersRef.current) {
      ch = ch.on(
        'postgres_changes' as never,
        {
          event: l.event ?? '*',
          schema: 'public',
          table: l.table,
          ...(l.filter ? { filter: l.filter } : {}),
        } as never,
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          // Find the matching listener in the current ref
          const match = listenersRef.current.find(
            cur => cur.table === l.table && (cur.event ?? '*') === (l.event ?? '*') && (cur.filter ?? '') === (l.filter ?? ''),
          );
          match?.onPayload(payload);
        },
      );
    }

    ch.subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
     
  }, [channelName, key, enabled]);
}
