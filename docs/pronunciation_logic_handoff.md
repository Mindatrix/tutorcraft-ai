# Pronunciation Layer: backend logic handoff

> **STATUS: DESIGN ONLY. NOT IMPLEMENTED.** (written 2026-11-03)
>
> None of the following exists in the repo yet:
> - `src/engine/pronunciation.ts`
> - `content/speech_rules.json`
> - the `speech_attempts` table or its migration
> - the speech API route
>
> This document turns the **[PROPOSED]** design in `docs/TECHNICAL_BLUEPRINT.md` (§1.3, §3.2 to §3.6) into a contract the Frontend (Antigravity, `agy/*` branches) can build against with mocks.
>
> The schema change needs owner approval before any migration is written or applied. Field names below are the proposed contract. If the implementation changes them, this file will be updated in the same commit.

Owner of the backend part: Claude Code on `feat/3d-lego-engine` (`src/engine/`, `src/server/`, `app/api/`, `supabase/`).
Owner of the UI part: Antigravity (`app/` pages, `src/components/`, `src/client/`).

---

## 0. Principles the frontend must respect

1. **Voice is optional and never blocks progress.** Every voice task has a typed or tapped path that earns the same game progress. With no mic, no API support, or no consent, the student loses nothing.
2. **The server is the judge.**
   - The browser sends what the recogniser heard.
   - The server recomputes the score from `targetId`, using the target text it holds.
   - The browser may show a *provisional* score, but only the server's reply grants stars or coins.
   - Any score the client sends is ignored.
3. **No IPA from the browser.** `SpeechRecognition` returns text and a confidence value, never phonemes. The UI label is **"Pronunciation score"**, not "IPA accuracy".
4. **Privacy (students are 5+).**
   - Voice mode is **off by default**; the teacher turns it on per class.
   - Show a mic-use notice before the first prompt.
   - **Never send or store audio.** Only the transcript and the score are kept.

---

## 1. Supabase schema: `speech_attempts` (PROPOSED)

Proposed migration file: `supabase/migrations/2026MMDD_speech_attempts.sql`. It is not written yet and **needs owner approval**. It follows the conventions of the existing migrations:
- `uuid` match ids;
- `student_key` text ≤ 64 chars;
- RLS on, writes only through our API with the service role;
- tutors may read rows for their own matches.

```sql
create table if not exists public.speech_attempts (
  id bigint generated always as identity primary key,
  match_id uuid references public.matches(id) on delete cascade,      -- null in demo / solo play
  session_id uuid references public.battle_sessions(id) on delete set null,
  student_key text not null check (char_length(student_key) between 1 and 64),
  target_id text not null check (char_length(target_id) between 1 and 120),
  mode text not null check (mode in ('shadow', 'dictate', 'repeat')),
      -- shadow = spoken + scored, dictate = typed, repeat = listen-and-repeat fallback (unscored)
  transcript text not null default '' check (char_length(transcript) <= 300),
      -- only the target window, never free speech
  score smallint not null check (score between 0 and 100),
  passed boolean not null,
  stars smallint not null default 0 check (stars between 0 and 3),
  attempt_no smallint not null check (attempt_no between 1 and 3),
  level smallint not null check (level between 0 and 5),              -- teaching level used for the threshold
  engine text not null default 'webspeech' check (engine in ('webspeech', 'typed', 'none')),
  detail jsonb not null default '{}'::jsonb,
      -- {wordScore, phonemeScore, confScore, weakWords[]}
  created_at timestamptz not null default now()
);

create index if not exists speech_attempts_lookup
  on public.speech_attempts (match_id, student_key, target_id);

alter table public.speech_attempts enable row level security;
-- No insert/update/delete policy: only the service role (our API) writes.
-- Read policy for tutors, same pattern as coin_ledger: rows of matches where matches.tutor_id = auth.uid().
```

The blueprint lists 11 columns: `id, match_id, student_key, target_id, mode, transcript, score, passed, attempt_no, engine, created_at`. This proposal adds 4 more: `session_id`, `stars`, `level` and `detail`. They let a teacher's report be rebuilt without re-scoring. They are part of the approval request.

### Related schema changes, also needing approval

