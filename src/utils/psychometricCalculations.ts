import { deviation, mean as d3Mean, quantileSorted } from "d3";
import type { GameEvent } from "../types";
import type {
  CandidateProfile,
  FrogRiskMetrics,
  RiskChoiceEvent,
  RiskChoiceId,
  SignalEvent,
  SignalSurgeMetrics,
} from "../psychometrics/types";

// ─── Constantes de scoring — ver docs/SCORING.md ────────────────────────────

// Parámetros de tarea de riesgo (FrogLeap): recompensas y probabilidades de fallo
// por tipo de elección. PROVISIONAL — sin calibrar (requiere datos). §4.1
const RISK_META: Record<RiskChoiceId, { reward: number; risk: number }> = {
  safe:  { reward: 6,  risk: 0.08 }, // ruta segura: recompensa baja, riesgo bajo
  probe: { reward: 12, risk: 0.32 }, // ruta moderada
  leap:  { reward: 22, risk: 0.56 }, // ruta arriesgada: recompensa alta, riesgo alto
};

// Estructura de la tarea Signal Surge (CPT). §4.2
const PHASES = [1, 2, 3];
const SIGNAL_TRIALS_PER_PHASE = 10;    // ensayos por fase (30 total)
const TARGET_RATIO = 0.4;              // proporción de ensayos que son objetivos (40 %)
const TARGETS_PER_PHASE = Math.round(SIGNAL_TRIALS_PER_PHASE * TARGET_RATIO);    // 4 objetivos/fase
const DISTRACTORS_PER_PHASE = SIGNAL_TRIALS_PER_PHASE - TARGETS_PER_PHASE;       // 6 distractores/fase

// ─── Constantes de normalización de RT (Signal Surge) — ver docs/SCORING.md §4.2 ──
// RT mínimo esperado (ms): TR por debajo de este valor se considera perfecto (rtScore=1).
// PROVISIONAL — sin calibrar (requiere datos)
const RT_FLOOR_MS = 200;
// Rango de RT usado para la normalización lineal: rtScore = 1 - (rt - RT_FLOOR_MS) / RT_RANGE_MS.
// Un RT de RT_FLOOR_MS + RT_RANGE_MS (=900 ms) produce rtScore = 0.
// PROVISIONAL — sin calibrar (requiere datos)
const RT_RANGE_MS = 700;

// ─── Constantes de puntuación de riesgo ajustado (FrogLeap) — ver docs/SCORING.md §4.1 ──
// Divisor para risk-adjusted score: riskAdjustedScore = finalScore / (1 + meanRisk).
// La normalización asume que un score sin riesgo (meanRisk≈0) de 80 puntos
// equivale a un rendimiento perfecto (100). PROVISIONAL — sin calibrar.
const FROG_DECISION_QUALITY_DIVISOR = 80;

// Umbrales del perfil de decisión (meanRisk). PROVISIONAL — sin calibrar (requiere datos). §4.1
const FROG_DECISION_CONSERVATIVE_THRESHOLD = 0.2;  // por debajo: perfil "conservative"
const FROG_DECISION_RECKLESS_THRESHOLD = 0.44;     // por encima: perfil "reckless"

// Umbral de delta post-fallo para clasificar el cambio de riesgo. PROVISIONAL. §4.1
const FROG_FAILURE_DELTA_THRESHOLD = 0.05;

// ─── Constantes de Signal Surge composite — ver docs/SCORING.md §4.2 ──────────
// Pesos en el composite de atención sostenida (suma máxima = 100 con RT, 75 sin RT).
// PROVISIONAL — sin calibrar (requiere datos)
const SIGNAL_HIT_RATE_WEIGHT = 50;    // peso del hit-rate en el composite
const SIGNAL_FA_WEIGHT = 25;           // peso del componente de falsas alarmas
const SIGNAL_RT_WEIGHT = 25;           // peso del componente de RT (excluido si meanRt=null)
const SIGNAL_FA_SCALE = 5;             // escala de la penalización por FA: min(faRate * FA_SCALE, 1)
const SIGNAL_DECAY_FACTOR = 0.2;       // fracción del decayIndex que penaliza el composite

// ─── Constantes de cognitiveConsistency — ver docs/SCORING.md §4.2 ────────────
// Un CV ≥ CV_MAX se mapea a cognitiveConsistency=0; un CV=0 a cognitiveConsistency=100.
// PROVISIONAL — sin calibrar (requiere datos)
const CV_MAX = 0.5;

