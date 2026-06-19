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

const RISK_META: Record<RiskChoiceId, { reward: number; risk: number }> = {
  safe: { reward: 6, risk: 0.08 },
  probe: { reward: 12, risk: 0.32 },
  leap: { reward: 22, risk: 0.56 },
};

const PHASES = [1, 2, 3];
const SIGNAL_TRIALS_PER_PHASE = 10;
const TARGET_RATIO = 0.4;
const TARGETS_PER_PHASE = Math.round(SIGNAL_TRIALS_PER_PHASE * TARGET_RATIO);
const DISTRACTORS_PER_PHASE = SIGNAL_TRIALS_PER_PHASE - TARGETS_PER_PHASE;

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
  const riskAfterFailure =
    avgDelta < -0.05 ? "reduces" :
    avgDelta > 0.05 ? "escalates" :
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
  const decisionQuality = clamp(Math.round((riskAdjustedScore / 80) * 100), 0, 100);
  const totalGains = events.filter((event, index) => event.score > (index === 0 ? 0 : events[index - 1].score)).length;
  const totalLosses = events.filter((event, index) => event.score < (index === 0 ? 0 : events[index - 1].score)).length;
  const decisionProfile =
    meanRisk < 0.2 ? "conservative" :
    meanRisk > 0.44 ? "reckless" :
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
  const rtScore = hasHits && meanRt !== null
    ? clamp(1 - (meanRt - 200) / 700, 0, 1)
    : null;
  const rtComponent = rtScore !== null ? rtScore * 25 : 0;
  // NUEVO-MIN-1: renormalización cuando no hay RT.
  // Sin hits, rtComponent=0 y el máximo alcanzable del composite base es 75
  // (50 de hitRate + 25 de FA). Sin renormalizar, un candidato perfecto sin RT
  // obtendría ~75 → escala 0-75, no 0-100 → sesgo silencioso.
  // Solución: dividir por maxPossible antes de multiplicar el factor de decay,
  // escalando siempre al rango 0-100 sea cual sea el subconjunto de métricas disponible.
  const maxPossible = 50 + 25 + (rtScore !== null ? 25 : 0); // 100 con RT, 75 sin RT
  const rawComposite = hitRate * 50 + (1 - Math.min(falseAlarmRate * 5, 1)) * 25 + rtComponent;
  const sustainedAttention = clamp(Math.round(
    (rawComposite / maxPossible * 100) * (1 - decayIndex * 0.2),
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
  const processingSpeed: number | null = (signalMetrics && signalMetrics.meanRt !== null)
    ? clamp(Math.round((1 - (signalMetrics.meanRt - 200) / 700) * 100), 0, 100)
    : null;
  const cognitiveConsistency: number | null = (signalMetrics && signalMetrics.cvRt !== null)
    ? clamp(Math.round((1 - signalMetrics.cvRt / 0.5) * 100), 0, 100)
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
