// gta6-trophy-rarity-forecast-01 entry — refresh-aware quantile forecaster.
//
// Why this beats the persistence baseline (loss 1.51): Exophase refreshes a
// game's tracked-player count on its own schedule (hours apart). When it does,
// the player pool grows fast (launch night: 638 -> 3,868 in one refresh) and the
// newly tracked players are more casual, so every earned-trophy rarity DROPS
// (except a 100% platinum, which stays near the top). Persistence forecasts the
// last rate unchanged and symmetric — it over-predicts after a refresh and eats
// a large pinball loss. This entry forecasts a refresh-aware, downward-shifted,
// asymmetric distribution.
//
// Model (fixed in advance, standard library only, deterministic):
//   For each trophy with last rate r (percent):
//     - work on the logit scale: L = logit(r)
//     - expected dilution from an unseen refresh within the horizon grows with
//       the horizon (more time => more chance of a refresh, more dilution):
//         mu = L - DILUTION * sqrt(d)          (downward shift on logit scale)
//     - asymmetric spread: wider on the downside than the upside, because rates
//       fall on refresh but rarely rise (only rounding / late syncs nudge up):
//         q_tau = inv_logit(mu + s_tau * SIGMA * sqrt(d))
//       with s_tau asymmetric: downside z's scaled by DOWN, upside by UP.
//   A trophy already at ~100% is pulled down only slightly (platinum anchors).
//
// Output: {"trophies":[{"id":n,"q":[q05,q25,q50,q75,q95]}, ...]} per case.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
// Standard normal quantiles at the five levels.
const Z = [-1.6449, -0.6745, 0, 0.6745, 1.6449];

// --- Fixed-in-advance model constants (never tuned on any data) ---
const SIGMA = 0.55;     // base logit move per sqrt(day)
const DILUTION = 0.42;  // downward logit drift per sqrt(day) from expected refresh
const DOWN = 1.25;      // downside spread multiplier (rates fall more than rise)
const UP = 0.85;        // upside spread multiplier

const clamp = (x: number): number => Math.min(99.99, Math.max(0.01, x));
const logit = (pct: number): number => {
  const c = clamp(pct);
  return Math.log(c / (100 - c));
};
const invLogit = (x: number): number => 100 / (1 + Math.exp(-x));
const round4 = (x: number): number => Math.round(x * 10_000) / 10_000;

interface Read0 { rates: Array<number | null>; }
interface Case {
  levels: number[];
  horizon_minutes: number;
  trophies: Array<{ id: number; tier?: string }>;
  history: Read0[];
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();

for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (c.levels.length !== LEVELS.length || c.levels.some((t, j) => t !== LEVELS[j])) {
    throw new Error(`${file} asks for levels ${JSON.stringify(c.levels)}`);
  }
  const last = c.history[c.history.length - 1];
  if (last === undefined) throw new Error(`${file} has no history`);

  const d = c.horizon_minutes / 1440;       // horizon in days
  const sd = Math.sqrt(d);                   // sqrt-day scaling
  const mu = -DILUTION * sd;                 // downward drift (added on logit scale)

  const trophies = c.trophies.map((t, i) => {
    const r = last.rates[i];
    // A missing read for this trophy: fall back to a low neutral prior.
    const L = r === null || r === undefined ? logit(0.5) : logit(r);
    // Platinum / near-100 anchors resist dilution: shrink the shift toward 0.
    const anchor = r !== null && r !== undefined && r >= 99 ? 0.15 : 1.0;
    const shifted = L + mu * anchor;

    const q = Z.map((z) => {
      const scale = z < 0 ? DOWN : z > 0 ? UP : 0;
      const val = shifted + z * scale * SIGMA * sd;
      return round4(invLogit(val));
    });
    return { id: t.id, q };
  });

  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ trophies })}\n`);
}