export function extractFrogEvents(events: GameEvent[]): RiskChoiceEvent[] {
  return events
    .filter((event) => event.type === "route_choice")
    .map((event) => {
      const choice = parseRiskChoice(event.payload.choice);
      return {
        choice,
        reward: Number(event.payload.reward ?? RISK_META[choice].reward),
        risk: Number(event.payload.risk ?? RISK_META[choice].risk),
        failed: Boolean(event.payload.failed),
        score: Number(event.payload.score ?? 0),
      };
    });
}

export function extractSignalEvents(events: GameEvent[]): SignalEvent[] {
  return events
    .filter((event) => event.type === "signal_surge_event")
    .map((event) => {
      const type = String(event.payload.type);
      const phase = Number(event.payload.phase ?? 1);
      if (type === "hit") {
        return { type: "hit", rt: Number(event.payload.rt ?? 0), phase } satisfies SignalEvent;
      }
      if (type === "false_alarm") {
        return { type: "false_alarm", phase } satisfies SignalEvent;
      }
      return { type: "miss", phase } satisfies SignalEvent;
    });
}

export function calculateFrogMetrics(events: RiskChoiceEvent[]): FrogRiskMetrics {
  const riskSequence = events.map((event) => event.risk);
  const meanRisk = round(mean(riskSequence), 3);
  const riskStdDev = round(stdDev(riskSequence), 3);
  const maxObservedRisk = Math.max(...Object.values(RISK_META).map((item) => item.risk));
  const calculatedRisk = clamp(Math.round((meanRisk / maxObservedRisk) * 100), 0, 100);

  const postFailureDelta = events
    .flatMap((event, index) => {
      if (!event.failed || index >= riskSequence.length - 1) return [];
      return [round(riskSequence[index + 1] - riskSequence[index], 3)];
    });

  const avgDelta = mean(postFailureDelta);
  // ver docs/SCORING.md §4.1 — FROG_FAILURE_DELTA_THRESHOLD
  const riskAfterFailure =
    avgDelta < -FROG_FAILURE_DELTA_THRESHOLD ? "reduces" :
    avgDelta > FROG_FAILURE_DELTA_THRESHOLD ? "escalates" :
    "maintains";

  // B5 — track whether any failure occurred so consumers can suppress the
  //      lossResilience display (50 is a neutral placeholder when hasFailures=false).
  const hasFailures = postFailureDelta.length > 0;
  const resilience = hasFailures
    ? postFailureDelta.filter((delta) => delta <= 0).length / postFailureDelta.length
    : 0.5;
  const lossResilience = Math.round(resilience * 100);

  const capitalHistory = [0, ...events.map((event) => event.score)];
  const finalScore = capitalHistory[capitalHistory.length - 1] ?? 0;
  const riskAdjustedScore = round(finalScore / (1 + meanRisk), 1);
  // ver docs/SCORING.md §4.1 — FROG_DECISION_QUALITY_DIVISOR
  const decisionQuality = clamp(Math.round((riskAdjustedScore / FROG_DECISION_QUALITY_DIVISOR) * 100), 0, 100);
  const totalGains = events.filter((event, index) => event.score > (index === 0 ? 0 : events[index - 1].score)).length;
  const totalLosses = events.filter((event, index) => event.score < (index === 0 ? 0 : events[index - 1].score)).length;
  // ver docs/SCORING.md §4.1 — FROG_DECISION_CONSERVATIVE/RECKLESS_THRESHOLD
  const decisionProfile =
    meanRisk < FROG_DECISION_CONSERVATIVE_THRESHOLD ? "conservative" :
    meanRisk > FROG_DECISION_RECKLESS_THRESHOLD ? "reckless" :
    "balanced";

  return {
    calculatedRisk,
    riskSequence,
    meanRisk,
    riskStdDev,
    lossResilience,
    hasFailures,
    postFailureDelta,
    riskAfterFailure,
    decisionQuality,
    riskAdjustedScore,
    decisionProfile,
    capitalHistory,
    finalScore,
    totalGains,
    totalLosses,
  };
}

