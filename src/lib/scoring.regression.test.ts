// scoring.regression.test.ts — Test de regresión C5
//
// PROPÓSITO: fijar el baseline numérico ACTUAL de las funciones de scoring.
// Estos valores NO son "psicométricamente correctos" —son el resultado real del
// código hoy. Cualquier cambio futuro de fórmulas o pesos que altere estos
// números ROMPERÁ este test, lo que es exactamente el comportamiento deseado:
// obliga a actualizar el baseline conscientemente y a documentar el motivo.
//
// FIXTURE FIJO: conjuntos de entrada conocidos y deterministas (sin random).
// Se usa expect(value).toBe(expected) con valores explícitos, NO toMatchSnapshot(),
// para que los valores sean inmediatamente legibles en el diff de un PR.
//
// Referencia de constantes: docs/SCORING.md

import { describe, it, expect } from "vitest";
import { calculateBehavioral } from "./assessment";
import { computeComposite } from "../utils/compositeAxes";
import { buildCandidateProfileFromEvents, extractSignalEvents } from "../utils/psychometricCalculations";
import { computeResult as ssComputeResult } from "../components/SignalSurge";
import type { GameEvent, Candidate } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(type: string, payload: Record<string, unknown>): GameEvent {
  return { id: crypto.randomUUID(), type, at: "2026-01-01T00:00:00.000Z", payload };
}

// ─── Fixture A: escenario conductual moderado ─────────────────────────────────
//
// switch_answer x6: 5 correctos (ok=true), 1 incorrecto en segunda mitad
//   switchAccuracy  = 5/6  ≈ 0.8333
//   secondAccuracy  = 2/3  ≈ 0.6667  (3 en segunda mitad; 2 correctos)
//   avgRt           = 500 ms
//
// ops_choice x3: 2 óptimas, impact=[3,5,2], urgency=[2,3,4]
//   opsOptimal      = 2/3  ≈ 0.6667
//   impactBias      = 10/3 ≈ 3.333
//   urgencyBias     = 3.0
//
// route_choice x3: risk=[0.3,0.4,0.4], primera con failed=true, resto probe/safe
//   riskLevel       = 1.1/3 ≈ 0.3667
//   recovery        = 1.0   (2 de 2 elecciones post-pérdida son moderadas)
//
// Valores esperados (ver cálculo manual en docs/SCORING.md §7 / comentarios):
//   adaptability    = clamp(round(2/3*72 + 5/6*18 + 1.0*10), 18, 96) = clamp(73) = 73
//   prioritization  = clamp(round(2/3*74 + 10/3*5 + 1/3*7), 20, 97) = clamp(68) = 68
//   executiveControl= clamp(round(5/6*55 + 700/18 + 2/3*15), 18, 95) = clamp(95) = 95
//   calculatedRisk  = clamp(round(42 + 0.3667*62 + 1.0*18), 18, 96) = clamp(83) = 83

const FIXTURE_A_EVENTS: GameEvent[] = [
  // switch_answer — primera mitad (secondRule=false)
  makeEvent("switch_answer", { ok: true,  rt: 500, secondRule: false }),
  makeEvent("switch_answer", { ok: true,  rt: 500, secondRule: false }),
  makeEvent("switch_answer", { ok: true,  rt: 500, secondRule: false }),
  // switch_answer — segunda mitad (secondRule=true): 2 correctos, 1 incorrecto
  makeEvent("switch_answer", { ok: true,  rt: 500, secondRule: true }),
  makeEvent("switch_answer", { ok: true,  rt: 500, secondRule: true }),
  makeEvent("switch_answer", { ok: false, rt: 500, secondRule: true }),
  // ops_choice
  makeEvent("ops_choice", { optimal: true,  impact: 3, urgency: 2 }),
  makeEvent("ops_choice", { optimal: true,  impact: 5, urgency: 3 }),
  makeEvent("ops_choice", { optimal: false, impact: 2, urgency: 4 }),
  // route_choice: primera con failed=true
  makeEvent("route_choice", { risk: 0.3, failed: true,  choice: "risky" }),
  makeEvent("route_choice", { risk: 0.4, failed: false, choice: "probe" }),
  makeEvent("route_choice", { risk: 0.4, failed: false, choice: "safe"  }),
];

