'use client';

import { useEffect } from 'react';
import { ApiError, sessionApi } from '../client/sessionApi';
import { flushResults, outboxItems } from '../client/storage';

// Background re-sender for battle results that were not confirmed as saved
// (no network, server error, or database write still pending). Mounted once in the root layout,
// so it also runs when the student comes back later on any page.

async function sendOne(token: string): Promise<'done' | 'retry'> {
  try {
    const res = await sessionApi.finalize(token);
    return res.flagged || res.saved || !res.pending ? 'done' : 'retry';
  } catch (e) {
    // 0 = offline, 408/429/5xx = try later. Other 4xx (expired / unknown session) cannot succeed.
    if (e instanceof ApiError && (e.status === 0 || e.status === 408 || e.status === 429 || e.status >= 500)) return 'retry';
    return 'done';
  }
}

export default function ResultOutbox() {
  useEffect(() => {
    let busy = false;
    const flush = (force = false) => {
      if (busy || !navigator.onLine || !outboxItems().length) return;
      busy = true;
      void flushResults((item) => sendOne(item.token), force).finally(() => {
        busy = false;
      });
    };
    const onOnline = () => flush(true);
    const onVisible = () => document.visibilityState === 'visible' && flush();
    const onQueued = () => flush();
    flush(true);
    const timer = window.setInterval(flush, 15_000);
    window.addEventListener('online', onOnline);
    window.addEventListener('tc:outbox', onQueued);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('tc:outbox', onQueued);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
