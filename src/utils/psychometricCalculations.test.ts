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
