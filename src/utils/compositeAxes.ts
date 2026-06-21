// compositeAxes.ts
// Reducción a 3 dimensiones de todos los análisis relevantes del candidato.
// Proyección fija e interpretable (no PCA) → estable, funciona con 1 o N candidatos.
//
// Ejes (cada uno 0-100, "más alto = mejor"):
//   · COGNICIÓN        — recursos de procesamiento: control ejecutivo, atención
//                         sostenida, memoria de trabajo, razonamiento fluido.
//                         NOTA C6: processingSpeed (RT puro de Signal Surge) fue excluido
//                         del composite en C6 porque el mismo meanRt ya entra en
//                         sustainedAttention (25 % de su peso). Incluir ambos contaría
//                         la varianza de meanRt dos veces. Decisión: mantener
//                         sustainedAttention (integra hitRate + FA + RT) y excluir
//                         processingSpeed (redundante). Ver docs/SCORING.md §3 (C6).
//   · ESTRATEGIA       — juicio adaptativo: priorización, adaptabilidad
//                         (+ calidad de decisión del juego de riesgo)
//   · RIESGO CALIBRADO — riesgo dentro de la banda óptima + resiliencia a la pérdida
//
// Área ideal: los 3 índices por encima de COMPOSITE_IDEAL_MIN.

import type { Candidate } from "../types";
import { buildCandidateProfileFromEvents } from "./psychometricCalculations";

// Umbral "zona ideal": los tres índices compuestos deben superar este valor
// para que el perfil se considere óptimo en las tres dimensiones.
// PROVISIONAL — sin calibrar (requiere datos): ver docs/SCORING.md §3
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

// Banda óptima de riesgo: fuera de [lo, hi] la puntuación de riesgo calibrado
// decae linealmente a razón de `slope` puntos por punto de distancia.
// PROVISIONAL — sin calibrar (requiere datos): ver docs/SCORING.md §3
const RISK_BAND = {
  lo: 40,    // límite inferior de la zona de riesgo saludable
  hi: 75,    // límite superior de la zona de riesgo saludable
  slope: 2.4 // penalización por punto fuera de la banda (1/slope ≈ 0.42 pts/pt)
};
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

  // C6 — processingSpeed excluida del composite cognición.
  // Razón: processingSpeed = f(meanRt) puro; sustainedAttention ya incorpora meanRt
  // como uno de sus tres componentes (peso 25/100). Incluir ambos en la media
  // aritmética contaría la varianza de meanRt dos veces (doble canal).
  // Decisión honesta: un único canal RT vía sustainedAttention.
  // ver docs/SCORING.md §3 (C6).
  const cognition = clamp(meanDefined([
    b.executiveControl,
    b.sustainedAttention,
    b.workingMemory,
    b.fluidReasoning,
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
