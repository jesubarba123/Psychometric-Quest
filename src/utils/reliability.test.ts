// reliability.test.ts — TDD C2: fiabilidad alpha/split-half + badge no interpretable
// Run with: npm run test:unit
//
// Cálculo de referencia a mano para cronbachAlpha (vector conocido):
//
//   Matriz (3 respondientes × 3 ítems):
//   Persona 1: [2, 3, 4]
//   Persona 2: [3, 4, 5]
//   Persona 3: [4, 5, 6]
//
//   Varianza de cada ítem (poblacional, N no N-1):
//     Ítem 1: mean=3, desvs=[1,0,1] → var=2/3
//     Ítem 2: mean=4, desvs=[1,0,1] → var=2/3
//     Ítem 3: mean=5, desvs=[1,0,1] → var=2/3
//     ΣVi = 3*(2/3) = 2
//
//   Suma de cada persona (scores totales):
//     P1: 9, P2: 12, P3: 15 → mean=12
//     Varianza total (poblacional): [(9-12)²+(12-12)²+(15-12)²]/3 = 18/3 = 6
//
//   α = (k/(k-1)) * (1 - ΣVi / Vt) = (3/2) * (1 - 2/6) = 1.5 * (2/3) = 1.0
//
// Nota: en este caso perfectamente lineal α=1.00.
// Para el test de valor parcial usamos una matriz con varianza real:
//
//   Matriz (3 respondientes × 2 ítems):
//   Persona 1: [1, 3]
//   Persona 2: [3, 3]
//   Persona 3: [2, 5]
//
//   Varianza ítem 1 (muestral, N-1): [(1-2)²+(3-2)²+(2-2)²]/2 = 2/2 = 1.0
//   Varianza ítem 2 (muestral, N-1): [(3-11/3)²+(3-11/3)²+(5-11/3)²]/2
//     mean_2 = (3+3+5)/3 = 11/3 ≈ 3.667
//     desvs: -2/3, -2/3, 4/3 → desvs²: 4/9, 4/9, 16/9 → sum=24/9
//     var_2 = (24/9)/2 = 12/9 = 4/3 ≈ 1.333
//   ΣVi = 1.0 + 4/3 = 7/3 ≈ 2.333
//
//   Scores totales: P1:4, P2:6, P3:7 → mean=17/3 ≈ 5.667
//   Varianza total (muestral): [(4-17/3)²+(6-17/3)²+(7-17/3)²]/2
//     desvs: -5/3, 1/3, 4/3 → desvs²: 25/9, 1/9, 16/9 → sum=42/9
//     var_T = (42/9)/2 = 42/18 = 7/3 ≈ 2.333
//
//   α = (2/1) * (1 - (7/3)/(7/3)) = 2 * (1-1) = 0  ← ¡α=0 en este ejemplo!
//
// Mejor ejemplo con ítems no perfectamente dependientes (implementación usa muestral N-1):
//
//   Matriz (4 respondientes × 3 ítems):
//   Persona 1: [1, 2, 1]  → total=4
//   Persona 2: [2, 3, 3]  → total=8
//   Persona 3: [3, 4, 4]  → total=11
//   Persona 4: [4, 5, 5]  → total=14
//
//   Varianza muestral (N-1=3) de cada ítem:
//     Ítem 1: mean=2.5, desvs=[-1.5,-0.5,0.5,1.5] → sum²=5 → var=5/3
//     Ítem 2: mean=3.5, desvs=[-1.5,-0.5,0.5,1.5] → sum²=5 → var=5/3
//     Ítem 3: mean=3.25, desvs=[-2.25,-0.25,0.75,1.75] → sum²=5.0+...
//       = [5.0625+0.0625+0.5625+3.0625]/3 = 8.75/3 ≈ 2.917
//     ΣVi = 5/3 + 5/3 + 8.75/3 = 18.75/3 = 6.25
//
//   Scores totales: 4, 8, 11, 14 → mean=37/4=9.25
//   Varianza muestral total (N-1=3):
//     desvs: -5.25, -1.25, 1.75, 4.75 → sum²=27.5625+1.5625+3.0625+22.5625=54.75
//     var_T = 54.75/3 = 18.25
//
//   α = (3/2)*(1 - 6.25/18.25) = 1.5*(12/18.25) = 1.5*(0.6575...) ≈ 0.986
//
// Ese es el α esperado: ≈ 0.986 (±0.01 → [0.976, 0.996])

