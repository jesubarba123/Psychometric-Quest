// bigfive.ts — Cuestionario de personalidad Big Five con el banco IPIP-50.
// Fuente: International Personality Item Pool (Goldberg). Dominio público — ipip.ori.org.
// El texto en español sigue la versión en español del IPIP; el `keyed` (signo de cada
// ítem) se conserva EXACTAMENTE como el banco canónico en inglés. Verificar la
// traducción oficial contra ipip.ori.org si se publica formalmente.
//
// Convención del dominio N: reportamos **Neuroticismo / Inestabilidad emocional**
// (alto = más reactivo/variable emocionalmente). El keying de los ítems N apunta a
// Neuroticismo, consistente con la columna `neuroticism` del esquema Supabase.

export type BigFiveDomainKey = "O" | "C" | "E" | "A" | "N";

export interface BigFiveDomain {
  key: BigFiveDomainKey;
  name: string;
  shortName: string;
  description: string;
  highLabel: string;
  lowLabel: string;
  color: string;
}

export interface BigFiveQuestion {
  id: string;
  domain: BigFiveDomainKey;
  text: string;
  keyed: 1 | -1;
}

// Anclas de la escala Likert (1–5)
export const BIG_FIVE_SCALE = [
  { value: 1, label: "Muy en desacuerdo", color: "#e05c5c" },
  { value: 2, label: "En desacuerdo", color: "#ef8a78" },
  { value: 3, label: "Neutral", color: "#8aa0a0" },
  { value: 4, label: "De acuerdo", color: "#5cb88a" },
  { value: 5, label: "Muy de acuerdo", color: "#2f9e6b" },
];

export const bigFiveDomains: BigFiveDomain[] = [
  {
    key: "O", name: "Apertura a la experiencia", shortName: "Apertura",
    description: "Tu interés por las ideas, lo abstracto, la imaginación y la curiosidad intelectual.",
    highLabel: "Curioso/a, imaginativo/a, abierto/a a ideas nuevas.",
    lowLabel: "Práctico/a, concreto/a, con preferencia por lo familiar.",
    color: "#6aa8ff",
  },
  {
    key: "C", name: "Responsabilidad", shortName: "Responsabilidad",
    description: "Tu tendencia a la organización, el orden, la disciplina y el cumplimiento.",
    highLabel: "Organizado/a, metódico/a, orientado/a a cumplir.",
    lowLabel: "Flexible, espontáneo/a, menos atado/a a la estructura.",
    color: "#5cb88a",
  },
  {
    key: "E", name: "Extraversión", shortName: "Extraversión",
    description: "Cuánta energía obtienes de la interacción social y la estimulación externa.",
    highLabel: "Sociable, enérgico/a, busca la interacción.",
    lowLabel: "Reservado/a, tranquilo/a, recarga en lo individual.",
    color: "#e8a94a",
  },
  {
    key: "A", name: "Amabilidad", shortName: "Amabilidad",
    description: "Tu orientación hacia la cooperación, la empatía y la consideración por los demás.",
    highLabel: "Empático/a, cooperativo/a, considerado/a.",
    lowLabel: "Directo/a, crítico/a, centrado/a en la tarea.",
    color: "#4ecdc4",
  },
  {
    key: "N", name: "Inestabilidad emocional", shortName: "Estabilidad",
    description: "Tu tendencia a experimentar emociones negativas y reactividad ante el estrés.",
    highLabel: "Sensible al estrés, emocionalmente reactivo/a.",
    lowLabel: "Sereno/a, estable, resistente bajo presión.",
    color: "#e05c5c",
  },
];

export const bigFiveDomainMap = Object.fromEntries(bigFiveDomains.map((d) => [d.key, d])) as Record<BigFiveDomainKey, BigFiveDomain>;

