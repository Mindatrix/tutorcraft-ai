# WP8: Phonetic Stones in kayak_rush, river_survival, multiverse_portal (handoff to Antigravity)

> Written 2026-11-03 by Claude Code (backend). **Server side DONE; 3D placement TO DO (Antigravity, `agy/*`).**
>
> Split agreed with the owner:
> - Claude Code decided what a successful attempt does in each world, on the server.
> - Antigravity places the stones and Pet/Lumi in the 3D scenes and plays the effect the server sends.
>
> Base contract: `docs/pronunciation_logic_handoff.md` (targets, attempts, scores, coins).

## 1. What the server now returns

`POST /api/session/speech` replies with an optional **`effect`** on a successful attempt.
- A typed dictation or a listen-and-repeat counts too: voice stays optional and earns the same game progress.
- **Only play effects that come from this reply.** Never build one in the browser. A forged `effect` in the request body is ignored.

```ts
type PetState = 'idle' | 'listening' | 'celebrate' | 'coach';   // from src/engine (speechGameEffects.ts)

type SpeechGameEffect =
  | { kind: 'kayak_nitro';  chargeSec: number; pet: PetState }
  | { kind: 'decoder_clue'; solved: number; nextAt: number | null; unlocked: ('pen' | 'net')[];
      newlyUnlocked: 'pen' | 'net' | null; pet: PetState }
  | { kind: 'portal_open';  pet: PetState };
```

The battle's `config.gameMode` decides which effect comes back. Pure helpers are in `src/engine/speechGameEffects.ts`, and tests in `tests/speechGameEffects.test.ts`:
- `speechGameEffect()`;
- `rageAddCharge()`;
- `petStateFor()`;
- `SPEECH_GAME_HOOKS`, the numbers.

No effect comes back for:
- a miss;
- a flagged attempt (same transcript on another stone);
- a stone already done (River Survival, Multiverse);
- no step up in stars (Kayak).

## 2. Per world

### a) `kayak_rush`: stones on buoy gates

- **Placement:** float one stone above a buoy gate along the course. Keep at most 12 in the scene; recycle meshes as gates pass.
- **Effect:** on `effect.kind === 'kayak_nitro'`, call `rageAddCharge(rage, effect.chargeSec)` (engine) on the U5 rage state.
  - The charge comes from the best star level reached on that stone: 1 ★ = 4 s, 2 ★ = 6 s, 3 ★ = 8 s of a 30 s bar.
  - Only the step up is sent. For example, 1 ★ then 3 ★ gives 4 s + 4 s.
  - While boosting, the charge is ignored, so apply it after the boost.
- **Unchanged:** rage stays look-only, and the race result is still decided by answers on the server. Do not open a stone while the question frame is open; that rule is already in the machine.

### b) `river_survival`: clearing stones for the "Thợ giải mã" (Decoder)

- **Placement:** stones in clearing stations, shown to the Decoder role.
- **Role gating is client-side for now.** The server has no per-student role yet: `match_players` has a team, not a role. The server therefore counts clue progress for any player of a River Survival battle. If the role must be enforced on the server, that is a schema change and needs owner approval.
- **Effect:** `decoder_clue`.
  - `solved` = distinct stones done this session.
  - 2 stones unlock **`pen`**, the Wooden Pen (Chuồng Gỗ) clue.
  - 4 stones unlock **`net`**, the Tag Net clue.
  - Show the newly unlocked clue when `newlyUnlocked` is set, and show progress with `solved / nextAt`.
  - Positions are drawn by the clients (as in `survivalRules.ts`), so the clue's location is the scene's job.
- **Must not touch the timed questions.** Voice never replaces the "Né lưới" 6 s or "Cướp lưới" 8 s questions. Those stay answer-only through the match API; the speech route does not read or change survival state.
  - While a dodge or snatch window is open, keep stones unselectable (`questionOpen`/`paused` in the stage).
- **Voice stays optional.** Offer `dictate` and `repeat` on every stone; they earn the same clue progress.

### c) `multiverse_portal`: altar stones at portal thresholds

