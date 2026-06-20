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
// cognition     = meanDefined([executiveControl=95, sustainedAttention=undef,
//                              workingMemory=undef, fluidReasoning=undef]) = 95
//                 NOTA C6: processingSpeed ya NO entra (fue eliminada en C6).
//                 Antes de C6 era meanDefined([95, undef, undef, undef, undef]) = 95
//                 — el valor no cambia aquí porque processingSpeed también era undef
//                 (sin signal events). El cambio de C6 es efectivo solo cuando
//                 hay eventos de Signal Surge que produzcan processingSpeed.
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

// ─── Suite D: C6 — un solo canal RT en cognición ─────────────────────────────
//
// PROPÓSITO DEL TEST:
//   Verificar que perturbar meanRt (cambiando los RT de los hits de Signal Surge)
//   mueve `cognition` a través de UN SOLO canal (sustainedAttention) y NO a través
//   de un segundo canal independiente (processingSpeed).
//
// RAZONAMIENTO:
//   Antes de C6, `computeComposite` incluía tanto `sustainedAttention` como
//   `processingSpeed` en la media de cognición. Ambas dependen de `meanRt`:
//     - sustainedAttention: rtScore = 1 − (meanRt − 200)/700, con peso 25/100
//     - processingSpeed: (1 − (meanRt − 200)/700) × 100 (función pura de meanRt)
//   Resultado: un cambio en meanRt producía dos cambios independientes en cognición
//   (doble conteo). Eso infla artificialmente la varianza de cognición atribuible a RT.
//
//   Tras C6: solo `sustainedAttention` permanece. Un cambio en meanRt mueve
//   cognición una sola vez, a través de sustainedAttention.
//
// ESTRATEGIA DEL TEST:
//   1. Construimos dos sets de eventos de señal idénticos EXCEPTO por el RT de los hits
//      (RT rápido = 300 ms; RT lento = 700 ms). Mismo hitRate, mismo faRate.
//   2. Calculamos los perfiles del candidato con cada set y medimos el cambio en cognición.
//   3. Verificamos que el cambio en cognición es IGUAL al cambio en sustainedAttention
//      (un solo canal). Si hubiera doble canal, el cambio en cognición sería mayor.
//   4. Verificamos explícitamente que `processingSpeed` es diferente entre los dos sets
//      (confirma que la perturbación de RT sí es detectable, solo que no entra a cognición).
//
// DERIVACIÓN DEL BASELINE (C6, 2026-06-20):
//
//   Fixture C6-FAST: 4 hits (todos rt=300), 2 misses fase 1; 4 hits (rt=300), 2 misses fase 2;
//                    4 hits (rt=300), 2 misses fase 3. Total: 12 hits, 6 misses, 0 FA.
//   Fixture C6-SLOW: idéntico pero rt=700 en todos los hits.
//
//   Para C6-FAST (meanRt=300):
//     hitRate = 12/18 = 0.6667
//     faRate  = 0 / (6×3=18 distractores) = 0
//     rtScore = clamp(1 − (300−200)/700) = clamp(6/7) ≈ 0.8571
//     rtComponent = 0.8571 × 25 = 21.43
//     maxPossible = 100 (hay RT)
//     hitRateByPhase = [4/6, 4/6, 4/6] = [0.667, 0.667, 0.667]
//     decayIndex = max(0, 0.667 − 0.667) = 0
//     rawComposite = 0.667×50 + (1−0)×25 + 21.43 = 33.33 + 25 + 21.43 = 79.76
//     sustainedAttention = clamp(round(79.76/100 × 100 × (1−0×0.2))) = clamp(round(79.76)) = 80
//     processingSpeed    = clamp(round((1 − (300−200)/700) × 100)) = clamp(round(85.71)) = 86
//
//   Para C6-SLOW (meanRt=700):
//     rtScore = clamp(1 − (700−200)/700) = clamp(1 − 500/700) = clamp(0.2857) = 0.2857
//     rtComponent = 0.2857 × 25 = 7.14
//     rawComposite = 0.667×50 + 25 + 7.14 = 33.33 + 25 + 7.14 = 65.47
//     sustainedAttention = clamp(round(65.47)) = 65
//     processingSpeed    = clamp(round((1 − 500/700) × 100)) = clamp(round(28.57)) = 29
//
//   Candidato con executiveControl=80, sin otros behavioral scores, sin frog events.
//
//   cognition_FAST (tras C6):
//     meanDefined([executiveControl=80, sustainedAttention=80, undefined, undefined]) = (80+80)/2 = 80
//
//   cognition_SLOW (tras C6):
//     meanDefined([executiveControl=80, sustainedAttention=65, undefined, undefined]) = (80+65)/2 = 72.5
//
//   delta_cognition_C6 = 80 − 72.5 = 7.5 (un solo canal: vía sustainedAttention)
//
//   Si processingSpeed aún estuviera en el composite (pre-C6):
//     cognition_FAST = (80+80+86)/3 = 82
//     cognition_SLOW = (80+65+29)/3 = 58
//     delta = 82 − 58 = 24 (dos canales inflaban el delta)

