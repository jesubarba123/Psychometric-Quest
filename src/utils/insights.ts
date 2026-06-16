// insights.ts
// Análisis secundarios sobre los datos del candidato — diseñados para mantenerse
// en lo defendible: descripción, comparación relativa al pool y calidad de datos.
// NO produce afirmaciones de validez de criterio (eso requiere datos de desempeño).

import type { Candidate } from "../types";
import { computeComposite } from "./compositeAxes";

// ─── Helpers estadísticos ──────────────────────────────────────────────────────

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
}
function longestRun(xs: number[]): number {
  let best = 0, cur = 0;
  for (let i = 0; i < xs.length; i++) {
    cur = i > 0 && xs[i] === xs[i - 1] ? cur + 1 : 1;
    best = Math.max(best, cur);
  }
  return best;
}
function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? null : Math.round((num / den) * 100) / 100;
}

// ─── 1. Calidad de datos ───────────────────────────────────────────────────────

export interface QualityFlag { code: string; label: string; severity: "warn" | "info"; }
export interface DataQuality { level: "ok" | "review" | "low"; score: number; flags: QualityFlag[]; }

const EXPECTED_GAMES: Array<{ type: string; name: string }> = [
  { type: "switch_answer", name: "Switchboard" },
  { type: "memory_result", name: "Memory Surge" },
  { type: "raven_result", name: "Raven" },
  { type: "signal_surge_result", name: "Signal Surge" },
  { type: "ops_choice", name: "Ops Queue" },
  { type: "route_choice", name: "Route Risk" },
];

export function dataQuality(candidate: Candidate): DataQuality {
  const flags: QualityFlag[] = [];
  const events = candidate.events ?? [];

  // RTs anticipatorios / al azar
  const rts: number[] = [];
  for (const event of events) {
    if (["switch_answer", "signal_surge_event", "memory_event", "raven_item"].includes(event.type)) {
      const rt = Number(event.payload.rt);
      if (Number.isFinite(rt) && rt > 0) rts.push(rt);
    }
  }
  if (rts.length >= 8) {
    const fast = rts.filter((r) => r < 200).length / rts.length;
    if (fast > 0.25) flags.push({ code: "fast", label: `${Math.round(fast * 100)}% de respuestas <200 ms (posible respuesta al azar)`, severity: "warn" });
  }

  // Juegos faltantes (solo relevante si ya completó la evaluación)
  if (candidate.status === "completed") {
    const missing = EXPECTED_GAMES.filter((game) => !events.some((event) => event.type === game.type));
    if (missing.length) flags.push({ code: "incomplete", label: `Sin datos de: ${missing.map((m) => m.name).join(", ")}`, severity: "warn" });
  }

  // Careless responding en la encuesta (straight-lining)
  const answers = candidate.surveyAnswers ? Object.values(candidate.surveyAnswers) : [];
  if (answers.length >= 10) {
    if (stdDev(answers) < 0.4) flags.push({ code: "straightline", label: "Encuesta con varianza casi nula (respuestas idénticas)", severity: "warn" });
    else if (longestRun(answers) >= 12) flags.push({ code: "run", label: "Racha larga de la misma respuesta en la encuesta", severity: "info" });
  }

  // Inconsistencia del Big Five: ítems directos vs inversos incoherentes (posible descuido)
  if (candidate.personality && candidate.personality.inconsistency > 60) {
    flags.push({ code: "inconsistency", label: `Big Five incoherente (índice ${candidate.personality.inconsistency}/100): respuestas directas e inversas no concuerdan`, severity: "warn" });
  }

  const warns = flags.filter((f) => f.severity === "warn").length;
  const infos = flags.filter((f) => f.severity === "info").length;
  const score = clamp(100 - warns * 30 - infos * 10);
  const level: DataQuality["level"] = score >= 80 ? "ok" : score >= 50 ? "review" : "low";
  return { level, score, flags };
}

// ─── 2. Percentil dentro del pool ──────────────────────────────────────────────

export function percentileInPool(value: number, pool: number[]): number {
  if (!pool.length) return 50;
  const below = pool.filter((v) => v < value).length;
  const equal = pool.filter((v) => v === value).length;
  return Math.round(((below + equal * 0.5) / pool.length) * 100);
}

// Ancho de banda de confianza (± percentiles) según tamaño del pool
export function percentileBand(n: number): number {
  if (n >= 50) return 5;
  if (n >= 20) return 10;
  if (n >= 10) return 15;
  return 25;
}

// ─── 3. Brecha CV ↔ aptitud medida ─────────────────────────────────────────────

export interface CvGap { cv: number | null; aptitude: number | null; gap: number | null; note: string; }

export function cvAptitudeGap(candidate: Candidate): CvGap {
  const comp = computeComposite(candidate);
  const aptitude = comp ? Math.round((comp.cognition + comp.strategy + comp.riskCalibrated) / 3) : null;
  const cv = candidate.cvMatch?.score ?? null;
  if (cv == null || aptitude == null) return { cv, aptitude, gap: null, note: "Faltan CV o resultados de juegos para comparar." };
  const gap = aptitude - cv;
  const note = Math.abs(gap) <= 10
    ? "CV y aptitud medida alineados."
    : gap > 10
      ? "Rinde por encima de lo que sugiere su CV (posible talento subvalorado en papel)."
      : "Su CV promete más de lo que mostró en los juegos (conviene verificar en entrevista).";
  return { cv, aptitude, gap, note };
}

// ─── 4. Fit a la posición ──────────────────────────────────────────────────────

export interface TargetProfile { cognition: number; strategy: number; riskCalibrated: number; }
export const DEFAULT_TARGET: TargetProfile = { cognition: 80, strategy: 80, riskCalibrated: 70 };

export function positionFit(candidate: Candidate, target: TargetProfile = DEFAULT_TARGET): number | null {
  const comp = computeComposite(candidate);
  if (!comp) return null;
  const dist = Math.sqrt(
    ((comp.cognition - target.cognition) ** 2 +
      (comp.strategy - target.strategy) ** 2 +
      (comp.riskCalibrated - target.riskCalibrated) ** 2) / 3,
  );
  return clamp(Math.round(100 - dist));
}

// ─── 5. Matriz de correlación entre dimensiones ────────────────────────────────

export const CORR_DIMENSIONS = [
  { key: "adaptability", label: "Adaptab." },
  { key: "prioritization", label: "Prioriz." },
  { key: "executiveControl", label: "Ctrl ejec." },
  { key: "calculatedRisk", label: "Riesgo" },
  { key: "sustainedAttention", label: "Atención" },
  { key: "workingMemory", label: "Memoria" },
  { key: "fluidReasoning", label: "Razon." },
] as const;

export interface CorrelationResult { labels: string[]; matrix: (number | null)[][]; n: number; reliable: boolean; }

export function correlationMatrix(candidates: Candidate[]): CorrelationResult {
  const rows = candidates
    .map((c) => c.behavioral)
    .filter((b): b is NonNullable<typeof b> => Boolean(b));
  const labels = CORR_DIMENSIONS.map((d) => d.label);
  const matrix = CORR_DIMENSIONS.map((a) =>
    CORR_DIMENSIONS.map((b) => {
      const pairs = rows
        .map((r) => [r[a.key as keyof typeof r], r[b.key as keyof typeof r]] as [unknown, unknown])
        .filter(([x, y]) => typeof x === "number" && typeof y === "number") as [number, number][];
      if (pairs.length < 3) return null;
      return pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
    }),
  );
  return { labels, matrix, n: rows.length, reliable: rows.length >= 10 };
}