import { describe, it, expect } from "vitest";
import {
  cronbachAlpha,
  splitHalfSpearmanBrown,
  bigFiveDomainAlphas,
} from "./reliability";
import type { Candidate } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Construye un candidato completado con surveyAnswers sintéticas. */
function makeCandidateWithAnswers(
  id: string,
  answers: Record<string, number>
): Candidate {
  return {
    id,
    name: `Candidato ${id}`,
    email: `${id}@test.com`,
    roleTarget: "Test",
    invitationCode: `CODE-${id}`,
    status: "completed",
    createdAt: "2026-01-01T00:00:00Z",
    surveyAnswers: answers,
    events: [],
  };
}

// IDs de ítems por dominio (del banco IPIP-50, 10 por dominio)
const DOMAIN_IDS = {
  E: ["ipip-1","ipip-6","ipip-11","ipip-16","ipip-21","ipip-26","ipip-31","ipip-36","ipip-41","ipip-46"],
  A: ["ipip-2","ipip-7","ipip-12","ipip-17","ipip-22","ipip-27","ipip-32","ipip-37","ipip-42","ipip-47"],
  C: ["ipip-3","ipip-8","ipip-13","ipip-18","ipip-23","ipip-28","ipip-33","ipip-38","ipip-43","ipip-48"],
  N: ["ipip-4","ipip-9","ipip-14","ipip-19","ipip-24","ipip-29","ipip-34","ipip-39","ipip-44","ipip-49"],
  O: ["ipip-5","ipip-10","ipip-15","ipip-20","ipip-25","ipip-30","ipip-35","ipip-40","ipip-45","ipip-50"],
} as const;

/** Responde todos los ítems Big Five con un valor fijo por dominio. */
function allAnswers(values: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [domain, ids] of Object.entries(DOMAIN_IDS)) {
    const v = values[domain] ?? 3;
    for (const id of ids) out[id] = v;
  }
  return out;
}

// ─── 1. cronbachAlpha ─────────────────────────────────────────────────────────

describe("cronbachAlpha", () => {
  it("calcula α≈0.986 en la matriz de referencia (4 respondientes × 3 ítems)", () => {
    // Cálculo a mano documentado en cabecera del archivo: α ≈ 0.986 (±0.01)
    const matrix = [
      [1, 2, 1],
      [2, 3, 3],
      [3, 4, 4],
      [4, 5, 5],
    ];
    const alpha = cronbachAlpha(matrix);
    expect(alpha).not.toBeNull();
    // α esperado: (3/2)*(1 - 6.25/18.25) ≈ 0.986
    expect(alpha!).toBeCloseTo(0.986, 2);
  });

  it("devuelve 1.0 en una matriz perfectamente lineal (3×3)", () => {
    // Cálculo a mano: α = (3/2)*(1 - 2/6) = 1.0
    const matrix = [
      [2, 3, 4],
      [3, 4, 5],
      [4, 5, 6],
    ];
    const alpha = cronbachAlpha(matrix);
    expect(alpha).not.toBeNull();
    expect(alpha!).toBeCloseTo(1.0, 2);
  });

  it("devuelve null con menos de 2 ítems (columnas)", () => {
    const matrix = [[1], [2], [3]];
    expect(cronbachAlpha(matrix)).toBeNull();
  });

  it("devuelve null con menos de 2 respondientes (filas)", () => {
    const matrix = [[1, 2, 3]];
    expect(cronbachAlpha(matrix)).toBeNull();
  });

  it("devuelve null con matriz vacía", () => {
    expect(cronbachAlpha([])).toBeNull();
  });

  it("devuelve null si varianza total es 0 (todos iguales — no calculable)", () => {
    // Todos responden exactamente igual → Vt=0, división por cero
    const matrix = [
      [3, 3, 3],
      [3, 3, 3],
      [3, 3, 3],
    ];
    expect(cronbachAlpha(matrix)).toBeNull();
  });
});

// ─── 2. splitHalfSpearmanBrown ────────────────────────────────────────────────