| What | Why |
|---|---|
| `coin_ledger.reason` check: add `'speech'` | The current check only allows `answer, chot, stage, golden_accept, hint, box, rescue`. Voice coins cannot be paid without it. |
| Class setting `voice_enabled` (default `false`) | Teacher toggle. Its place (on `matches` or on a class table) is decided at implementation time. |
| `content/speech_rules.json` (new content file) | Holds every constant in §2, so tuning needs no code change. |

---

## 2. Scoring: exact formula and thresholds (`src/engine/pronunciation.ts`, PROPOSED)

The function is pure and has no I/O. The same function runs on the server for rewards and, optionally, in the browser for the provisional score.

### 2.1 Normalisation (both target and heard text)

The steps, in order:
1. Lowercase.
2. Strip punctuation.
3. Expand contractions consistently (`don't` → `do not`, `it's` → `it is`).
4. Collapse whitespace.

Score every recogniser alternative and keep the **best one**, meaning the highest final `score`.

### 2.2 Formula

```
wordScore    = 100 × (1 − WER)    # Levenshtein over word tokens, target vs alternative (clamped 0..100)
phonemeScore = 100 × (1 − PER)    # Levenshtein over phoneme sequences (CMUdict → ARPAbet; shown to learners as IPA)
confScore    = 100 × confidence   # used only if confidence > 0

Sentence:    score = 0.55·wordScore + 0.30·phonemeScore + 0.15·confScore
Single word: score = 0.45·wordScore + 0.40·phonemeScore + 0.15·confScore
```

- If `confidence` is missing or `0`, the confidence weight (0.15) moves onto `wordScore`. A sentence then scores `0.70·word + 0.30·phoneme`; a single word scores `0.60·word + 0.40·phoneme`.
- `score` is rounded to an integer between 0 and 100.
- Inside a sentence, each target word whose phoneme match is **< 50** is added to `weakWords` for feedback.

### 2.3 Pass threshold by teaching level

| Level | 0 Beginner | 1 A1 | 2 A2 | 3 B1 | 4 B2 | 5 C1 |
|---|---|---|---|---|---|---|
| Pass if `score ≥` | **50** | **60** | **65** | **70** | **75** | **80** |

### 2.4 Stars, retries, caps

- Stars:
  - Pass gives **1 ★**.
  - `score ≥ 85` gives **2 ★**.
  - `score ≥ 95` gives **3 ★**.
- Up to **3 attempts per target**, and the best attempt counts.
- A miss is **never a penalty**: no coin or star loss.
- After the 2nd miss, the reply sets `hint: 'mouth_shape'` (free tier-1 hint, shown by the Pet). The 3rd attempt opens after a TTS replay.
- Timing:
  - The listening window is **8 s**, or **12 s** at Beginner.
  - Listening stops after **1.8 s** of silence following speech.
  - Total speech under **0.4 s** is rejected as `too_short`, and that attempt is not counted.
- Abuse limits (server):
  - At most **6 voice submissions per student per minute**, tracked in `rate_limits`.
  - The same `targetId` is rewarded at most **3 times per match**.
  - An identical transcript repeated across different targets is flagged in the session `flags`.

### 2.5 Dictation (typed, `mode: 'dictate'`)

- Normalised exact match passes, using the normal stars.
- One edit in a word of ≥ 5 letters passes with **1 ★ max** (`almost: true`).
- Anything else means retry.

### 2.6 Fallback (`mode: 'repeat'`)

This mode applies for Firefox, missing API, a denied mic, or voice turned off by the teacher. The flow is a TTS model plus an "I said it" button. It earns **participation only: ≤ 1 ★, never pass or fail**.

---

## 3. Frontend ↔ backend payloads (PROPOSED contract)

Transport and auth follow the existing session routes, such as `app/api/session/answer/route.ts`:
- method `POST`, JSON body;
- the student session token goes in header **`x-battle-session`**;
- `Cache-Control: no-store`;
- `429` means too many requests;
- error bodies look like `{ error: string }`, with Vietnamese messages.

### 3.1 Targets: the frontend receives these (part of match or session state)