export function calculateSignalMetrics(events: SignalEvent[]): SignalSurgeMetrics {
  const hitEvents = events.filter((event): event is Extract<SignalEvent, { type: "hit" }> => event.type === "hit");
  const rts = hitEvents.map((event) => event.rt).filter((rt) => Number.isFinite(rt) && rt > 0);

  // CRIT-1 — cuando no hay hits, todas las métricas de RT son null.
  // Un rts vacío hacía mean([])→0, rtScore→1.0, processingSpeed→100 (bug inverso al 999).
  // Principio: excluir el faltante > inventar un valor que deforme el composite.
  const hasHits = rts.length > 0;
  const meanRt: number | null = hasHits ? Math.round(mean(rts)) : null;
  const medianRt: number | null = hasHits ? Math.round(percentile(rts, 50)) : null;
  const rtP25: number | null = hasHits ? Math.round(percentile(rts, 25)) : null;
  const rtP75: number | null = hasHits ? Math.round(percentile(rts, 75)) : null;
  const rtStdDev: number | null = hasHits ? Math.round(stdDev(rts)) : null;
  // NUEVO-MIN-2: guard explícito — evita división por cero o falsy-number si meanRt fuera 0.
  const cvRt: number | null = (hasHits && meanRt !== null && meanRt !== 0) ? round(rtStdDev! / meanRt, 2) : null;
  const consistencyLabel: SignalSurgeMetrics["consistencyLabel"] =
    cvRt === null ? "n/a" :
    cvRt < 0.2 ? "consistent" :
    cvRt < 0.35 ? "moderate" :
    "variable";
  const rtOutliers = (hasHits && meanRt !== null && rtStdDev !== null)
    ? rts.filter((rt) => rt > meanRt + 2 * rtStdDev)
    : [];

  const metricsByPhase = PHASES.map((phase) => {
    const phaseEvents = events.filter((event) => event.phase === phase);
    const hits = phaseEvents.filter((event) => event.type === "hit").length;
    const misses = phaseEvents.filter((event) => event.type === "miss").length;
    const falseAlarms = phaseEvents.filter((event) => event.type === "false_alarm").length;
    const phaseRts = phaseEvents
      .filter((event): event is Extract<SignalEvent, { type: "hit" }> => event.type === "hit")
      .map((event) => event.rt);
    return {
      phase,
      hitRate: round(ratio(hits, hits + misses), 2),
      faRate: round(ratio(falseAlarms, DISTRACTORS_PER_PHASE), 3),
      // null cuando no hubo hits en esa fase (mismo principio que meanRt global)
      meanRt: phaseRts.length > 0 ? Math.round(mean(phaseRts)) : null,
    };
  });

  const hitRateByPhase = metricsByPhase.map((metric) => metric.hitRate);
  const falseAlarmsByPhase = PHASES.map((phase) => events.filter((event) => event.type === "false_alarm" && event.phase === phase).length);
  const decayIndex = round(Math.max(0, hitRateByPhase[0] - hitRateByPhase[2]), 2);
  const fatigueLabel =
    decayIndex < 0.1 ? "stable" :
    decayIndex < 0.25 ? "mild_decay" :
    "notable_decay";

  const totalFalseAlarms = falseAlarmsByPhase.reduce((sum, value) => sum + value, 0);
  const falseAlarmRate = round(ratio(totalFalseAlarms, DISTRACTORS_PER_PHASE * PHASES.length), 3);
  const impulsivityLabel =
    totalFalseAlarms <= 2 ? "low" :
    totalFalseAlarms <= 5 ? "moderate" :
    "high";

  const globalHits = hitEvents.length;
  const globalMisses = events.filter((event) => event.type === "miss").length;
  const hitRate = ratio(globalHits, globalHits + globalMisses);
  const dPrime = round(zScore(hitRate) - zScore(falseAlarmRate), 2);
  // CRIT-1 — rtScore es null cuando no hay hits; se excluye del composite
  // en vez de contribuir con 1.0 (el valor máximo que producía el bug).
  // ver docs/SCORING.md §4.2 — RT_FLOOR_MS, RT_RANGE_MS
  const rtScore = hasHits && meanRt !== null
    ? clamp(1 - (meanRt - RT_FLOOR_MS) / RT_RANGE_MS, 0, 1)
    : null;
  const rtComponent = rtScore !== null ? rtScore * SIGNAL_RT_WEIGHT : 0;
  // NUEVO-MIN-1: renormalización cuando no hay RT.
  // Sin hits, rtComponent=0 y el máximo alcanzable del composite base es 75
  // (50 de hitRate + 25 de FA). Sin renormalizar, un candidato perfecto sin RT
  // obtendría ~75 → escala 0-75, no 0-100 → sesgo silencioso.
  // Solución: dividir por maxPossible antes de multiplicar el factor de decay,
  // escalando siempre al rango 0-100 sea cual sea el subconjunto de métricas disponible.
  // ver docs/SCORING.md §4.2 — SIGNAL_HIT_RATE_WEIGHT, SIGNAL_FA_WEIGHT, SIGNAL_RT_WEIGHT
  const maxPossible = SIGNAL_HIT_RATE_WEIGHT + SIGNAL_FA_WEIGHT + (rtScore !== null ? SIGNAL_RT_WEIGHT : 0); // 100 con RT, 75 sin RT
  const rawComposite = hitRate * SIGNAL_HIT_RATE_WEIGHT + (1 - Math.min(falseAlarmRate * SIGNAL_FA_SCALE, 1)) * SIGNAL_FA_WEIGHT + rtComponent;
  const sustainedAttention = clamp(Math.round(
    (rawComposite / maxPossible * 100) * (1 - decayIndex * SIGNAL_DECAY_FACTOR),
  ), 0, 100);

  const rtBuckets = buildRtBuckets(events);

  return {
    sustainedAttention,
    hitRateByPhase,
    decayIndex,
    fatigueLabel,
    falseAlarmRate,
    falseAlarmsByPhase,
    dPrime,
    impulsivityLabel,
    meanRt,
    medianRt,
    rtP25,
    rtP75,
    rtStdDev,
    cvRt,
    consistencyLabel,
    rtOutliers,
    metricsByPhase,
    rtBuckets,
  };
}

