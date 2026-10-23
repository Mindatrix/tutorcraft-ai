'use client';

import { useEffect } from 'react';

// Registers /sw.js in production only (a dev service worker would serve stale bundles).
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
