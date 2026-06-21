// psychometricCalculations.test.ts — TDD CRIT-1: processingSpeed sin hits
//
// CRIT-1: cuando el candidato no tuvo hits en Signal Surge, meanRt → 0 vía
// mean([]) = 0, y la fórmula de rtScore daba clamp(1-(0-200)/700,0,1) = 1.0,
// haciendo que processingSpeed saliera 100 (máximo). Es el bug inverso al 999.
//
// Fix (principio: excluir > inventar):
//   - Si no hay hits, meanRt debe ser null.
//   - rtScore y processingSpeed deben ser null (ausencia, no 100 ni 0).
//   - buildCandidateProfile / buildCandidateProfileFromEvents deben propagar null
//     sin romper; los consumidores de la UI no deben mostrar 100.

import { describe, it, expect } from "vitest";
import {
  calculateSignalMetrics,
  buildCandidateProfile,
  buildCandidateProfileFromEvents,
  extractSignalEvents,
} from "./psychometricCalculations";
import type { SignalEvent } from "../psychometrics/types";
import type { GameEvent } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Genera eventos de señal solo de tipo miss (cero hits). */
function makeZeroHitSignalEvents(count = 12): SignalEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    type: "miss" as const,
    phase: Math.floor(i / 4) + 1,
  }));
}

