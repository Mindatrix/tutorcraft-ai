# Pronunciation Layer: backend logic handoff

> **STATUS (2026-11-03): backend IMPLEMENTED on `feat/3d-lego-engine`. Migration WRITTEN, NOT APPLIED. No UI yet.**
>
> | Part | File |
> |---|---|
> | Scoring engine (pure, no I/O) | `src/engine/pronunciation.ts` (exported from `src/engine/index.ts`) |
> | Server service, attempts store, rules loader | `src/server/speech.ts` |
> | Endpoint | `app/api/session/speech/route.ts` (`GET` + `POST`) |
> | Session hook | `sessions.speechContext(token)` in `src/server/sessionService.ts` |
> | Coins | `rewardService.speech()` · coin reason `'speech'` in `src/server/coinStore.ts` |
> | Schema | `supabase/migrations/20261103_speech_attempts.sql` |
> | Tunable numbers | `content/speech_rules.json` (optional; being written by Deep Research; see §2.7) |
>
> Until the migration is applied, the route still scores. It keeps attempts in server memory and logs a warning. Voice coins cannot be paid until then either.

Owner of the backend part: Claude Code on `feat/3d-lego-engine` (`src/engine/`, `src/server/`, `app/api/`, `supabase/`).
Owner of the UI part: Antigravity (`app/` pages, `src/components/`, `src/client/`).
Tests: Jules (`jules/*`).

---

## 0. Principles the frontend must respect

1. **Voice is optional and never blocks progress.** Every voice task has a typed or tapped path. With no mic, no API support, or no consent, the student loses nothing.
2. **The server is the judge.**
   - The browser sends what the recogniser heard.
   - The server recomputes the score from `targetId`, using the target text it holds.
   - The browser may show a *provisional* score with the same engine functions. Only the server's reply counts.
   - Any `score`, `stars` or `passed` the client sends is ignored.
3. **No IPA from the browser.** `SpeechRecognition` returns text and a confidence value, never phonemes. The UI label is **"Pronunciation score"**, not "IPA accuracy".
4. **Privacy (students are 5+).**
   - Voice mode is **off by default**. Today the server turns it on **only for the demo** (`demo-*` battles), because classes have no teacher toggle yet.
   - In real classes `GET` returns `voice.enabled: false` and targets without `'shadow'`. Typed dictation and listen-and-repeat still work there.
   - Show a mic-use notice before the first prompt.
   - **Never send audio.** Only the transcript of the target window and the score are kept.

---

## 1. Supabase schema: `speech_attempts`

The file is `supabase/migrations/20261103_speech_attempts.sql`. It is **not applied yet**.

```sql
create table if not exists public.speech_attempts (
  id bigint generated always as identity primary key,
  match_id uuid,                                    -- no FK (same as coin_ledger); null in demo / solo
  session_id uuid references public.battle_sessions(id) on delete set null,
  student_key text not null check (char_length(student_key) between 1 and 64),
  target_id text not null check (char_length(target_id) between 1 and 120),
  mode text not null check (mode in ('shadow', 'dictate', 'repeat')),
  transcript text not null default '' check (char_length(transcript) <= 300),   -- normalised, target window only
  score smallint not null check (score between 0 and 100),
  passed boolean not null,
  stars smallint not null default 0 check (stars between 0 and 3),
  attempt_no smallint not null check (attempt_no between 1 and 3),
  level smallint not null check (level between 0 and 5),
  engine text not null default 'webspeech' check (engine in ('webspeech', 'typed', 'none')),
  detail jsonb not null default '{}'::jsonb,        -- {wordScore, phonemeScore, confScore, weakWords[], flags[]}
  created_at timestamptz not null default now(),
  constraint speech_attempts_once unique (session_id, target_id, attempt_no)
);
-- indexes: (match_id, student_key, target_id) and (session_id, target_id)
```

- **RLS:** enabled; insert, update, delete and truncate are revoked from `anon` and `authenticated`. Only our API writes, with the service role. Tutors can read rows of students who played in their own matches, using the same policy shape as `coin_ledger`.
- **`coin_ledger`:** the reason check now also allows `'speech'`. `coin_apply` is recreated identical to `20261027_coins_seasons.sql` except for `'speech'` in its reason list, and its grants are restated.
- **Demo sessions:** they are not in the database, so their attempts live in server memory.

---

## 2. Scoring: exact formula and thresholds (`src/engine/pronunciation.ts`)

### 2.1 Normalisation (`normalizeSpeech`)

The steps:
1. Lowercase.
2. Expand contractions (shared `normalizeForCompare`).
3. Drop punctuation, apostrophes and hyphens.
4. Write numbers as words: `"3"` → `"three"` (0–20, the tens, and 21–99).
5. Collapse spaces.

Every recogniser alternative is scored, and the **best final score** counts.

### 2.2 Formula

```
wordScore    = 100 × (1 − WER)    # Levenshtein over word tokens, WER capped at 1
phonemeScore = 100 × (1 − PER)    # Levenshtein over phoneme sequences, PER capped at 1
confScore    = 100 × confidence   # only if 0 < confidence ≤ 1

Sentence (2+ words): score = 0.55·word + 0.30·phoneme + 0.15·conf
Single word:         score = 0.45·word + 0.40·phoneme + 0.15·conf
No confidence (missing or 0): the 0.15 moves to wordScore.
score is rounded and clamped to 0..100.
```