export function buildCandidateProfile(
  frogMetrics: FrogRiskMetrics | null,
  signalMetrics: SignalSurgeMetrics | null,
): CandidateProfile {
  // CRIT-1 — processingSpeed y cognitiveConsistency son null cuando meanRt/cvRt
  // son null (sin hits). Propagamos el null en lugar de calcular un valor
  // artificial (el bug: meanRt=0 producía processingSpeed=100). Los consumidores
  // de la UI deben manejar null mostrando "—" o simplemente omitiendo la métrica.
  // ver docs/SCORING.md §4.2 — RT_FLOOR_MS, RT_RANGE_MS, CV_MAX
  const processingSpeed: number | null = (signalMetrics && signalMetrics.meanRt !== null)
    ? clamp(Math.round((1 - (signalMetrics.meanRt - RT_FLOOR_MS) / RT_RANGE_MS) * 100), 0, 100)
    : null;
  const cognitiveConsistency: number | null = (signalMetrics && signalMetrics.cvRt !== null)
    ? clamp(Math.round((1 - signalMetrics.cvRt / CV_MAX) * 100), 0, 100)
    : null;

  return {
    frog: frogMetrics,
    signal: signalMetrics,
    completedAt: new Date(),
    radarDimensions: {
      sustainedAttention: signalMetrics?.sustainedAttention ?? 0,
      processingSpeed,
      cognitiveConsistency,
      riskAppetite: frogMetrics?.calculatedRisk ?? 0,
      lossResilience: frogMetrics?.lossResilience ?? 0,
    },
  };
}

export function buildCandidateProfileFromEvents(events: GameEvent[]) {
  const frogEvents = extractFrogEvents(events);
  const signalEvents = extractSignalEvents(events);
  if (!frogEvents.length && !signalEvents.length) return null;

  const frogMetrics = frogEvents.length ? calculateFrogMetrics(frogEvents) : null;
  const signalMetrics = signalEvents.length ? calculateSignalMetrics(signalEvents) : null;

  return {
    profile: buildCandidateProfile(frogMetrics, signalMetrics),
    frogChoices: frogEvents.map((event) => ({ choice: event.choice })),
  };
}

function buildRtBuckets(events: SignalEvent[]) {
  const bucketEdges = [200, 400, 600, 800, Infinity];
  const bucketLabels = ["200-400", "400-600", "600-800", "800+"];
  return PHASES.flatMap((phase) => {
    const phaseHits = events.filter((event): event is Extract<SignalEvent, { type: "hit" }> => event.type === "hit" && event.phase === phase);
    return bucketLabels.map((bucket, index) => ({
      bucket,
      phase,
      count: phaseHits.filter((event) => event.rt >= bucketEdges[index] && event.rt < bucketEdges[index + 1]).length,
    }));
  });
}

function parseRiskChoice(value: unknown): RiskChoiceId {
  return value === "probe" || value === "leap" ? value : "safe";
}

function mean(values: number[]) {
  return d3Mean(values) ?? 0;
}

function stdDev(values: number[]) {
  return deviation(values) ?? 0;
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return quantileSorted(sorted, p / 100) ?? 0;
}

function ratio(value: number, total: number) {
  return total > 0 ? value / total : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function zScore(p: number) {
  const value = clamp(p, 0.001, 0.999);
  const a = [
    0,
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00,
  ];
  const b = [
    0,
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01,
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00,
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (value < pLow) {
    const q = Math.sqrt(-2 * Math.log(value));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (value <= pHigh) {
    const q = value - 0.5;
    const r = q * q;
    return (((((a[1] * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * r + a[6]) * q /
      (((((b[1] * r + b[2]) * r + b[3]) * r + b[4]) * r + b[5]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - value));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
