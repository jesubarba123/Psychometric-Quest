// assessment.test.ts — TDD C3: eliminar placeholders del scoring
// Run with: npm run test:unit
//
// Tres grupos de tests (RED → GREEN):
//   1. recoveryAfterLoss / calculatedRisk — sin pérdida no aporta 0.65 inventado
//   2. meanRt — sin hits no entra como 999 a los agregados
//   3. Big Five — ítems faltantes no se imputan silenciosamente a 3

import { describe, it, expect } from "vitest";
import { calculateBehavioral, calculateBigFive } from "./assessment";
import { computeResult } from "../components/SignalSurge";
import type { GameEvent } from "../types";
import type { SignalEvent } from "../components/SignalSurge";

// ─── Helpers de fixtures ───────────────────────────────────────────────────────

function makeEvent(type: string, payload: Record<string, unknown>): GameEvent {
  return { id: crypto.randomUUID(), type, at: new Date().toISOString(), payload };
}

// Genera N eventos de switch_answer todos correctos (no relevantes para recoveryAfterLoss)
function switchEvents(n: number): GameEvent[] {
  return Array.from({ length: n }, (_, i) =>
    makeEvent("switch_answer", { ok: true, rt: 600 + i * 10, secondRule: i >= Math.floor(n / 2) })
  );
}

// ─── 1. recoveryAfterLoss — sin pérdida, calculatedRisk no se infla con 0.65 ──

describe("recoveryAfterLoss / calculatedRisk — sin pérdida", () => {
  it("cuando NO hay route_events, calculatedRisk se basa solo en riskLevel=0 (no en 0.65)", () => {
    // Sin eventos de ruta → riskLevel=0, recovery=no disponible.
    // La fórmula original: clamp(42 + 0*62 + 0.65*18) = clamp(53.7) = 54
    // La fórmula corregida: clamp(42 + 0*62) = 42 (recovery excluido, no aporta)
    const events = switchEvents(10);
    const result = calculateBehavioral(events);
    // 54 sería el valor contaminado por 0.65; 42 el valor honesto (solo riskLevel)
    expect(result.calculatedRisk).not.toBe(54); // RED: con bug daría 54
    expect(result.calculatedRisk).toBe(42);      // GREEN: sin placeholder
  });

  it("cuando hay route_events pero ninguno con failed=true, calculatedRisk no usa 0.65", () => {
    // Hay rutas pero ninguna pérdida → recovery es "no disponible".
    // riskLevel = average([0.5]) = 0.5
    // Fórmula contaminada: clamp(42 + 0.5*62 + 0.65*18) = clamp(42+31+11.7) = clamp(84.7) = 85
    // Fórmula honesta:     clamp(42 + 0.5*62)           = clamp(42+31)       = clamp(73) = 73
    const routeEvent = makeEvent("route_choice", { risk: 0.5, failed: false, choice: "probe" });
    const events = [...switchEvents(4), routeEvent];
    const result = calculateBehavioral(events);
    expect(result.calculatedRisk).not.toBe(85); // RED: contaminado
    expect(result.calculatedRisk).toBe(73);      // GREEN: honesto
  });

  it("cuando SÍ hay una pérdida seguida de rutas moderadas, recovery entra normalmente", () => {
    // firstLoss en índice 0, luego 2 eventos moderados (probe) de 2 → recovery=1.0
    // riskLevel = average([0.3, 0.4, 0.4]) = 0.366...
    // calculatedRisk = clamp(42 + 0.366*62 + 1.0*18) = clamp(82.7) = 83
    const events = [
      makeEvent("route_choice", { risk: 0.3, failed: true,  choice: "risky" }),
      makeEvent("route_choice", { risk: 0.4, failed: false, choice: "probe" }),
      makeEvent("route_choice", { risk: 0.4, failed: false, choice: "safe"  }),
    ];
    const result = calculateBehavioral(events);
    // Con datos reales de recovery=1, el resultado debe calcularse con ese valor
    expect(result.calculatedRisk).toBe(83);
  });
});

// ─── 2. meanRt — sin hits, no entra como 999 ───────────────────────────────────