**Phonemes are an approximation.**
- There is no pronunciation dictionary in the repo. `wordPhonemes()` turns spelling into ARPAbet-like sounds by rules: digraphs, silent final *e*, soft *c*, and so on.
- A word in `speech_rules.json → lexicon` uses its exact sounds, for example CMUdict `"three": "TH R IY1"` (stress digits are ignored).
- Both target and heard text go through the same rules, so the comparison is consistent even when a rule is wrong for an irregular word.

**`weakWords`** (sentences only): target words whose best sound match against any heard word is **< 50**.

### 2.3 Pass threshold by teaching level (battle `config.level`; missing = 3)

| Level | 0 Beginner | 1 A1 | 2 A2 | 3 B1 | 4 B2 | 5 C1 |
|---|---|---|---|---|---|---|
| Pass if `score ≥` | **50** | **60** | **65** | **70** | **75** | **80** |

### 2.4 Stars, attempts, hint

- **Stars:** a pass gives 1 ★; `score ≥ 85` gives 2 ★; `score ≥ 95` gives 3 ★.
- **Attempts:** at most **3 attempts per target per session** (one session = one match for a student). The best attempt counts, and a miss never costs anything.
- **Hint:** `hint: 'mouth_shape'` comes back on a failed attempt once the student has **2 misses** on that target. Listen-and-repeat never counts as a miss.
- **Too short:** a `shadow` attempt with `durationMs < 400` is refused as `too_short` and does not use an attempt.
- **Timing values sent to the UI:**

  | Value | Default | Beginner |
  |---|---|---|
  | Listening window (`listenMs`) | 8000 | 12000 |
  | TTS rate (`ttsRate`) | 0.85 | 0.7 |

  Stop listening after **1800 ms** of silence; this is client-side and lives in the rules file.

### 2.5 Dictation (`mode: 'dictate'`)

- A normalised exact match scores 100 and passes, normally 3 ★.
- **"Almost":** same number of words, exactly one word off by one letter, and that word has ≥ 5 letters. It passes with **1 ★**, `almost: true`, and a score of at least the pass threshold.
- Anything else fails. Its score is the letter similarity.

### 2.6 Listen-and-repeat (`mode: 'repeat'`)

The student taps "I said it". The reply has `score 0`, `passed false` and **1 ★ participation**. It uses one attempt but is never a miss.

### 2.7 Coins and abuse limits

- **Coins:** `coinsByStars[stars]`. Only the step up to a better star level is paid, once per level, with `ref = sessionId:targetId:s<stars>`. Coins are never negative.
  - **The default is `[0, 0, 0, 0]`, so voice pays no coins until the owner sets the amounts** (coin-table rule).
  - Payment uses the `speech` coin reason, with the per-minute limit of 8 and the match cap of 3000.
- **Rate limits on `POST`:**
  - **6 per student per minute**, shared across instances through `rate_limits`;
  - 2 per second burst;
  - 600 per minute per IP.
- **Same transcript:** if the same spoken words already *passed* on a different target in this session, the attempt is still scored but marked `detail.flags: ['same_transcript']`, and **no coins** are paid.

### 2.8 `content/speech_rules.json` (for Deep Research)

The file is optional. Every key is optional, and a missing, wrong-type or out-of-range value keeps its default. Weights must add up to 1. It is read once when the server starts.

```json
{
  "weights": { "sentence": { "word": 0.55, "phoneme": 0.3, "conf": 0.15 },
               "word":     { "word": 0.45, "phoneme": 0.4, "conf": 0.15 } },
  "passByLevel": [50, 60, 65, 70, 75, 80],
  "stars": { "two": 85, "three": 95 },
  "maxAttempts": 3,
  "weakPhonemeBelow": 50,
  "listenMs": { "default": 8000, "beginner": 12000 },
  "silenceStopMs": 1800,
  "minSpeechMs": 400,
  "ttsRate": { "default": 0.85, "beginner": 0.7 },
  "submissionsPerMinute": 6,
  "repeatStars": 1,
  "dictationAlmostMinLetters": 5,
  "coinsByStars": [0, 0, 0, 0],
  "maxTargets": 30,
  "maxTargetWords": 12,
  "lexicon": { "three": "TH R IY1", "bread": "B R EH1 D" },
  "ipa": { "three": "/θriː/", "bread": "/bred/" }
}
```

---

## 3. Frontend ↔ backend contract

Transport and auth are the same as the other session routes:
- JSON body;
- the student token goes in header **`x-battle-session`**;
- `Cache-Control: no-store`;
- errors look like `{ error: string }`, with Vietnamese messages;
- `401` means the session is invalid or expired; `409` means the session is flagged.

### 3.1 `GET /api/session/speech`: targets

