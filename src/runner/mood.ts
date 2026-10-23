// Patience is a budget that frustration spends. The persona sees its mood as words, never numbers.
import type { Feeling, Mood, Persona } from "../types.js";

export interface StepSignals { wrongTurn: boolean; backtrack: boolean; deadClick: boolean; slow: boolean; progress: boolean; feeling: Feeling; refused: boolean }

export function initialMood(p: Persona): Mood {
  return { patience: p.patience.budget, frustration: 0, words: "You're fine, just getting started." };
}

export function updateMood(m: Mood, p: Persona, s: StepSignals): Mood {
  const P = p.patience;
  let patience = m.patience - 0.1; // every step costs a little time
  if (s.wrongTurn) patience -= P.wrongTurnCost;
  if (s.backtrack) patience -= P.wrongTurnCost * 0.5;
  if (s.deadClick) patience -= P.deadClickCost;
  if (s.refused) patience -= P.deadClickCost * 0.5;
  if (s.slow) patience -= P.slowLoadCost;
  if (s.feeling === "stuck" || s.feeling === "lost") patience -= 0.3;
  if (s.progress) patience = Math.min(P.budget, patience + P.progressGain);
  const frustration = Math.max(0, Math.min(1, 1 - patience / P.budget));
  return { patience: Math.round(patience * 100) / 100, frustration: Math.round(frustration * 100) / 100, words: moodWords(frustration, patience) };
}

export function moodWords(f: number, patience: number): string {
  if (patience <= 0) return "You've had enough of this. You'd normally walk away now.";
  if (f >= 0.75) return "You're fed up and very close to giving up.";
  if (f >= 0.5) return "You're annoyed now.";
  if (f >= 0.3) return "You're starting to get impatient.";
  return "You're fine.";
}

/** How long a person takes to look back at the screen after acting. Transients shorter than this can be missed. */
export function reactionMs(p: Persona): number {
  return p.knowledge.web === "expert" ? 800 : p.knowledge.web === "fluent" ? 1200 : 2200;
}