// Crea un candidato con:
//   - behavioral.sustainedAttention fijado explícitamente (simula el valor
//     registrado desde la pantalla final del juego vía signal_surge_result)
//   - events con signal_surge_event de RT conocido (produce processingSpeed
//     cuando buildCandidateProfileFromEvents los analiza)
// Este diseño refleja el flujo real: el juego graba signal_surge_result con
// attentionScore calculado, y computeComposite lo lee de b.sustainedAttention.
// Los signal_surge_event también se persisten y producen processingSpeed en el
// análisis de events. Ambas métricas dependen del mismo meanRt → doble canal
// antes de C6; canal único tras C6.
function makeCandidateWithSignalEvents(
  events: GameEvent[],
  executiveControl: number,
  sustainedAttention: number,
): Candidate {
  return {
    id: "c6-test-candidate",
    name: "C6 Test",
    email: "c6@example.com",
    roleTarget: "Dev",
    invitationCode: "C6-0000",
    status: "completed",
    createdAt: "2026-01-01T00:00:00.000Z",
    behavioral: {
      adaptability: 70,
      prioritization: 70,
      executiveControl,
      calculatedRisk: 60,
      sustainedAttention,  // valor fijado desde signal_surge_result (refleja meanRt)
      workingMemory: undefined,
      fluidReasoning: undefined,
      profile: "Resolvedor situacional",
    },
    events,
  };
}

// 4 hits + 2 misses por fase (3 fases) → 12 hits, 6 misses, 0 FA
function makeSignalEventsWithRt(rt: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let phase = 1; phase <= 3; phase++) {
    for (let i = 0; i < 4; i++) {
      events.push(makeEvent("signal_surge_event", { type: "hit", rt, phase }));
    }
    for (let i = 0; i < 2; i++) {
      events.push(makeEvent("signal_surge_event", { type: "miss", phase }));
    }
  }
  return events;
}

describe("C6 — un solo canal RT en cognición (no doble conteo)", () => {
  // Perturbamos meanRt entre 300 ms (rápido) y 700 ms (lento).
  // El mismo set de hits/misses/FA asegura que hitRate y faRate son idénticos;
  // solo cambia RT. Así aislamos el efecto de meanRt en cognición.
  const FAST_EVENTS = makeSignalEventsWithRt(300);
  const SLOW_EVENTS = makeSignalEventsWithRt(700);
  const EXEC = 80;
  // sustainedAttention fijado a partir de los events (derivación en comentario de suite):
  // FAST: 80, SLOW: 65
  const SA_FAST = 80;
  const SA_SLOW = 65;

  it("signal events FAST producen sustainedAttention=80 vía buildCandidateProfileFromEvents", () => {
    // Verifica que los eventos FAST producen el sustainedAttention que luego se
    // almacenaría en behavioral.sustainedAttention (via signal_surge_result).
    const analysis = buildCandidateProfileFromEvents(FAST_EVENTS);
    expect(analysis?.profile.signal?.sustainedAttention).toBe(SA_FAST);
  });

  it("signal events SLOW producen sustainedAttention=65 vía buildCandidateProfileFromEvents", () => {
    const analysis = buildCandidateProfileFromEvents(SLOW_EVENTS);
    expect(analysis?.profile.signal?.sustainedAttention).toBe(SA_SLOW);
  });

  it("processingSpeed-FAST = 86 y processingSpeed-SLOW = 29 (confirma perturbación real de RT)", () => {
    // Este test confirma que meanRt SÍ difiere entre fixtures (la perturbación es real).
    // Si ambos dieran el mismo processingSpeed, el test no probaría nada.
    const analysisFast = buildCandidateProfileFromEvents(FAST_EVENTS);
    const analysisSlow = buildCandidateProfileFromEvents(SLOW_EVENTS);
    expect(analysisFast?.profile.radarDimensions.processingSpeed).toBe(86);
    expect(analysisSlow?.profile.radarDimensions.processingSpeed).toBe(29);
  });

  it("cognition-FAST = 80 = (executiveControl=80 + sustainedAttention=80) / 2", () => {
    // Baseline C6: processingSpeed ya NO entra al composite.
    // Si entrara: (80+80+86)/3 ≈ 82.
    // Que cognition = 80 (no 82) confirma que solo hay un canal RT.
    const candidateFast = makeCandidateWithSignalEvents(FAST_EVENTS, EXEC, SA_FAST);
    const composite = computeComposite(candidateFast);
    expect(composite).not.toBeNull();
    expect(composite!.cognition).toBeCloseTo(80, 5);
  });

  it("cognition-SLOW = 72.5 = (executiveControl=80 + sustainedAttention=65) / 2", () => {
    // Baseline C6: processingSpeed ya NO entra al composite.
    // Si entrara: (80+65+29)/3 ≈ 58.
    // Que cognition = 72.5 (no 58) confirma que solo hay un canal RT.
    const candidateSlow = makeCandidateWithSignalEvents(SLOW_EVENTS, EXEC, SA_SLOW);
    const composite = computeComposite(candidateSlow);
    expect(composite).not.toBeNull();
    expect(composite!.cognition).toBeCloseTo(72.5, 5);
  });

  it("delta cognición RT-rápido vs RT-lento = 7.5 (un solo canal, no dos)", () => {
    // PRUEBA CENTRAL DE C6:
    // delta = cognition_FAST − cognition_SLOW = 80 − 72.5 = 7.5.
    // Este delta corresponde exactamente al cambio en sustainedAttention (80 − 65 = 15)
    // dividido entre 2 (la media incluye executiveControl=80 que no cambia): 15/2 = 7.5.
    // Si processingSpeed aún entrara, delta sería (80+80+86)/3 − (80+65+29)/3 = 82−58 = 24.
    // Un delta = 7.5 (no 24) es evidencia de un solo canal RT en cognición.
    const candidateFast = makeCandidateWithSignalEvents(FAST_EVENTS, EXEC, SA_FAST);
    const candidateSlow = makeCandidateWithSignalEvents(SLOW_EVENTS, EXEC, SA_SLOW);
    const cFast = computeComposite(candidateFast)!;
    const cSlow = computeComposite(candidateSlow)!;
    const delta = cFast.cognition - cSlow.cognition;
    expect(delta).toBeCloseTo(7.5, 5);
  });
});
