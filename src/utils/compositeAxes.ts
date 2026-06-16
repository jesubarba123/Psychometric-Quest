// compositeAxes.ts
// Reducción a 3 dimensiones de todos los análisis relevantes del candidato.
// Proyección fija e interpretable (no PCA) → estable, funciona con 1 o N candidatos.
//
// Ejes (cada uno 0-100, "más alto = mejor"):
//   · COGNICIÓN        — recursos de procesamiento: control ejecutivo, atención
//                         sostenida, memoria de trabajo (+ velocidad de procesamiento)
//   · ESTRATEGIA       — juicio adaptativo: priorización, adaptabilidad
//                         (+ calidad de decisión del juego de riesgo)
//   · RIESGO CALIBRADO — riesgo dentro de la banda óptima + resiliencia a la pérdida
//
// Área ideal: los 3 índices por encima de COMPOSITE_IDEAL_MIN.

import type { Candidate } from "../types";
import { buildCandidateProfileFromEvents } from "./psychometricCalculations";

export const COMPOSITE_IDEAL_MIN = 65;

export interface CompositeProfile {
  cognition: number;       // 0-100
  strategy: number;        // 0-100
  riskCalibrated: number;  // 0-100
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function meanDefined(values: Array<number | undefined | null>): number {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

// Banda óptima de riesgo: 40-75 (igual que el criterio de negocio previo).
// 100 dentro de la banda, decae linealmente fuera de ella.
const RISK_BAND = { lo: 40, hi: 75, slope: 2.4 };
function riskCalibration(risk: number): number {
  if (risk >= RISK_BAND.lo && risk <= RISK_BAND.hi) return 100;
  const dist = risk < RISK_BAND.lo ? RISK_BAND.lo - risk : risk - RISK_BAND.hi;
  return clamp(100 - dist * RISK_BAND.slope);
}

export function computeComposite(candidate: Candidate): CompositeProfile | null {
  const b = candidate.behavioral;
  if (!b) return null;

  // Métricas opcionales derivadas de los eventos crudos de los juegos.
  const analysis = buildCandidateProfileFromEvents(candidate.events ?? []);
  const frog = analysis?.profile.frog ?? null;
  const signal = analysis?.profile.signal ?? null;
  const processingSpeed = signal ? analysis?.profile.radarDimensions.processingSpeed : undefined;

  const cognition = clamp(meanDefined([
    b.executiveControl,
    b.sustainedAttention,
    b.workingMemory,
    b.fluidReasoning,
    processingSpeed,
  ]));

  const strategy = clamp(meanDefined([
    b.prioritization,
    b.adaptability,
    frog?.decisionQuality,
  ]));

  const riskCalibrated = clamp(meanDefined([
    riskCalibration(b.calculatedRisk),
    frog?.lossResilience,
  ]));

  return { cognition, strategy, riskCalibrated };
}

export function isCompositeIdeal(c: CompositeProfile | null | undefined): boolean {
  if (!c) return false;
  return (
    c.cognition >= COMPOSITE_IDEAL_MIN &&
    c.strategy >= COMPOSITE_IDEAL_MIN &&
    c.riskCalibrated >= COMPOSITE_IDEAL_MIN
  );
}
