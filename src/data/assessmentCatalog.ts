// assessmentCatalog.ts — Catálogo canónico de pruebas de Psychometric Quest.
// Fuente única de verdad para: pantallas informativas (candidato), menú de pruebas,
// ficha oficial de medición (admin) y cálculo de completitud por posición.

import type { Candidate } from "../types";

export interface AssessmentMeta {
  key: string;            // identificador estable
  name: string;          // nombre visible
  construct: string;     // qué mide, en lenguaje claro (candidato)
  durationMin: number;   // estimación
  candidateIntro: string;// texto de la pantalla previa (candidato)
  eventType: string;     // event type que evidencia completitud
  // Ficha oficial de medición (admin)
  paradigm: string;      // paradigma de origen
  highMeans: string;     // qué significan puntuaciones altas
  lowMeans: string;      // qué significan puntuaciones bajas
  items: string;         // nº de ítems / ensayos
  source: string;        // referencia/fuente
}

export const assessmentCatalog: AssessmentMeta[] = [
  {
    key: "personality", name: "Perfil Big Five", construct: "Personalidad (5 dominios)", durationMin: 6,
    candidateIntro: "Responderás 50 afirmaciones sobre cómo eres habitualmente. NO hay respuestas correctas o incorrectas: responde con sinceridad. Esto mide tu estilo, no tu capacidad. Usa la escala de 'Muy en desacuerdo' a 'Muy de acuerdo'.",
    eventType: "survey_result",
    paradigm: "Modelo de los Cinco Grandes (Big Five) — banco IPIP-50 de Goldberg (autoinforme).",
    highMeans: "Mayor expresión del rasgo en cada dominio (Apertura, Responsabilidad, Extraversión, Amabilidad, Inestabilidad emocional).",
    lowMeans: "Menor expresión del rasgo; no implica déficit — son estilos, no aptitudes.",
    items: "50 ítems (10 por dominio, con ítems directos e inversos).",
    source: "International Personality Item Pool, ipip.ori.org (dominio público).",
  },
  {
    key: "raven", name: "Matrices Raven", construct: "Razonamiento fluido / abstracto", durationMin: 4,
    candidateIntro: "Verás matrices de figuras con una pieza faltante. Cada matriz sigue una lógica por filas y columnas; elige la opción que completa el patrón. Mide tu capacidad de razonar con información nueva.",
    eventType: "raven_result",
    paradigm: "Matrices Progresivas (tipo Raven) — medida clásica de inteligencia fluida (Gf).",
    highMeans: "Mejor identificación de reglas abstractas y razonamiento con información novel.",
    lowMeans: "Mayor dificultad con patrones abstractos en estas condiciones de tiempo.",
    items: "6 ítems de dificultad creciente.",
    source: "Raven (1938); marco CHC (Carroll, 1993).",
  },
  {
    key: "signal_surge", name: "Signal Surge", construct: "Atención sostenida / vigilancia", durationMin: 4,
    candidateIntro: "Aparecerán símbolos rápidamente. Responde solo cuando veas el objetivo e ignora los distractores. Mide tu capacidad de mantener el foco a lo largo del tiempo.",
    eventType: "signal_surge_result",
    paradigm: "Tarea de rendimiento continuo (CPT) — detección de señales con d′.",
    highMeans: "Atención estable, buena sensibilidad (d′) y pocos errores por fatiga.",
    lowMeans: "Más omisiones/falsas alarmas o decremento atencional bajo carga.",
    items: "3 fases × 10 ensayos.",
    source: "Mackworth (1948); Green & Swets (1966).",
  },
  {
    key: "memory_surge", name: "Memory Surge", construct: "Memoria de trabajo", durationMin: 4,
    candidateIntro: "Verás figuras una a una. Marca 'Coincide' cuando la figura actual sea igual a la de hace 2 pasos. Mide cuánta información puedes mantener y actualizar en mente.",
    eventType: "memory_result",
    paradigm: "Tarea N-back (2-back) — actualización de memoria de trabajo.",
    highMeans: "Mayor capacidad de mantener y actualizar información activa.",
    lowMeans: "Capacidad de actualización más limitada en estas condiciones.",
    items: "18 pasos (2-back).",
    source: "Kirchner (1958).",
  },
  {
    key: "switchboard", name: "Switchboard", construct: "Flexibilidad / control ejecutivo", durationMin: 3,
    candidateIntro: "Clasificarás figuras según una regla… que cambiará a mitad del juego sin aviso. Mide tu capacidad de adaptarte cuando las reglas cambian (costo de cambio).",
    eventType: "switch_answer",
    paradigm: "Task-switching — flexibilidad cognitiva y costo de cambio.",
    highMeans: "Adaptación ágil al cambio de regla con bajo costo de cambio.",
    lowMeans: "Mayor costo al alternar reglas (más lento o menos preciso tras el cambio).",
    items: "12 ensayos con cambio de regla.",
    source: "Monsell (2003).",
  },
  {
    key: "ops_queue", name: "Ops Queue", construct: "Priorización / juicio", durationMin: 2,
    candidateIntro: "En cada ronda llegan tres tareas; elige la que mejor equilibra impacto, urgencia y esfuerzo. Mide tu criterio para priorizar bajo restricciones.",
    eventType: "ops_choice",
    paradigm: "Tarea de juicio/triaje multicriterio.",
    highMeans: "Decisiones que maximizan el balance impacto/urgencia/esfuerzo.",
    lowMeans: "Priorización menos óptima según ese balance.",
    items: "4 rondas.",
    source: "Marco de toma de decisiones multicriterio.",
  },
  {
    key: "route_risk", name: "Route Risk", construct: "Toma de riesgo calibrada", durationMin: 3,
    candidateIntro: "Decidirás cuánto arriesgar para avanzar; algunas apuestas fallan. Mide cómo calibras el riesgo y te recuperas tras una pérdida. No hay una 'jugada correcta' única.",
    eventType: "route_choice",
    paradigm: "Tarea de riesgo secuencial (tipo BART).",
    highMeans: "Riesgo en banda media (ni evitativo ni temerario) y buena recuperación tras fallos.",
    lowMeans: "Patrón muy conservador o muy temerario, o baja recuperación tras pérdidas.",
    items: "6 rondas.",
    source: "Lejuez et al. (2002).",
  },
];

