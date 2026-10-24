import BattleLoader from '../../src/components/BattleLoader';
import { DEMO_BATTLE_ID } from '../../src/engine/demo';

// Demo battle — runs fully on the built-in question bank, no database needed.
export default function StudentDemoPage() {
    return <BattleLoader battleId={DEMO_BATTLE_ID} />;
}
