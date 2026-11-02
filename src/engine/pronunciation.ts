export function normalizePronunciationText(text: string): string {
  let normalized = text.toLowerCase();

  normalized = normalized
    .replace(/don't/g, "do not")
    .replace(/can't/g, "cannot")
    .replace(/it's/g, "it is")
    .replace(/i'm/g, "i am")
    .replace(/we'll/g, "we will");

  normalized = normalized.replace(/[^\w\s]|_/g, '').replace(/\s+/g, ' ').trim();

  return normalized;
}

export function calculateScore({ wer, per, confidence, type }: { wer: number, per: number, confidence: number, type: 'word' | 'sentence' }): number {
  const wordScore = 100 * (1 - wer);
  const phonemeScore = 100 * (1 - per);
  const confScore = 100 * confidence;

  if (type === 'sentence') {
    return Math.round(0.55 * wordScore + 0.30 * phonemeScore + 0.15 * confScore);
  } else {
    return Math.round(0.45 * wordScore + 0.40 * phonemeScore + 0.15 * confScore);
  }
}

export function checkPassThreshold(score: number, level: number): boolean {
  const thresholds: Record<number, number> = {
    0: 50,
    1: 60,
    2: 65,
    3: 70,
    4: 75,
    5: 80
  };
  const threshold = thresholds[level] ?? 80;
  return score >= threshold;
}

export function calculateStars(score: number, passed: boolean): number {
  if (!passed) return 0;
  if (score >= 95) return 3;
  if (score >= 85) return 2;
  return 1;
}

export function evaluateAttempt(attempts: { score: number, passed: boolean }[]): { showHint: boolean, isDone: boolean, finalScore?: number, stars?: number } {
  const passed = attempts.some(a => a.passed);
  const isDone = passed || attempts.length >= 3;
  const showHint = !passed && attempts.length === 2;

  if (isDone) {
    const bestScore = Math.max(...attempts.map(a => a.score));
    const stars = calculateStars(bestScore, passed);
    return { showHint: false, isDone: true, finalScore: bestScore, stars };
  }

  return { showHint, isDone: false };
}

function getEditDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[a.length][b.length];
}

export function evaluateDictation(target: string, input: string): { passed: boolean, stars: number } {
  const t = target.toLowerCase();
  const i = input.toLowerCase();

  if (t === i) {
    return { passed: true, stars: 1 };
  }

  if (t.length >= 5) {
    const dist = getEditDistance(t, i);
    if (dist <= 1) {
      return { passed: true, stars: 1 };
    }
  }

  return { passed: false, stars: 0 };
}

export function evaluateRepeat(): { stars: number, isParticipationOnly: boolean } {
  return { stars: 1, isParticipationOnly: true };
}
