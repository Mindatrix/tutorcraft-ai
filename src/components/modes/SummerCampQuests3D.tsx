'use client';

import PhoneticStonesStage from './PhoneticStonesStage';
import type { BossSceneProps } from './types';

export default function SummerCampQuests3D({
  tier = 'high',
  question,
  finished,
}: BossSceneProps) {
  return (
    <PhoneticStonesStage
      tier={tier}
      worldMode="summer_camp"
      lockWorldMode
      questionOpen={Boolean(question)}
      paused={finished}
      className="h-full w-full border-0 rounded-none"
    />
  );
}
