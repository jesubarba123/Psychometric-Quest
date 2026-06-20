import { bigFiveQuestions, bigFiveDomains, type BigFiveDomainKey } from "../data/bigfive";
import type { BigFiveResult, BehavioralScores, GameEvent } from "../types";

// ─── Constantes de scoring conductual — ver docs/SCORING.md ──────────────────
//
// Adaptabilidad (0–100 normalizado)
// PROVISIONAL — sin calibrar (requiere datos): pesos derivados de criterio experto inicial.
const ADAPTABILITY_W_SECOND_ACCURACY = 72; // peso de precisión en segunda mitad (regla compleja)
const ADAPTABILITY_W_SWITCH_ACCURACY = 18; // peso de precisión global de cambio de regla
const ADAPTABILITY_W_RECOVERY = 10;        // peso de recuperación tras pérdida
const ADAPTABILITY_CLAMP_MIN = 18;         // suelo del rango de salida
const ADAPTABILITY_CLAMP_MAX = 96;         // techo del rango de salida

// Priorización (0–100 normalizado)
// PROVISIONAL — sin calibrar (requiere datos)
const PRIORITIZATION_W_OPS_OPTIMAL = 74;  // peso de elecciones de alta prioridad
const PRIORITIZATION_W_IMPACT_BIAS = 5;   // peso del sesgo hacia ítems de impacto
const PRIORITIZATION_W_IMPACT_OVER_URGENCY = 7; // premio por impacto > urgencia
const PRIORITIZATION_CLAMP_MIN = 20;
const PRIORITIZATION_CLAMP_MAX = 97;

// Control ejecutivo (0–100 normalizado)
// PROVISIONAL — sin calibrar (requiere datos)
const EXEC_W_SWITCH_ACCURACY = 55;        // peso dominante: precisión de cambio de regla
const EXEC_RT_CEILING_MS = 1200;          // techo de RT usado en la penalización de velocidad
const EXEC_RT_DIVISOR = 18;              // divisor para normalizar la ganancia de velocidad (~66 pts máx)
const EXEC_W_OPS_OPTIMAL = 15;           // peso de calidad de decisión operacional
const EXEC_CLAMP_MIN = 18;
const EXEC_CLAMP_MAX = 95;

// Riesgo calculado (0–100 normalizado)
// PROVISIONAL — sin calibrar (requiere datos)
const RISK_BASE = 42;                    // valor de anclaje (no-risk baseline)
const RISK_W_RISK_LEVEL = 62;            // peso del nivel de riesgo promedio en rutas
const RISK_W_RECOVERY = 18;             // peso de recuperación tras pérdida
const RISK_CLAMP_MIN = 18;
const RISK_CLAMP_MAX = 96;

// Umbral de perfil equilibrado — ver docs/SCORING.md §5
// PROVISIONAL — sin calibrar: umbral por debajo del cual ningún eje domina
const BALANCED_SPREAD_THRESHOLD = 7;

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
  // ver docs/SCORING.md §2
  const adaptability = clamp(
    Math.round(
      secondAccuracy * ADAPTABILITY_W_SECOND_ACCURACY +
      switchAccuracy * ADAPTABILITY_W_SWITCH_ACCURACY +
      (recovery !== null ? recovery * ADAPTABILITY_W_RECOVERY : 0)
    ),
    ADAPTABILITY_CLAMP_MIN, ADAPTABILITY_CLAMP_MAX
  );
  // ver docs/SCORING.md §2
  const prioritization = clamp(
    Math.round(
      opsOptimal * PRIORITIZATION_W_OPS_OPTIMAL +
      impactBias * PRIORITIZATION_W_IMPACT_BIAS +
      Math.max(0, impactBias - urgencyBias) * PRIORITIZATION_W_IMPACT_OVER_URGENCY
    ),
    PRIORITIZATION_CLAMP_MIN, PRIORITIZATION_CLAMP_MAX
  );
  // ver docs/SCORING.md §2
  const executiveControl = clamp(
    Math.round(
      switchAccuracy * EXEC_W_SWITCH_ACCURACY +
      Math.max(0, EXEC_RT_CEILING_MS - avgRt) / EXEC_RT_DIVISOR +
      opsOptimal * EXEC_W_OPS_OPTIMAL
    ),
    EXEC_CLAMP_MIN, EXEC_CLAMP_MAX
  );
  // ver docs/SCORING.md §2
  const calculatedRisk = clamp(
    Math.round(
      RISK_BASE +
      riskLevel * RISK_W_RISK_LEVEL +
      (recovery !== null ? recovery * RISK_W_RECOVERY : 0)
    ),
    RISK_CLAMP_MIN, RISK_CLAMP_MAX
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
// C7 — Mapeo lineal y clamps (docs/SCORING.md §4, actualizado en C7):
//   Cada dominio tiene 10 ítems en escala Likert 1–5.
//   Rango de suma con todos los ítems respondidos: mín = 10×1 = 10, máx = 10×5 = 50.
//   Normalización: score_0_100 = round((suma − 10) / (50 − 10) × 100)
//                              = round((suma − 10) / 40 × 100)
//   Resultado: 0 cuando suma=10 (todos los ítems al mínimo), 100 cuando suma=50.
//   INTERPRETACIÓN: este 0–100 es la POSICIÓN EN EL RANGO TEÓRICO DE LA ESCALA
//   del instrumento, NO un percentil poblacional. Un "64" no significa "mejor que
//   el 64 % de la población"; significa que la persona marcó valores equivalentes
//   al 64 % del recorrido posible de la escala. La UI lo comunica explícitamente
//   (C7, BigFiveReport). Sin normas poblacionales, no hay base para hablar de percentiles.
//
//   Con ítems parciales, la normalización usa el rango real del subconjunto respondido:
//   mín = respondedCount × 1, máx = respondedCount × 5.
//   El dominio se marca en partialDomains para que el consumidor lo trate con precaución.
//
//   No hay clamps adicionales: la aritmética produce siempre 0–100 exacto (o 50 si
//   sin respuestas, como valor de posición neutral documentado).
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