// ─── Fixture B: sin eventos de ruta (recovery=null) ───────────────────────────
//
// switch_answer x4: todos correctos, rt=600
//   switchAccuracy  = 1.0
//   secondAccuracy  = 1.0  (2 en segunda mitad)
//   avgRt           = 600 ms
//
// ops_choice x2: ambas óptimas, impact=4, urgency=2
//   opsOptimal      = 1.0
//   impactBias      = 4.0
//   urgencyBias     = 2.0
//
// Sin route_choice → riskLevel=0, recovery=null
//
// Valores esperados:
//   adaptability    = clamp(round(1.0*72 + 1.0*18 + 0), 18, 96) = clamp(90) = 90
//   prioritization  = clamp(round(1.0*74 + 4.0*5 + 2.0*7), 20, 97) = clamp(108) = 97
//   executiveControl= clamp(round(1.0*55 + 600/18 + 1.0*15), 18, 95) = clamp(103) = 95
//     [max(0,1200-600)/18 = 600/18 ≈ 33.33]
//   calculatedRisk  = clamp(round(42 + 0*62), 18, 96) = clamp(42) = 42

const FIXTURE_B_EVENTS: GameEvent[] = [
  makeEvent("switch_answer", { ok: true, rt: 600, secondRule: false }),
  makeEvent("switch_answer", { ok: true, rt: 600, secondRule: false }),
  makeEvent("switch_answer", { ok: true, rt: 600, secondRule: true }),
  makeEvent("switch_answer", { ok: true, rt: 600, secondRule: true }),
  makeEvent("ops_choice", { optimal: true, impact: 4, urgency: 2 }),
  makeEvent("ops_choice", { optimal: true, impact: 4, urgency: 2 }),
];

// ─── Suite A: calculateBehavioral ─────────────────────────────────────────────

describe("REGRESIÓN calculateBehavioral — Fixture A (baseline C5)", () => {
  // NOTA: estos valores son el baseline actual. Si cambian las fórmulas/pesos,
  // actualizar con el nuevo valor documentando el motivo en docs/SCORING.md.

  it("adaptability = 73 (Fixture A)", () => {
    const result = calculateBehavioral(FIXTURE_A_EVENTS);
    expect(result.adaptability).toBe(73);
  });

  it("prioritization = 68 (Fixture A)", () => {
    const result = calculateBehavioral(FIXTURE_A_EVENTS);
    expect(result.prioritization).toBe(68);
  });

  it("executiveControl = 95 (Fixture A)", () => {
    const result = calculateBehavioral(FIXTURE_A_EVENTS);
    expect(result.executiveControl).toBe(95);
  });

  it("calculatedRisk = 83 (Fixture A)", () => {
    const result = calculateBehavioral(FIXTURE_A_EVENTS);
    expect(result.calculatedRisk).toBe(83);
  });

  it("profile no es undefined (Fixture A)", () => {
    const result = calculateBehavioral(FIXTURE_A_EVENTS);
    expect(typeof result.profile).toBe("string");
    expect(result.profile.length).toBeGreaterThan(0);
  });
});

describe("REGRESIÓN calculateBehavioral — Fixture B (sin rutas, recovery=null)", () => {
  it("adaptability = 90 (Fixture B)", () => {
    const result = calculateBehavioral(FIXTURE_B_EVENTS);
    expect(result.adaptability).toBe(90);
  });

  it("prioritization = 97 (Fixture B, clampeado al techo 97)", () => {
    const result = calculateBehavioral(FIXTURE_B_EVENTS);
    expect(result.prioritization).toBe(97);
  });

  it("executiveControl = 95 (Fixture B, clampeado al techo 95)", () => {
    const result = calculateBehavioral(FIXTURE_B_EVENTS);
    expect(result.executiveControl).toBe(95);
  });

  it("calculatedRisk = 42 (Fixture B, solo base sin rutas)", () => {
    const result = calculateBehavioral(FIXTURE_B_EVENTS);
    // Valor = clamp(round(42 + 0*62), 18, 96) = 42 (sin recovery, sin riesgo real)
    expect(result.calculatedRisk).toBe(42);
  });
});

// ─── Suite B: computeComposite ────────────────────────────────────────────────

// Candidato mínimo con solo behavioral (sin eventos de juego para signal/frog).
// cognition     = meanDefined([executiveControl=95, undefined, undefined, undefined]) = 95
// strategy      = meanDefined([prioritization=68, adaptability=73, null]) = (68+73)/2 = 70.5
// riskCalibrated: riskCalibration(83) → 83>75 → dist=8 → 100-8*2.4=80.8;
//                 meanDefined([80.8, null]) = 80.8
//
// Todos son floats (clamp sin redondeo entero). La comparación usa toBeCloseTo.

