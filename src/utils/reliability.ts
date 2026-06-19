// reliability.ts — Funciones puras de fiabilidad psicométrica (C2).
//
// UMBRAL DE INTERPRETABILIDAD:
//   interpretable = false  cuando:
//     - alpha === null        (no calculable: varianza total 0, o datos insuficientes)
//     - alpha < 0.60         (umbral mínimo convencional; Nunnally 1967 sugería 0.70 para
//                             investigación básica; 0.60 es el piso razonable para tamizaje)
//     - n < 10               (con N pequeño α es inestable: la estimación puntual puede
//                             estar lejos del valor poblacional real; Cortina 1993 muestra
//                             que incluso con N=30 el IC de α es amplio)
//
// Referencias:
//   Nunnally, J.C. (1967). Psychometric Theory. McGraw-Hill.
//   Cortina, J.M. (1993). What is coefficient alpha? Journal of Applied Psychology, 78(1).
//   Cronbach, L.J. (1951). Coefficient alpha and the internal structure of tests.
//     Psychometrika, 16(3), 297-334.
//
// TODO: split-half para Raven (ítems del banco fijo en ravenBank.ts).
//   El banco Raven tiene N_ítems pares; se puede hacer odd/even split y aplicar
//   Spearman-Brown. Pendiente de implementar cuando se confirme que los eventos
//   individuales de "raven_item" incluyen correctamente `item` e `ok`.
//   Ver: src/data/ravenBank.ts y el store "raven" en GamePlayer (App.tsx).

import { bigFiveQuestions, type BigFiveDomainKey } from "../data/bigfive";
import type { Candidate } from "../types";

// ─── Constantes ────────────────────────────────────────────────────────────────

const ALPHA_MIN = 0.60;
const N_MIN = 10;

// ─── Estadísticos de base ──────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Varianza muestral (denominador N-1).
 * Devuelve null si hay menos de 2 elementos (no calculable).
 */
function varianceSample(arr: number[]): number | null {
  if (arr.length < 2) return null;
  const m = mean(arr);
  const sumSq = arr.reduce((s, v) => s + (v - m) ** 2, 0);
  return sumSq / (arr.length - 1);
}

/**
 * Correlación de Pearson entre dos vectores del mismo tamaño.
 * Devuelve null si la correlación no es calculable (desviación 0).
 */
function pearsonR(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 2) return null;
  const mx = mean(x);
  const my = mean(y);
  let num = 0, sx = 0, sy = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    sx += dx * dx;
    sy += dy * dy;
  }
  if (sx === 0 || sy === 0) return null;
  return num / Math.sqrt(sx * sy);
}

// ─── cronbachAlpha ─────────────────────────────────────────────────────────────

/**
 * Alpha de Cronbach sobre una matriz [respondiente × ítem].
 *
 * Fórmula:  α = (k / (k-1)) * (1 - ΣVi / Vt)
 *   k   = número de ítems
 *   ΣVi = suma de varianzas muestrales de cada ítem
 *   Vt  = varianza muestral de las puntuaciones totales (suma por fila)
 *
 * Devuelve null si:
 *   - Menos de 2 ítems (k<2)
 *   - Menos de 2 respondientes (n<2)
 *   - Varianza total es 0 (división por cero — todos responden exactamente igual)
 */
export function cronbachAlpha(itemMatrix: number[][]): number | null {
  const n = itemMatrix.length; // respondientes
  if (n < 2) return null;
  const k = itemMatrix[0]?.length ?? 0; // ítems
  if (k < 2) return null;

  // Varianzas muestrales por ítem
  let sumItemVar = 0;
  for (let j = 0; j < k; j++) {
    const col = itemMatrix.map((row) => row[j]);
    const v = varianceSample(col);
    if (v === null) return null;
    sumItemVar += v;
  }

  // Varianza muestral de los totales
  const totals = itemMatrix.map((row) => row.reduce((s, v) => s + v, 0));
  const totalVar = varianceSample(totals);
  if (totalVar === null || totalVar === 0) return null;

  return (k / (k - 1)) * (1 - sumItemVar / totalVar);
}