```ts
type SpeechTargetsReply = {
  voice: { enabled: boolean; lang: 'en-US' | 'en-GB' };   // enabled = demo only, for now
  targets: SpeechTarget[];
};

type SpeechTarget = {
  targetId: string;        // "q<questionId>w" = the answer word/phrase, "q<questionId>s" = the filled sentence
  text: string;            // what to say / type, e.g. "tent", "We sleep in a tent at the summer camp."
  kind: 'word' | 'sentence';
  ipa?: string;            // only when speech_rules.json → ipa has the word (never guessed)
  modes: Array<'shadow' | 'dictate' | 'repeat'>;   // no 'shadow' when voice is disabled
  ttsRate: number;         // 0.85, or 0.7 at Beginner
  listenMs: number;        // 8000, or 12000 at Beginner
  attemptsLeft: number;    // 3 → 0
};
```

**Where targets come from:** only questions the student has **already answered**, because their answer was revealed, so showing the text leaks nothing. Re-fetch after each answer.

| Question type | Targets |
|---|---|
| Multiple choice | The right option (`q12w`). If the question has exactly one `_____` blank, also the sentence with it filled in (`q12s`). |
| Reorder | The sentence (`q12s`). |
| Transform | The first accepted rewrite (`q12s`). |

Limits: English text only, ≤ 12 words, no duplicates, ≤ 30 targets.

### 3.2 `POST /api/session/speech`: submit an attempt

```ts
type SpeechAttemptRequest = {
  targetId: string;
  mode: 'shadow' | 'dictate' | 'repeat';
  // shadow (recogniser final result; set maxAlternatives = 5)
  transcript?: string;                                              // ≤ 300 chars
  alternatives?: Array<{ transcript: string; confidence?: number }>; // ≤ 5 used
  confidence?: number;     // 0..1 for `transcript`; omit or 0 when the browser gives none
  durationMs?: number;     // speech duration; < 400 → refused as too_short
  // dictate
  typed?: string;          // ≤ 300 chars
  // never send: audio, score, stars, passed (ignored)
};
```

### 3.3 Reply

```ts
type SpeechAttemptResponse = {
  targetId: string;
  accepted: boolean;       // false → `reason`; nothing was stored and no attempt was used
  reason?: 'too_short' | 'no_attempts_left' | 'voice_disabled' | 'unknown_target';
  score: number;           // 0..100, the server's number
  passed: boolean;         // always false for 'repeat'
  stars: 0 | 1 | 2 | 3;    // 'repeat' = 1; dictation "almost" = 1
  almost?: true;
  attemptNo: number;       // 1..3 (when refused: attempts used so far)
  attemptsLeft: number;
  bestScore: number;       // best score on this target in this session
  weakWords?: string[];    // sentence words with sound match < 50
  hint?: 'mouth_shape';    // after the 2nd miss
  coins?: number;          // only present when coins were paid (≥ 0)
  detail?: { wordScore: number; phonemeScore: number; confScore: number | null };   // shadow only
};
```

HTTP status codes:

| Code | When |
|---|---|
| `200` | Every scored attempt, and the four `accepted: false` cases above. |
| `400` | Bad JSON or an unknown `mode`. |
| `401` | Bad or expired token. |
| `409` | The session is flagged, or the same attempt number arrived twice (retry). |
| `429` | Rate limited. Body: `{ error, reason: 'rate_limited', retryAfterSec }`. |

### 3.4 Client state machine and events (blueprint §3.5)

```
idle ──tap──▶ selected ──auto──▶ modeling (TTS) ──end──▶ ready
ready ──tap 🎤──▶ listening        // SpeechRecognition.start() synchronously in this gesture (iOS)
listening ──final──▶ scoring        // POST §3.2; may show a provisional score from src/engine/pronunciation.ts
listening ──timeout/no-speech/error──▶ fallback (dictate or repeat; never a dead end)
scoring ──reply──▶ passed | retry(attempt n/3)
passed/retry ──tap elsewhere / Esc──▶ idle
```

Events on the typed bus:
- `stone:hover`, `stone:select`, `stone:model`
- `speech:start`, `speech:interim`, `speech:final`, `speech:error`
- `stone:result {passed, score, stars, attempt}`
- `pet:state`

Recogniser settings: `lang` from `voice.lang`, `interimResults = true`, `maxAlternatives = 5`, `continuous = false`. Create it lazily, and call `abort()` on scene dispose or `visibilitychange`.

---

## 4. Not done yet (needs a decision or another owner)

| Item | Owner / blocker |
|---|---|
| Apply `20261103_speech_attempts.sql` to Supabase | Owner |
| Coin amounts `coinsByStars` (default 0 = no coins) | Owner (coin-table rule) |
| Teacher toggle for voice in real classes (schema + Studio UI) | Owner approval, then backend + Antigravity |
| Exact sounds / IPA: a `lexicon` + `ipa` list (e.g. from CMUdict) | `content/speech_rules.json` (Deep Research) |
| Voice stars counted into match stars / ranking | Game integration (per-game rules in blueprint §3.5) |
| Unit tests `tests/pronunciation.test.ts` | Jules |
| Phonetic Stones, Pet, HUD card, `useSpeechRecognition` hook | Antigravity |
