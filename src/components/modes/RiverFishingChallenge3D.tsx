'use client';

import PhoneticStonesStage from './PhoneticStonesStage';
import type { BossSceneProps } from './types';

export default function RiverFishingChallenge3D({
  tier = 'high',
  question,
  finished,
}: BossSceneProps) {
  return (
    <PhoneticStonesStage
      tier={tier}
      worldMode="river_fishing"
      lockWorldMode
      questionOpen={Boolean(question)}
      paused={finished}
      className="h-full w-full border-0 rounded-none"
    />
  );
}