/** Genera GameEvents de tipo signal_surge_event con cero hits. */
function makeZeroHitGameEvents(count = 12): GameEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ev-${i}`,
    type: "signal_surge_event",
    at: new Date().toISOString(),
    payload: {
      type: "miss",
      phase: Math.floor(i / 4) + 1,
    },
  }));
}

// ─── CRIT-1: calculateSignalMetrics con cero hits ─────────────────────────────

describe("calculateSignalMetrics — cero hits", () => {
  it("meanRt es null cuando no hubo hits", () => {
    const events = makeZeroHitSignalEvents();
    const metrics = calculateSignalMetrics(events);
    // CRIT-1: con cero hits meanRt no puede ser 0 (que inflaba rtScore a 1.0)
    expect(metrics.meanRt).toBeNull();
  });

  it("processingSpeed derivado NO es 100 cuando no hubo hits", () => {
    const events = makeZeroHitSignalEvents();
    const metrics = calculateSignalMetrics(events);
    // buildCandidateProfile usa signalMetrics.meanRt para calcular processingSpeed
    const profile = buildCandidateProfile(null, metrics);
    // El bug: clamp(1-(0-200)/700,0,1)*100 = 100. Debe ser null o 0 documentado.
    expect(profile.radarDimensions.processingSpeed).not.toBe(100);
  });

  it("processingSpeed es null cuando no hubo hits (ausencia, no valor inventado)", () => {
    const events = makeZeroHitSignalEvents();
    const metrics = calculateSignalMetrics(events);
    const profile = buildCandidateProfile(null, metrics);
    expect(profile.radarDimensions.processingSpeed).toBeNull();
  });
});

// ─── buildCandidateProfileFromEvents con cero hits ────────────────────────────

describe("buildCandidateProfileFromEvents — cero hits en signal_surge_event", () => {
  it("processingSpeed NO es 100 cuando todos los eventos de señal son misses", () => {
    const events = makeZeroHitGameEvents();
    const result = buildCandidateProfileFromEvents(events);
    expect(result).not.toBeNull();
    expect(result!.profile.radarDimensions.processingSpeed).not.toBe(100);
  });

  it("processingSpeed es null cuando todos los eventos de señal son misses", () => {
    const events = makeZeroHitGameEvents();
    const result = buildCandidateProfileFromEvents(events);
    expect(result).not.toBeNull();
    expect(result!.profile.radarDimensions.processingSpeed).toBeNull();
  });
});

// ─── extractSignalEvents — verificación auxiliar ─────────────────────────────

describe("extractSignalEvents", () => {
  it("extrae correctamente eventos miss y no produce hits fantasmas", () => {
    const gameEvents = makeZeroHitGameEvents(6);
    const signalEvents = extractSignalEvents(gameEvents);
    expect(signalEvents.every(e => e.type === "miss")).toBe(true);
    expect(signalEvents.filter(e => e.type === "hit").length).toBe(0);
  });
});

// ─── NUEVO-MIN-1: sustainedAttention renormalizado con cero hits ──────────────
//
// Sin hits, rtComponent=0 y maxPossible=75. Sin renormalizar, un candidato con
// hitRate=1 y faRate=0 pero sin RT solo lograría 75 puntos en una escala de 100.
// Con la renormalización (rawComposite/maxPossible*100) el score refleja
// correctamente la actuación dentro del subconjunto de métricas disponibles.
//
// Con cero hits y cero false alarms:
//   hitRate=0, faRate=0, rtComponent=0, maxPossible=75, decayIndex=0
//   rawComposite = 0*50 + (1-min(0*5,1))*25 + 0 = 25
//   sustainedAttention = round(25/75 * 100 * 1) = round(33.33) = 33

describe("calculateSignalMetrics — sustainedAttention renormalizado (NUEVO-MIN-1)", () => {
  it("con cero hits no hay penalización oculta por /75: valor esperado 33", () => {
    const events = makeZeroHitSignalEvents(12); // 12 misses, 0 hits, 0 false alarms
    const metrics = calculateSignalMetrics(events);
    // Pre-renormalización: sin escalar, el valor habría sido round(25*(1-0*0.2))=25
    // (un score de 25/100 sobre escala implícita de 75 — incorrecto).
    // Post-renormalización: round(25/75*100)=33, reflejando rendimiento nulo
    // en hitRate pero sin castigar la ausencia de RT.
    expect(metrics.sustainedAttention).toBe(33);
  });

  it("con cero hits y decayIndex=0, el factor de decay no lo deforma", () => {
    const events = makeZeroHitSignalEvents(12);
    const metrics = calculateSignalMetrics(events);
    // decayIndex = max(0, hitRateByPhase[0] - hitRateByPhase[2]) = 0 con todos misses
    expect(metrics.sustainedAttention).toBeLessThanOrEqual(100);
    expect(metrics.sustainedAttention).toBeGreaterThanOrEqual(0);
  });

  it("con hits, maxPossible=100 y la renormalización no cambia el valor (escala ya correcta)", () => {
    // hitRate=1, faRate=0, rtScore=clamp(1-(300-200)/700,0,1)=clamp(0.857,0,1)=0.857
    // rtComponent=0.857*25=21.43
    // rawComposite=50+25+21.43=96.43, maxPossible=100
    // decayIndex con 4 hits por fase → hitRateByPhase=[1,1,1] → decay=0
    // sustainedAttention=round(96.43/100*100*(1-0))=96
    const events: SignalEvent[] = [
      { type: "hit", rt: 300, phase: 1 },
      { type: "hit", rt: 300, phase: 1 },
      { type: "hit", rt: 300, phase: 1 },
      { type: "hit", rt: 300, phase: 1 },
      { type: "hit", rt: 300, phase: 2 },
      { type: "hit", rt: 300, phase: 2 },
      { type: "hit", rt: 300, phase: 2 },
      { type: "hit", rt: 300, phase: 2 },
      { type: "hit", rt: 300, phase: 3 },
      { type: "hit", rt: 300, phase: 3 },
      { type: "hit", rt: 300, phase: 3 },
      { type: "hit", rt: 300, phase: 3 },
    ];
    const metrics = calculateSignalMetrics(events);
    expect(metrics.sustainedAttention).toBe(96);
  });
});

// ─── NUEVO-MIN-2: cvRt con guard correcto ─────────────────────────────────────

describe("calculateSignalMetrics — cvRt guard (NUEVO-MIN-2)", () => {
  it("cvRt es null cuando no hay hits (meanRt null)", () => {
    const events = makeZeroHitSignalEvents();
    const metrics = calculateSignalMetrics(events);
    expect(metrics.cvRt).toBeNull();
  });

  it("cvRt es un número cuando hay al menos dos hits distintos", () => {
    const events: SignalEvent[] = [
      { type: "hit", rt: 300, phase: 1 },
      { type: "hit", rt: 500, phase: 1 },
    ];
    const metrics = calculateSignalMetrics(events);
    expect(metrics.cvRt).not.toBeNull();
    expect(typeof metrics.cvRt).toBe("number");
  });
});

// ─── Caso positivo: con hits, meanRt y processingSpeed tienen valor real ──────

describe("calculateSignalMetrics — con hits", () => {
  it("meanRt es un número cuando hay hits", () => {
    const events: SignalEvent[] = [
      { type: "hit", rt: 300, phase: 1 },
      { type: "hit", rt: 400, phase: 1 },
      { type: "miss", phase: 2 },
    ];
    const metrics = calculateSignalMetrics(events);
    expect(metrics.meanRt).not.toBeNull();
    expect(typeof metrics.meanRt).toBe("number");
    expect(metrics.meanRt).toBe(350); // (300+400)/2
  });

  it("processingSpeed es un número entre 0 y 100 cuando hay hits", () => {
    const events: SignalEvent[] = [
      { type: "hit", rt: 350, phase: 1 },
      { type: "hit", rt: 450, phase: 2 },
    ];
    const metrics = calculateSignalMetrics(events);
    const profile = buildCandidateProfile(null, metrics);
    expect(profile.radarDimensions.processingSpeed).not.toBeNull();
    expect(profile.radarDimensions.processingSpeed as number).toBeGreaterThanOrEqual(0);
    expect(profile.radarDimensions.processingSpeed as number).toBeLessThanOrEqual(100);
  });
});