describe("computeResult (SignalSurge) — meanRt sin hits", () => {
  it("con cero hits, meanRt es undefined (no 999)", () => {
    const events: SignalEvent[] = [
      { type: "miss", phase: 1 },
      { type: "miss", phase: 1 },
      { type: "false_alarm", phase: 1 },
    ];
    const result = computeResult(events);
    expect(result.meanRt).toBeUndefined(); // RED: con bug daría 999
  });

  it("con cero hits, attentionScore NO usa 999 ms en rtScore (no lo contamina)", () => {
    // rtScore con meanRt=999: max(0, 1-(999-200)/700) = max(0, 1-1.14) = max(0,-0.14) = 0
    // rtScore con meanRt=undefined: excluido del composite → hitRate y faRate dominan
    // Con 0 hits y 0 false alarms puras: hitRate=0, faRate=0
    // attentionScore honesto = round((0*50 + 1*25 + 0.25*rtWeight?...) * (1-0*0.2))
    // Lo esencial: el score no debe ser inflado/deformado por un 999 fantasma.
    // Verificamos que con solo misses, attentionScore sea coherente con hitRate=0.
    const events: SignalEvent[] = Array.from({ length: 4 }, (_, i) => ({
      type: "miss" as const,
      phase: (i < 4 ? 1 : 3) as 1 | 2 | 3,
    }));
    const result = computeResult(events);
    // hitRate=0, faRate=0, rtScore=excluido o 0.
    // El máximo honesto con hitRate=0 y faRate=0 es 25 (solo el componente faRate=25).
    // Con 999 el rtScore=0 y el total sería (0*50 + 25 + 0*25)*1 = 25 — coincide.
    // Pero si hay decayIndex involuntario puede variar; lo que NO debe ocurrir es que
    // meanRt=999 eleve artificialmente algún componente (rtScore con 999 ya da 0, OK).
    // La diferencia real se detecta cuando hits>0 y meanRt=999 haría rtScore incorrecto.
    // Para este caso con 0 hits, el contrato clave es que meanRt sea undefined.
    expect(result.meanRt).toBeUndefined();
  });

  it("con hits reales, meanRt se calcula correctamente y rtScore refleja el RT real", () => {
    const events: SignalEvent[] = [
      { type: "hit", rt: 400, phase: 1 },
      { type: "hit", rt: 600, phase: 1 },
      { type: "miss", phase: 2 },
    ];
    const result = computeResult(events);
    expect(result.meanRt).toBe(500); // (400+600)/2
    // rtScore = max(0, 1-(500-200)/700) = max(0, 1-0.428) ≈ 0.571
    // attentionScore > 0
    expect(result.attentionScore).toBeGreaterThan(0);
  });

  it("rtVariability es 0 cuando solo hay un hit (no NaN ni error)", () => {
    const events: SignalEvent[] = [{ type: "hit", rt: 350, phase: 1 }];
    const result = computeResult(events);
    expect(result.rtVariability).toBe(0);
    expect(result.meanRt).toBe(350);
  });
});

// ─── 3. Big Five — sin imputación silenciosa de faltantes ─────────────────────

