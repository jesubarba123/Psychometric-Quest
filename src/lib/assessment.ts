import { bigFiveQuestions, bigFiveDomains, type BigFiveDomainKey } from "../data/bigfive";
import type { BigFiveResult, BehavioralScores, GameEvent } from "../types";

export function gameEvent(type: string, payload: Record<string, unknown>): GameEvent {
  return {
    id: crypto.randomUUID(),
    type,
    at: new Date().toISOString(),
    payload,
  };
}

export function calculateBehavioral(events: GameEvent[]): BehavioralScores {
  const switchEvents = events.filter((event) => event.type === "switch_answer");
  const opsEvents = events.filter((event) => event.type === "ops_choice");
  const routeEvents = events.filter((event) => event.type === "route_choice");
  const signalResults = events.filter((event) => event.type === "signal_surge_result");
  const signalResult = signalResults[signalResults.length - 1];
  const memoryResults = events.filter((event) => event.type === "memory_result");
  const memoryResult = memoryResults[memoryResults.length - 1];
  const ravenResults = events.filter((event) => event.type === "raven_result");
  const ravenResult = ravenResults[ravenResults.length - 1];

  const secondHalf = switchEvents.filter((event) => Boolean(event.payload.secondRule));
  const switchAccuracy = ratio(switchEvents.filter((event) => event.payload.ok).length, switchEvents.length);
  const secondAccuracy = ratio(secondHalf.filter((event) => event.payload.ok).length, secondHalf.length);
  const avgRt = average(switchEvents.map((event) => Number(event.payload.rt ?? 0)));
  const opsOptimal = ratio(opsEvents.filter((event) => event.payload.optimal).length, opsEvents.length);
  const impactBias = average(opsEvents.map((event) => Number(event.payload.impact ?? 0)));
  const urgencyBias = average(opsEvents.map((event) => Number(event.payload.urgency ?? 0)));
  const riskLevel = average(routeEvents.map((event) => Number(event.payload.risk ?? 0)));
  const recovery = recoveryAfterLoss(routeEvents);

  // Psicometría honesta: si recovery es null (no hubo pérdida medible), se excluye
  // del promedio en lugar de usar el placeholder 0.65. Cada componente solo aporta
  // cuando hay datos reales; los pesos se redistribuyen de forma implícita al omitir
  // el término. Decisión: excluir > inventar (opción psicométricamente honesta C3).
  const adaptability = clamp(
    Math.round(secondAccuracy * 72 + switchAccuracy * 18 + (recovery !== null ? recovery * 10 : 0)),
    18, 96
  );
  const prioritization = clamp(Math.round(opsOptimal * 74 + impactBias * 5 + Math.max(0, impactBias - urgencyBias) * 7), 20, 97);
  const executiveControl = clamp(Math.round(switchAccuracy * 55 + Math.max(0, 1200 - avgRt) / 18 + opsOptimal * 15), 18, 95);
  const calculatedRisk = clamp(
    Math.round(42 + riskLevel * 62 + (recovery !== null ? recovery * 18 : 0)),
    18, 96
  );

  return {
    adaptability,
    prioritization,
    executiveControl,
    calculatedRisk,
    sustainedAttention: signalResult ? Number(signalResult.payload.attentionScore ?? 0) : undefined,
    workingMemory: memoryResult ? Number(memoryResult.payload.workingMemoryScore ?? 0) : undefined,
    fluidReasoning: ravenResult ? Number(ravenResult.payload.fluidReasoning ?? 0) : undefined,
    profile: chooseProfile({ adaptability, prioritization, executiveControl, calculatedRisk }),
  };
}

