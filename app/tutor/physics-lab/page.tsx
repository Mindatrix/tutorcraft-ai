'use client';

import dynamic from 'next/dynamic';

// Đại phẫu (03/11/2026): physics + Spatial UI test track and the FPS benchmark page.
// See src/components/lab/PhysicsLab.tsx for the URL options (?tier=low&crowd=50&bench=20).
const PhysicsLab = dynamic(() => import('../../../src/components/lab/PhysicsLab'), { ssr: false });

export default function PhysicsLabPage() {
  return <PhysicsLab />;
}