function makeCandidateWithBehavioral(b: {
  adaptability: number;
  prioritization: number;
  executiveControl: number;
  calculatedRisk: number;
}): Candidate {
  return {
    id: "test-candidate",
    name: "Test",
    email: "test@example.com",
    roleTarget: "Dev",
    invitationCode: "TEST-0000",
    status: "completed",
    createdAt: "2026-01-01T00:00:00.000Z",
    behavioral: {
      ...b,
      sustainedAttention: undefined,
      workingMemory: undefined,
      fluidReasoning: undefined,
      profile: "Resolvedor situacional",
    },
    events: [],
  };
}

describe("REGRESIÓN computeComposite — Fixture A behavioral only (baseline C5)", () => {
  const candidate = makeCandidateWithBehavioral({
    adaptability: 73,
    prioritization: 68,
    executiveControl: 95,
    calculatedRisk: 83,
  });

  it("cognition = 95 (solo executiveControl disponible)", () => {
    const c = computeComposite(candidate);
    expect(c).not.toBeNull();
    expect(c!.cognition).toBeCloseTo(95, 5);
  });

  it("strategy ≈ 70.5 (media de prioritization=68 y adaptability=73)", () => {
    const c = computeComposite(candidate);
    expect(c).not.toBeNull();
    expect(c!.strategy).toBeCloseTo(70.5, 5);
  });

  it("riskCalibrated ≈ 80.8 (calculatedRisk=83 > techo 75, dist=8, 100-8*2.4=80.8)", () => {
    const c = computeComposite(candidate);
    expect(c).not.toBeNull();
    expect(c!.riskCalibrated).toBeCloseTo(80.8, 5);
  });
});

// ─── Suite C: buildCandidateProfileFromEvents con eventos de riesgo ───────────

// Fixture con 3 route_choice y 4 signal_surge_event (2 hits, 2 misses).
// Se fijan valores de los sub-perfiles que impactan el composite.

const SIGNAL_GAME_EVENTS: GameEvent[] = [
  makeEvent("signal_surge_event", { type: "hit",  rt: 300, phase: 1 }),
  makeEvent("signal_surge_event", { type: "hit",  rt: 400, phase: 1 }),
  makeEvent("signal_surge_event", { type: "miss", phase: 2 }),
  makeEvent("signal_surge_event", { type: "miss", phase: 3 }),
];

const FROG_GAME_EVENTS: GameEvent[] = [
  makeEvent("route_choice", { choice: "probe", reward: 12, risk: 0.32, failed: false, score: 10 }),
  makeEvent("route_choice", { choice: "safe",  reward: 6,  risk: 0.08, failed: false, score: 16 }),
  makeEvent("route_choice", { choice: "leap",  reward: 22, risk: 0.56, failed: true,  score: 10 }),
];