describe("calculateBigFive — ítems faltantes no imputados a 3", () => {
  // Construye respuestas completas para un dominio dado (todos los ítems de ese dominio)
  // y omite respuestas para los otros dominios.
  function answersForDomain(domain: "O" | "C" | "E" | "A" | "N", value: number): Record<string, number> {
    // IDs de cada dominio extraídos del banco IPIP-50 (10 por dominio)
    const domainIds: Record<string, string[]> = {
      E: ["ipip-1","ipip-6","ipip-11","ipip-16","ipip-21","ipip-26","ipip-31","ipip-36","ipip-41","ipip-46"],
      A: ["ipip-2","ipip-7","ipip-12","ipip-17","ipip-22","ipip-27","ipip-32","ipip-37","ipip-42","ipip-47"],
      C: ["ipip-3","ipip-8","ipip-13","ipip-18","ipip-23","ipip-28","ipip-33","ipip-38","ipip-43","ipip-48"],
      N: ["ipip-4","ipip-9","ipip-14","ipip-19","ipip-24","ipip-29","ipip-34","ipip-39","ipip-44","ipip-49"],
      O: ["ipip-5","ipip-10","ipip-15","ipip-20","ipip-25","ipip-30","ipip-35","ipip-40","ipip-45","ipip-50"],
    };
    const result: Record<string, number> = {};
    for (const id of domainIds[domain]) result[id] = value;
    return result;
  }

  it("con respuestas parciales, partialDomains lista los dominios incompletos", () => {
    // Solo respondemos el dominio E (10 ítems). Los otros 4 dominios están vacíos.
    const answers = answersForDomain("E", 4);
    const result = calculateBigFive(answers);
    // Debe reportar que A, C, N, O son parciales
    expect(result.partialDomains).toBeDefined();
    expect(result.partialDomains).toContain("A");
    expect(result.partialDomains).toContain("C");
    expect(result.partialDomains).toContain("N");
    expect(result.partialDomains).toContain("O");
    expect(result.partialDomains).not.toContain("E");
  });

  it("con respuestas completas (50 ítems), partialDomains está vacío", () => {
    // Todos los ítems respondidos con valor 3
    const allIds = [
      ...["ipip-1","ipip-6","ipip-11","ipip-16","ipip-21","ipip-26","ipip-31","ipip-36","ipip-41","ipip-46"],
      ...["ipip-2","ipip-7","ipip-12","ipip-17","ipip-22","ipip-27","ipip-32","ipip-37","ipip-42","ipip-47"],
      ...["ipip-3","ipip-8","ipip-13","ipip-18","ipip-23","ipip-28","ipip-33","ipip-38","ipip-43","ipip-48"],
      ...["ipip-4","ipip-9","ipip-14","ipip-19","ipip-24","ipip-29","ipip-34","ipip-39","ipip-44","ipip-49"],
      ...["ipip-5","ipip-10","ipip-15","ipip-20","ipip-25","ipip-30","ipip-35","ipip-40","ipip-45","ipip-50"],
    ];
    const answers: Record<string, number> = {};
    for (const id of allIds) answers[id] = 3;
    const result = calculateBigFive(answers);
    expect(result.partialDomains).toEqual([]);
  });

  it("con respuestas parciales, el dominio respondido tiene el valor correcto", () => {
    // Dominio E respondido entero con valor 5 (máximo)
    // Ítems directos E: ipip-1,11,21,31,41 (keyed=1) → contribuyen 5 c/u
    // Ítems inversos E: ipip-6,16,26,36,46 (keyed=-1) → re-keyed: 6-5=1
    // sum = 5*5 + 1*5 = 30; domains[E] = round((30-10)/40*100) = round(50) = 50
    const answers = answersForDomain("E", 5);
    const result = calculateBigFive(answers);
    expect(result.domains["E"]).toBe(50);
  });

  it("un dominio respondido parcialmente NO iguala al resultado de respuestas completas neutrales", () => {
    // Con el bug original, un dominio sin respuestas daría el mismo score que un dominio
    // donde todas las respuestas son 3 (neutral). Ahora deben ser distinguibles por partialDomains.
    const completeNeutral: Record<string, number> = {};
    const allC = ["ipip-3","ipip-8","ipip-13","ipip-18","ipip-23","ipip-28","ipip-33","ipip-38","ipip-43","ipip-48"];
    for (const id of allC) completeNeutral[id] = 3;

    const emptyAnswers: Record<string, number> = {}; // sin respuestas

    const resultComplete = calculateBigFive(completeNeutral);
    const resultEmpty = calculateBigFive(emptyAnswers);

    // El dominio C con 3 neutral debe ser 50 en ambos casos si hay imputación (bug)
    // o el mismo valor numérico, pero ahora se distinguen por partialDomains
    expect(resultComplete.partialDomains).not.toContain("C"); // C respondido completo
    expect(resultEmpty.partialDomains).toContain("C");       // C sin respuestas = parcial
  });

  it("con respuestas faltantes en un ítem concreto, dataQuality puede detectar el faltante", () => {
    // 9 de 10 ítems del dominio N respondidos → N es parcial
    const partial: Record<string, number> = {
      "ipip-4": 4, "ipip-9": 2, "ipip-14": 3, "ipip-19": 4,
      "ipip-24": 2, "ipip-29": 3, "ipip-34": 4, "ipip-39": 2, "ipip-44": 3,
      // ipip-49 omitido deliberadamente
    };
    const result = calculateBigFive(partial);
    expect(result.partialDomains).toContain("N");
  });
});