// ─── splitHalfSpearmanBrown ────────────────────────────────────────────────────

/**
 * Fiabilidad split-half con corrección Spearman-Brown.
 *
 * Divide los ítems en mitad impar (índices 0,2,4,…) y mitad par (1,3,5,…),
 * calcula la correlación de Pearson entre las sumas de cada mitad por persona,
 * y aplica la corrección:  rSB = 2r / (1+r)
 *
 * Devuelve null si:
 *   - Menos de 2 respondientes
 *   - Menos de 2 ítems (no se puede dividir en dos mitades)
 *   - Correlación no calculable (varianza 0 en alguna mitad)
 */
export function splitHalfSpearmanBrown(itemMatrix: number[][]): number | null {
  const n = itemMatrix.length;
  if (n < 2) return null;
  const k = itemMatrix[0]?.length ?? 0;
  if (k < 2) return null;

  // Suma de la mitad impar y par por persona
  const firstHalf: number[] = [];
  const secondHalf: number[] = [];
  for (const row of itemMatrix) {
    let s1 = 0, s2 = 0;
    for (let j = 0; j < row.length; j++) {
      if (j % 2 === 0) s1 += row[j];
      else s2 += row[j];
    }
    firstHalf.push(s1);
    secondHalf.push(s2);
  }

  const r = pearsonR(firstHalf, secondHalf);
  if (r === null) return null;

  // Corrección Spearman-Brown: rSB = 2r / (1+r)
  return (2 * r) / (1 + r);
}

// ─── bigFiveDomainAlphas ───────────────────────────────────────────────────────

export type DomainReliability = {
  alpha: number | null;
  n: number; // número de respondientes con datos para ese dominio
  interpretable: boolean;
};

/**
 * Calcula α de Cronbach por dominio Big Five sobre el pool de candidatos.
 *
 * Para cada candidato que tenga `surveyAnswers`, extrae la columna de cada ítem
 * del dominio, aplica el keying (invierte los ítems con keyed=-1 → 6-v),
 * y arma la matriz [respondiente × ítem_del_dominio].
 *
 * KEYING: la inversión se aplica ANTES de calcular α, de modo que todas las
 * columnas apunten en la misma dirección constructual. El α estándar requiere
 * que los ítems covaríen positivamente; sin la inversión los ítems reverse-
 * keyed introducirían covarianzas negativas y bajarían α artificialmente.
 *
 * REGLA DE INTERPRETABILIDAD:
 *   interpretable = false  si  alpha === null  ó  alpha < 0.60  ó  n < 10
 */
export function bigFiveDomainAlphas(
  candidates: Candidate[]
): Record<BigFiveDomainKey, DomainReliability> {
  const domains: BigFiveDomainKey[] = ["O", "C", "E", "A", "N"];
  const result = {} as Record<BigFiveDomainKey, DomainReliability>;

  for (const domainKey of domains) {
    const domainItems = bigFiveQuestions.filter((q) => q.domain === domainKey);

    // Construir la matriz: solo candidatos que tengan respuestas para al menos
    // un ítem de este dominio.
    const matrix: number[][] = [];

    for (const candidate of candidates) {
      if (!candidate.surveyAnswers) continue;
      const row: (number | undefined)[] = domainItems.map((item) => {
        const raw = candidate.surveyAnswers![item.id];
        if (raw === undefined) return undefined;
        // Aplicar keying: inversos se convierten a dirección positiva
        return item.keyed === 1 ? raw : 6 - raw;
      });
      // Solo incluir si todos los ítems del dominio tienen respuesta
      if (row.every((v) => v !== undefined)) {
        matrix.push(row as number[]);
      }
    }

    const n = matrix.length;
    const alpha = n >= 2 ? cronbachAlpha(matrix) : null;
    const interpretable =
      alpha !== null && alpha >= ALPHA_MIN && n >= N_MIN;

    result[domainKey] = { alpha, n, interpretable };
  }

  return result;
}