describe("REGRESIÓN buildCandidateProfileFromEvents (baseline C5)", () => {
  it("con solo signal events: meanRt = 350 (promedio de 300 y 400)", () => {
    const result = buildCandidateProfileFromEvents(SIGNAL_GAME_EVENTS);
    expect(result).not.toBeNull();
    expect(result!.profile.signal?.meanRt).toBe(350);
  });

  it("con solo signal events: sustainedAttention = 56 (CRIT-2: valor exacto fijado)", () => {
    // Derivación del valor esperado (implementación correcta tras CRIT-1):
    //   Fixture: 2 hits (rt=300, rt=400) fase 1; 1 miss fase 2; 1 miss fase 3.
    //
    //   hits=2, misses=2, falseAlarms=0
    //   rts=[300,400] → meanRt=350
    //   hitRate   = 2/(2+2) = 0.5
    //   falseAlarmRate = 0 / (6 distractores × 3 fases) = 0
    //   rtScore   = clamp(1 − (350−200)/700, 0, 1) = clamp(0.7857, 0, 1) = 0.7857
    //   rtComponent = 0.7857 × 25 = 19.643
    //
    //   hitRateByPhase: [1.0, 0.0, 0.0]  (fase 1: 2/(2+0); fases 2-3: 0/(0+1))
    //   decayIndex = max(0, 1.0 − 0.0) = 1.0
    //
    //   rawComposite = 0.5×50 + (1−0)×25 + 19.643 = 69.643
    //   maxPossible  = 50 + 25 + 25 = 100  (hay RT)
    //   sustainedAttention = clamp(round(69.643/100 × 100 × (1 − 1.0×0.2)), 0, 100)
    //                      = clamp(round(69.643 × 0.8), 0, 100)
    //                      = clamp(round(55.714), 0, 100)
    //                      = 56
    const result = buildCandidateProfileFromEvents(SIGNAL_GAME_EVENTS);
    expect(result).not.toBeNull();
    const sa = result!.profile.signal?.sustainedAttention;
    expect(sa).toBe(56);
  });

  it("CRIT-1: sin hits, SignalSurge.computeResult.attentionScore === buildCandidateProfileFromEvents.sustainedAttention", () => {
    // Previene futura divergencia entre el score que ve el candidato al terminar el juego
    // y el que ve el admin en el dashboard para la MISMA sesión.
    //
    // Fixture SIN hits: 3 misses por fase, 0 false_alarms.
    // Derivación del valor esperado (ambos pipelines):
    //   hits=0, misses=9, falseAlarms=0 → meanRt=undefined/null (sin datos RT)
    //   hitRate = 0/(0+9) = 0
    //   faRate  = 0 / (6 distractores × 3 fases) = 0
    //   rtScore = null → rtComponent = 0
    //   decayIndex = max(0, hitRatePhase1 − hitRatePhase3) = max(0, 0−0) = 0
    //   maxPossible = 50 + 25 = 75  (sin RT)
    //   rawComposite = 0×50 + (1−0)×25 + 0 = 25
    //   attentionScore = clamp(round(25/75 × 100 × (1−0×0.2)), 0, 100)
    //                  = clamp(round(33.33), 0, 100) = 33
    const noHitsSignalEvents: GameEvent[] = [
      makeEvent("signal_surge_event", { type: "miss", phase: 1 }),
      makeEvent("signal_surge_event", { type: "miss", phase: 1 }),
      makeEvent("signal_surge_event", { type: "miss", phase: 1 }),
      makeEvent("signal_surge_event", { type: "miss", phase: 2 }),
      makeEvent("signal_surge_event", { type: "miss", phase: 2 }),
      makeEvent("signal_surge_event", { type: "miss", phase: 2 }),
      makeEvent("signal_surge_event", { type: "miss", phase: 3 }),
      makeEvent("signal_surge_event", { type: "miss", phase: 3 }),
      makeEvent("signal_surge_event", { type: "miss", phase: 3 }),
    ];

    // Pipeline del juego (lo que ve el candidato al finalizar)
    const rawSignalEvents = extractSignalEvents(noHitsSignalEvents);
    const gameResult = ssComputeResult(rawSignalEvents);

    // Pipeline del dashboard (lo que ve el admin)
    const profileResult = buildCandidateProfileFromEvents(noHitsSignalEvents);
    const dashboardSa = profileResult!.profile.signal?.sustainedAttention;

    expect(gameResult.attentionScore).toBe(33);
    expect(dashboardSa).toBe(33);
    // La prueba clave: ambos deben ser idénticos
    expect(gameResult.attentionScore).toBe(dashboardSa);
  });

  it("con solo frog events: calculatedRisk es un número 0-100", () => {
    const result = buildCandidateProfileFromEvents(FROG_GAME_EVENTS);
    expect(result).not.toBeNull();
    const cr = result!.profile.frog?.calculatedRisk;
    expect(typeof cr).toBe("number");
    expect(cr!).toBeGreaterThanOrEqual(0);
    expect(cr!).toBeLessThanOrEqual(100);
  });

  it("frog con 3 elecciones (probe 0.32, safe 0.08, leap 0.56): meanRisk = 0.32", () => {
    // meanRisk = (0.32 + 0.08 + 0.56) / 3 = 0.32
    const result = buildCandidateProfileFromEvents(FROG_GAME_EVENTS);
    expect(result).not.toBeNull();
    expect(result!.profile.frog?.meanRisk).toBeCloseTo(0.32, 5);
  });

  it("frog calculatedRisk = round((0.32 / 0.56) * 100) = 57", () => {
    // maxObservedRisk = max(0.08, 0.32, 0.56) = 0.56
    // calculatedRisk = clamp(round(0.32/0.56*100)) = clamp(round(57.14)) = clamp(57) = 57
    const result = buildCandidateProfileFromEvents(FROG_GAME_EVENTS);
    expect(result).not.toBeNull();
    expect(result!.profile.frog?.calculatedRisk).toBe(57);
  });

  it("resultado no es null con eventos mixtos signal + frog", () => {
    const mixed = [...SIGNAL_GAME_EVENTS, ...FROG_GAME_EVENTS];
    const result = buildCandidateProfileFromEvents(mixed);
    expect(result).not.toBeNull();
    expect(result!.profile.frog).not.toBeNull();
    expect(result!.profile.signal).not.toBeNull();
  });
});
