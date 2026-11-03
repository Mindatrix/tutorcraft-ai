// Dino Journey live match (03/11/2026): the 6 core stages share the battle's questions in order;
// each question has one environmental checkpoint in its stage.

export const STAGES = 6;

/** Stage (1..6) of question `qIndex` of `qTotal`, the same split as the scenario's 6 core stages. */
export function dinoStageOf(qIndex: number, qTotal: number): number {
  return Math.max(1, Math.min(STAGES, 1 + Math.floor((Math.max(0, qIndex) / Math.max(1, qTotal)) * STAGES)));
}

/** Questions of a stage: [from, to). */
export function dinoStageQuestions(stage: number, qTotal: number): [number, number] {
  const from = Math.ceil(((stage - 1) * qTotal) / STAGES);
  const to = Math.ceil((stage * qTotal) / STAGES);
  return [from, Math.max(from, to)];
}