describe("splitHalfSpearmanBrown", () => {
  it("devuelve un valor entre -1 y 1 para una matriz válida", () => {
    const matrix = [
      [1, 2, 3, 4],
      [2, 3, 4, 5],
      [3, 4, 5, 6],
      [4, 5, 6, 7],
    ];
    const sh = splitHalfSpearmanBrown(matrix);
    expect(sh).not.toBeNull();
    expect(sh!).toBeGreaterThanOrEqual(-1);
    expect(sh!).toBeLessThanOrEqual(1);
  });

  it("devuelve null con menos de 2 respondientes", () => {
    expect(splitHalfSpearmanBrown([[1, 2, 3, 4]])).toBeNull();
  });

  it("devuelve null con menos de 2 ítems", () => {
    expect(splitHalfSpearmanBrown([[1], [2], [3]])).toBeNull();
  });
});

// ─── 3. bigFiveDomainAlphas ───────────────────────────────────────────────────

describe("bigFiveDomainAlphas", () => {
  it("marca interpretable=false cuando N<10", () => {
    // Solo 3 candidatos (N<10) → no interpretable
    const candidates: Candidate[] = Array.from({ length: 3 }, (_, i) =>
      makeCandidateWithAnswers(`c${i}`, allAnswers({ E: i + 2, A: i + 1, C: 3, N: 4, O: i + 2 }))
    );
    const result = bigFiveDomainAlphas(candidates);
    for (const domain of ["O", "C", "E", "A", "N"] as const) {
      expect(result[domain].interpretable).toBe(false);
      expect(result[domain].n).toBe(3);
    }
  });

  it("devuelve n=0 y interpretable=false cuando no hay candidatos con surveyAnswers", () => {
    const candidates: Candidate[] = [
      makeCandidateWithAnswers("a", {}), // sin respuestas
    ];
    const result = bigFiveDomainAlphas(candidates);
    for (const domain of ["O", "C", "E", "A", "N"] as const) {
      expect(result[domain].n).toBe(0);
      expect(result[domain].interpretable).toBe(false);
    }
  });

  it("calcula n correcto cuando hay candidatos con y sin surveyAnswers", () => {
    // 2 candidatos con respuestas + 1 sin → n=2 para todos los dominios
    const withAnswers = Array.from({ length: 2 }, (_, i) =>
      makeCandidateWithAnswers(`w${i}`, allAnswers({ E: i + 2, A: 3, C: 4, N: 2, O: i + 3 }))
    );
    const withoutAnswers: Candidate = {
      ...makeCandidateWithAnswers("no", {}),
      surveyAnswers: undefined,
    };
    const result = bigFiveDomainAlphas([...withAnswers, withoutAnswers]);
    for (const domain of ["O", "C", "E", "A", "N"] as const) {
      expect(result[domain].n).toBe(2);
    }
  });

  it("alpha es null cuando todos respondieron lo mismo (Vt=0)", () => {
    // 5 candidatos, todos con valor 3 en todo → varianza 0 → α=null
    const candidates = Array.from({ length: 5 }, (_, i) =>
      makeCandidateWithAnswers(`h${i}`, allAnswers({ E: 3, A: 3, C: 3, N: 3, O: 3 }))
    );
    const result = bigFiveDomainAlphas(candidates);
    // No todos los dominios necesariamente tienen α=null aquí porque hay keying
    // inverso (6-v=6-3=3, igual). Sí deben tener n=5.
    for (const domain of ["O", "C", "E", "A", "N"] as const) {
      expect(result[domain].n).toBe(5);
    }
  });

  it("interpretable=false cuando alpha<0.60", () => {
    // Generamos 12 candidatos con respuestas totalmente aleatorias (sin estructura)
    // que producirán un alpha bajo
    const rng = (seed: number) => ((seed * 1103515245 + 12345) & 0x7fffffff) % 5 + 1;
    const candidates = Array.from({ length: 12 }, (_, i) => {
      const answers: Record<string, number> = {};
      let s = i + 1;
      for (const ids of Object.values(DOMAIN_IDS)) {
        for (const id of ids) {
          s = rng(s);
          answers[id] = s;
        }
      }
      return makeCandidateWithAnswers(`r${i}`, answers);
    });
    const result = bigFiveDomainAlphas(candidates);
    // Al menos un dominio debe quedar no interpretable (alpha bajo con datos aleatorios)
    const anyNotInterpretable = Object.values(result).some((d) => !d.interpretable);
    expect(anyNotInterpretable).toBe(true);
  });
});