- **Placement:** an elemental altar stone near the threshold of the current room (RoomKit / `content/multiverse_rooms.json`).
- **Effect:** `portal_open` on the first success on a stone. Play the portal transition along the card rail (`portalRail.ts`) and set Lumi to `effect.pet` (`celebrate`).
- **Unchanged:** this is visual only. The story **stage** still follows the server schedule, so do not advance the stage from the client.

## 2b. Wiring already in place (03/11, after merging PR #4)

| World | Hook to call with the server's `reply.effect` |
|---|---|
| Kayak | `useKayakRage(...).addCharge(effect.chargeSec)` (`src/components/hud/KayakRage.tsx`) for `kayak_nitro` |
| River Survival | `applySurvivalSpeechEffect(environment, effect, zoneId)` (`three/RiverSurvival/speechEffects.ts`) for `decoder_clue` |
| River Survival (gate) | `survivalStonesOpen({ now, questionOpen, dodgeUntil, snatchUntil })` (`src/engine`) |

What `applySurvivalSpeechEffect` does:
- pulses the zone's cipher beacon (`pulseCipherClue`);
- on a newly unlocked clue, moves the camera to the zone (`focusZone`);
- returns `{ reveal: { clue, zoneId, position }, progress: { solved, nextAt } }` for a HUD marker or a minimap ping. `position` is the zone's `penPosition` or `netStationPosition`.

`survivalStonesOpen` returns false while a question, the 6 s dodge or the 8 s snatch window is open. Call it before `machine.selectStone()`.

**Still to do (Antigravity):**
- Place the clearing stones in `RiverSurvivalScene` (none yet) and route their `stone:result` effect to `applySurvivalSpeechEffect`.
- Place buoy-gate stones in `KayakRush.tsx` and route `kayak_nitro` to `rage.addCharge`.
- Add a `stone:effect` event, or the effect in the `stone:result` payload, to the machine's bus.
- `RiverSurvivalStage` is not in a match or scene-lab yet. Its debug buttons (open the pen gate, throw the net) must not reach students.

## 3. State machine, events, raycasting

**Events:** the bus in `src/client/phoneticStones.ts` already has every event the brief asks for: `stone:select`, `stone:model`, `speech:start`, `speech:final`, `stone:result`, `pet:state`, plus hover, interim, error and state.
- Add the server `effect` to the `stone:result` payload, or emit a `stone:effect` event, and drive `pet:state` from `effect.pet`.
- `PetState` in the engine has the same four values as the client's type; import it from `src/engine` to keep them in sync.

**Raycasting** (`phoneticStoneRaycaster.ts`, `three/phoneticStones.ts`). Already good:
- `Raycaster` and `Vector2` are created once and reused;
- at most 12 stones;
- hover throttled to 30 Hz;
- tap = ≤ 300 ms and ≤ 8 px.

**One allocation left:** `raycaster.intersectObjects(children, true)` returns a **new array on every call** (taps and 30 Hz hover). Reuse one:

```ts
const hits: THREE.Intersection[] = [];          // once, next to raycaster / ndc
// in raycastPhoneticStones():
hits.length = 0;
raycaster.intersectObjects(interactiveGroup.children, true, hits);
```

## 4. Before wiring stones into REAL matches (all 5 worlds)

The `ModeStage.tsx` wiring for summer_camp and river_fishing was held back at integration (78b1459), because in a real match the stage still runs on mock data. The same checklist applies to these three worlds:

1. Targets from `GET /api/session/speech` (`sessionApi.speechTargets`), not `SUMMER_CAMP_TARGETS` / `RIVER_FISHING_TARGETS` / mocks.
2. Attempts through `POST /api/session/speech` (`sessionApi.speechAttempt`, the machine's `submitAttempt` option). No `evaluateMockSpeechAttempt` in a match; the browser score is provisional only.
3. Mic on only when the server says so (`voice.enabled`, currently demo only). Never use `MOCK_VOICE_CONFIG` in a match.
4. `showMockPresets={false}` in matches (the "AI Studio Mock JSON Presets" buttons).
5. Coins and stars shown from the server reply only.

Re-fetch targets after each answered question: they unlock as answers are revealed.