// Puntúa el Big Five (IPIP-50): aplica keying inverso, suma por dominio (10–50),
// normaliza a 0–100, y calcula un índice de inconsistencia (respuesta incoherente).
//
// C3 — Ítems faltantes: ya NO se imputan a 3 (neutral) en silencio.
// Si algún ítem de un dominio no tiene respuesta, el dominio se incluye en
// `partialDomains`. El score del dominio se calcula solo con los ítems respondidos
// (re-escalando la normalización al rango real de los ítems disponibles), lo que
// produce un valor provisional; el consumidor debe interpretar `partialDomains` para
// decidir si mostrar el resultado o marcarlo como incompleto.
// Decisión psicométrica: reportar faltante explícito > inventar valor neutral.
export function calculateBigFive(answers: Record<string, number>): BigFiveResult {
  const domains = {} as Record<BigFiveDomainKey, number>;
  const inconsistencies: number[] = [];
  const partialDomains: BigFiveDomainKey[] = [];

  for (const domain of bigFiveDomains) {
    const items = bigFiveQuestions.filter((question) => question.domain === domain.key);
    let sum = 0;
    let respondedCount = 0;
    const directKeyed: number[] = [];   // ítems directos, ya en escala 1–5
    const reverseKeyed: number[] = [];  // ítems inversos, re-keyados a escala "directa"

    for (const item of items) {
      const rawValue = answers[item.id];
      if (rawValue === undefined) {
        // Ítem sin respuesta: NO imputamos. Lo omitimos del cálculo.
        continue;
      }
      respondedCount++;
      const effective = item.keyed === 1 ? rawValue : 6 - rawValue;
      sum += effective;
      if (item.keyed === 1) directKeyed.push(rawValue);
      else reverseKeyed.push(6 - rawValue); // re-keyado para comparar en la misma dirección
    }

    // Marcar como parcial si no todos los ítems fueron respondidos
    if (respondedCount < items.length) {
      partialDomains.push(domain.key);
    }

    if (respondedCount === 0) {
      // Sin ninguna respuesta: asignamos 50 (punto medio) como valor de posición
      // únicamente para que el tipo sea siempre number; el consumidor debe usar
      // partialDomains para ignorar este valor o marcarlo como no disponible.
      domains[domain.key] = 50;
    } else {
      // Normalización al rango real de los ítems respondidos (respondedCount * 1 mín → respondedCount * 5 máx)
      const minPossible = respondedCount;
      const maxPossible = respondedCount * 5;
      domains[domain.key] = Math.round(((sum - minPossible) / (maxPossible - minPossible)) * 100);
    }

    // Inconsistencia del dominio: |media de directos − media de inversos re-keyados|.
    // Si la persona responde coherentemente, ambas medias se parecen (diferencia baja).
    if (directKeyed.length && reverseKeyed.length) {
      const diff = Math.abs(average(directKeyed) - average(reverseKeyed)); // 0–4
      inconsistencies.push((diff / 4) * 100);
    }
  }

  const inconsistency = Math.round(inconsistencies.length ? average(inconsistencies) : 0);
  return { domains, answeredAt: new Date().toISOString(), inconsistency, partialDomains };
}

// Arquetipos conductuales definidos por su FIRMA: qué ejes destacan (+) o se
// hunden (-) respecto al promedio del propio candidato. Clasificamos por la
// forma del perfil, no por umbrales absolutos, para evitar que la mayoría caiga
// en un fallback. Los ejes son [adaptability, prioritization, executiveControl,
// calculatedRisk]. Las firmas se normalizan a vector unitario para comparar de
// forma justa entre arquetipos. Los nombres originales se conservan para que los
// candidatos ya evaluados sigan siendo miembros válidos de la taxonomía.
const BEHAVIORAL_ARCHETYPES: { name: string; signature: [number, number, number, number] }[] = [
  { name: "Explorador calibrado", signature: [1, 0, 0, 1] },   // adaptabilidad + riesgo calculado
  { name: "Operador estratégico", signature: [0, 1, 1, 0] },   // priorización + control ejecutivo
  { name: "Arquitecto cauteloso", signature: [0, 0, 1, -1] },  // control ejecutivo + aversión al riesgo
  { name: "Estratega adaptativo", signature: [1, 1, 0, 0] },   // adaptabilidad + priorización
  { name: "Ejecutor resiliente", signature: [1, 0, 1, 0] },    // adaptabilidad + control ejecutivo
];

// Por debajo de esta dispersión (desviación estándar de los 4 ejes, en puntos
// 0–100) consideramos el perfil "plano": ningún eje domina con claridad.
const BALANCED_SPREAD_THRESHOLD = 7;

function chooseProfile(scores: Omit<BehavioralScores, "profile">) {
  const axes = [scores.adaptability, scores.prioritization, scores.executiveControl, scores.calculatedRisk];
  const mean = average(axes);
  const deviation = axes.map((value) => value - mean);
  const spread = Math.sqrt(average(deviation.map((d) => d * d)));

  // Perfil equilibrado: sin un eje dominante, es genuinamente situacional.
  if (spread < BALANCED_SPREAD_THRESHOLD) return "Resolvedor situacional";

  let best = BEHAVIORAL_ARCHETYPES[0].name;
  let bestScore = -Infinity;
  for (const archetype of BEHAVIORAL_ARCHETYPES) {
    const norm = Math.hypot(...archetype.signature) || 1;
    // Proyección de la forma del candidato sobre la firma unitaria del arquetipo.
    const projection = archetype.signature.reduce((sum, weight, i) => sum + weight * deviation[i], 0) / norm;
    if (projection > bestScore) {
      bestScore = projection;
      best = archetype.name;
    }
  }
  return best;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratio(value: number, total: number) {
  if (!total) return 0;
  return value / total;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

// Devuelve la proporción de elecciones moderadas tras la primera pérdida (0–1),
// o null cuando no hubo pérdida medible. El null indica "dato no disponible",
// no un valor real: el llamador debe excluirlo del cálculo en vez de sustituirlo
// por una constante inventada. (C3: eliminado placeholder 0.65)
function recoveryAfterLoss(events: GameEvent[]): number | null {
  const firstLoss = events.findIndex((event) => event.payload.failed);
  // Sin pérdida, o la pérdida fue el último evento → no hay nada posterior que medir.
  if (firstLoss < 0 || firstLoss >= events.length - 1) return null;
  const after = events.slice(firstLoss + 1);
  const moderate = after.filter((event) => event.payload.choice === "probe" || event.payload.choice === "safe").length;
  return ratio(moderate, after.length);
}

export function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