export const assessmentMap = Object.fromEntries(assessmentCatalog.map((a) => [a.key, a])) as Record<string, AssessmentMeta>;
export const ALL_ASSESSMENT_KEYS = assessmentCatalog.map((a) => a.key);

// Pruebas habilitadas para un candidato (heredadas de la posición; fallback: todas).
export function enabledAssessmentsFor(enabled?: string[]): string[] {
  const valid = (enabled ?? []).filter((key) => assessmentMap[key]);
  return valid.length ? ALL_ASSESSMENT_KEYS.filter((k) => valid.includes(k)) : ALL_ASSESSMENT_KEYS;
}

// Minimum route_choice events required to consider route_risk complete.
// The catalog lists 6 rounds; a single event could be a stray click, not a full session.
const ROUTE_RISK_MIN_EVENTS = 6;

// ¿El candidato completó una prueba? (personalidad por su campo; juegos por su evento)
export function isAssessmentDone(candidate: Candidate, key: string): boolean {
  if (key === "personality") return Boolean(candidate.personality);
  const meta = assessmentMap[key];
  if (!meta) return false;
  const matching = (candidate.events ?? []).filter((event) => event.type === meta.eventType);
  // M4 — route_risk requires a full session (≥6 route_choice events), not just one.
  if (key === "route_risk") return matching.length >= ROUTE_RISK_MIN_EVENTS;
  return matching.length > 0;
}