// Banco IPIP-50. Orden numérico 1–50 (ya intercala dominios E,A,C,N,O — no van agrupados).
export const bigFiveQuestions: BigFiveQuestion[] = [
  { id: "ipip-1", domain: "E", keyed: 1, text: "Soy el alma de la fiesta." },
  { id: "ipip-2", domain: "A", keyed: -1, text: "Me importan poco los demás." },
  { id: "ipip-3", domain: "C", keyed: 1, text: "Siempre estoy preparado/a." },
  { id: "ipip-4", domain: "N", keyed: 1, text: "Me estreso con facilidad." },
  { id: "ipip-5", domain: "O", keyed: 1, text: "Tengo un vocabulario rico." },
  { id: "ipip-6", domain: "E", keyed: -1, text: "No hablo mucho." },
  { id: "ipip-7", domain: "A", keyed: 1, text: "Me intereso por la gente." },
  { id: "ipip-8", domain: "C", keyed: -1, text: "Dejo mis cosas tiradas por ahí." },
  { id: "ipip-9", domain: "N", keyed: -1, text: "Estoy relajado/a la mayor parte del tiempo." },
  { id: "ipip-10", domain: "O", keyed: -1, text: "Tengo dificultad para entender ideas abstractas." },
  { id: "ipip-11", domain: "E", keyed: 1, text: "Me siento cómodo/a entre la gente." },
  { id: "ipip-12", domain: "A", keyed: -1, text: "Insulto a la gente." },
  { id: "ipip-13", domain: "C", keyed: 1, text: "Presto atención a los detalles." },
  { id: "ipip-14", domain: "N", keyed: 1, text: "Me preocupo por las cosas." },
  { id: "ipip-15", domain: "O", keyed: 1, text: "Tengo una imaginación vívida." },
  { id: "ipip-16", domain: "E", keyed: -1, text: "Me mantengo en segundo plano." },
  { id: "ipip-17", domain: "A", keyed: 1, text: "Comprendo los sentimientos de los demás." },
  { id: "ipip-18", domain: "C", keyed: -1, text: "Hago un desastre de las cosas." },
  { id: "ipip-19", domain: "N", keyed: -1, text: "Rara vez me siento triste." },
  { id: "ipip-20", domain: "O", keyed: -1, text: "No me interesan las ideas abstractas." },
  { id: "ipip-21", domain: "E", keyed: 1, text: "Inicio conversaciones." },
  { id: "ipip-22", domain: "A", keyed: -1, text: "No me interesan los problemas de los demás." },
  { id: "ipip-23", domain: "C", keyed: 1, text: "Hago mis tareas de inmediato." },
  { id: "ipip-24", domain: "N", keyed: 1, text: "Me altero con facilidad." },
  { id: "ipip-25", domain: "O", keyed: 1, text: "Tengo excelentes ideas." },
  { id: "ipip-26", domain: "E", keyed: -1, text: "Tengo poco que decir." },
  { id: "ipip-27", domain: "A", keyed: 1, text: "Tengo buen corazón." },
  { id: "ipip-28", domain: "C", keyed: -1, text: "A menudo olvido poner las cosas en su lugar." },
  { id: "ipip-29", domain: "N", keyed: 1, text: "Me molesto con facilidad." },
  { id: "ipip-30", domain: "O", keyed: -1, text: "No tengo buena imaginación." },
  { id: "ipip-31", domain: "E", keyed: 1, text: "Hablo con mucha gente distinta en las fiestas." },
  { id: "ipip-32", domain: "A", keyed: -1, text: "Realmente no me intereso por los demás." },
  { id: "ipip-33", domain: "C", keyed: 1, text: "Me gusta el orden." },
  { id: "ipip-34", domain: "N", keyed: 1, text: "Cambio mucho de humor." },
  { id: "ipip-35", domain: "O", keyed: 1, text: "Entiendo las cosas con rapidez." },
  { id: "ipip-36", domain: "E", keyed: -1, text: "No me gusta llamar la atención." },
  { id: "ipip-37", domain: "A", keyed: 1, text: "Saco tiempo para los demás." },
  { id: "ipip-38", domain: "C", keyed: -1, text: "Eludo mis responsabilidades." },
  { id: "ipip-39", domain: "N", keyed: 1, text: "Tengo cambios de humor frecuentes." },
  { id: "ipip-40", domain: "O", keyed: 1, text: "Uso palabras difíciles." },
  { id: "ipip-41", domain: "E", keyed: 1, text: "No me molesta ser el centro de atención." },
  { id: "ipip-42", domain: "A", keyed: 1, text: "Percibo las emociones de los demás." },
  { id: "ipip-43", domain: "C", keyed: 1, text: "Sigo un horario." },
  { id: "ipip-44", domain: "N", keyed: 1, text: "Me irrito con facilidad." },
  { id: "ipip-45", domain: "O", keyed: 1, text: "Dedico tiempo a reflexionar sobre las cosas." },
  { id: "ipip-46", domain: "E", keyed: -1, text: "Soy callado/a con los desconocidos." },
  { id: "ipip-47", domain: "A", keyed: 1, text: "Hago que la gente se sienta a gusto." },
  { id: "ipip-48", domain: "C", keyed: 1, text: "Soy meticuloso/a en mi trabajo." },
  { id: "ipip-49", domain: "N", keyed: 1, text: "A menudo me siento triste." },
  { id: "ipip-50", domain: "O", keyed: 1, text: "Estoy lleno/a de ideas." },
];