```ts
type SpeechTarget = {
  targetId: string;            // stable id, e.g. "w:three" or "s:<questionId>:0"
  text: string;                // what to say/type, e.g. "three"
  kind: 'word' | 'sentence';
  ipa?: string;                // display only, e.g. "/θriː/" (from CMUdict → IPA on the server)
  modes: Array<'shadow' | 'dictate' | 'repeat'>;
  ttsRate: number;             // 0.85, or 0.7 at Beginner
  listenMs: number;            // 8000, or 12000 at Beginner
  attemptsLeft: number;        // 3 → 0
  stationId?: string;          // where the Phonetic Stone sits (camp station, dock, clearing)
};

type VoiceConfig = {
  enabled: boolean;            // teacher toggle; false → hide the 🎤 path, keep typed/repeat
  lang: 'en-US' | 'en-GB';
};
```

Targets come from the current battle's lesson vocabulary, not from a fixed list.

### 3.2 Submit an attempt (frontend sends)

Proposed route: `POST /api/session/speech`

```ts
type SpeechAttemptRequest = {
  targetId: string;
  mode: 'shadow' | 'dictate' | 'repeat';
  // shadow: the recogniser's final result; maxAlternatives = 5
  transcript?: string;                 // best alternative's text
  alternatives?: Array<{ transcript: string; confidence?: number }>; // ≤ 5, each ≤ 300 chars
  confidence?: number;                 // 0..1; omit or send 0 when the browser gives none
  durationMs?: number;                 // speech duration; < 400 → rejected as too_short
  // dictate: what the student typed
  typed?: string;                      // ≤ 300 chars
  // never: audio, a score, stars, or passed (ignored if sent)
};
```

### 3.3 Server reply (frontend receives)

```ts
type SpeechAttemptResponse = {
  targetId: string;
  accepted: boolean;                   // false → see `reason`; the attempt was not counted
  reason?: 'too_short' | 'rate_limited' | 'no_attempts_left' | 'voice_disabled' | 'unknown_target';
  score: number;                       // 0..100 (server's number; replaces the provisional one)
  passed: boolean;                     // always false for mode 'repeat'
  stars: 0 | 1 | 2 | 3;                // 'repeat' ≤ 1; 'dictate' with almost ≤ 1
  almost?: boolean;                    // dictation one-edit case
  attemptNo: 1 | 2 | 3;
  attemptsLeft: number;
  bestScore: number;                   // best of this target's attempts in this match
  weakWords?: string[];                // sentence words with phoneme match < 50
  hint?: 'mouth_shape';                // after the 2nd miss
  coins?: number;                      // ≥ 0, paid via coin_ledger reason 'speech'; never negative
  detail?: { wordScore: number; phonemeScore: number; confScore: number | null };
};
```

### 3.4 Client state machine and events (for the UI; from blueprint §3.5)

```
idle ──tap──▶ selected ──auto──▶ modeling (TTS) ──end──▶ ready
ready ──tap 🎤──▶ listening        // call SpeechRecognition.start() synchronously in this gesture (iOS)
listening ──final──▶ scoring        // POST §3.2, show provisional score
listening ──timeout/no-speech/error──▶ fallback (typed or repeat; never a dead end)
scoring ──reply──▶ passed | retry(attempt n/3)
passed/retry ──tap elsewhere / Esc──▶ idle
```

Events on the typed bus:
- `stone:hover`, `stone:select`, `stone:model`
- `speech:start`, `speech:interim`, `speech:final`, `speech:error`
- `stone:result {passed, score, stars, attempt}`
- `pet:state`

Recogniser settings:
- `lang` from `VoiceConfig`
- `interimResults = true`, `maxAlternatives = 5`, `continuous = false`
- create the recogniser lazily; call `abort()` on scene dispose or `visibilitychange`

---

## 4. What the frontend can do now

- Build the Phonetic Stone UI, the Pet states and the HUD card against **mocked** `SpeechTarget` and `SpeechAttemptResponse` objects shaped exactly like §3.
- Build the typed and `repeat` fallbacks first, since they need no mic.
- Do **not** compute rewards in the client, and do not call any coin endpoint for voice.

## 5. Backend build order (after owner approval)

1. `src/engine/pronunciation.ts` + `content/speech_rules.json` + `tests/pronunciation.test.ts`, covering normalisation, WER/PER, thresholds per level, stars and caps.
2. Migration `speech_attempts` + the `coin_ledger.reason` `'speech'` change, approved first.
3. `POST /api/session/speech`, with rate limits and per-target caps.
4. Targets exposed in session and match state, plus `VoiceConfig`.
5. Update this file from "PROPOSED" to "IMPLEMENTED", with the real file paths.
