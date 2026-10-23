import { Suspense } from 'react';
import BattleLoader from '../../../src/components/BattleLoader';

async function Battle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BattleLoader key={id} battleId={id} />;
}

export default function StudentBattlePage({ params }: PageProps<'/student/[id]'>) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <Battle params={params} />
    </Suspense>
  );
}
