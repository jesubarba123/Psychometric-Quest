export type Role = "candidate" | "admin";
export type CandidateStatus = "invited" | "started" | "completed";
export type EnglishLevel = "Básico" | "Intermedio" | "Avanzado" | "Nativo / Bilingüe";
export type HiringDecision = "hired" | "rejected" | "pending";
export type CandidateOutcome = {
  decision?: HiringDecision;
  performanceRating?: number;   // 1–5, evaluado a 3–6 meses (solo si hired)
  performanceAt?: string;       // ISO date de la evaluación de desempeño
  note?: string;
  updatedAt?: string;
};

export type BehavioralScores = {
  adaptability: number;
  prioritization: number;
  executiveControl: number;
  calculatedRisk: number;
  sustainedAttention?: number;
  workingMemory?: number;
  fluidReasoning?: number;
  profile: string;
};

import type { BigFiveDomainKey } from "./data/bigfive";

export type BigFiveResult = {
  domains: Record<BigFiveDomainKey, number>; // 0-100 por dominio
  answeredAt: string;
  inconsistency: number;                      // 0-100, señal de respuesta incoherente
  /** Dominios con al menos un ítem sin respuesta. Array vacío = todos completos.
   *  (C3: refleja faltantes explícitamente en vez de imputar a neutral) */
  partialDomains: BigFiveDomainKey[];
};

export type Candidate = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  roleTarget: string;
  positionId?: string;
  invitationCode: string;
  accountCreatedAt?: string;
  profileCompletedAt?: string;
  invitationVerifiedAt?: string;
  authProvider?: "invitation" | "email" | "google" | "outlook" | "linkedin" | "github";
  passwordCreated?: boolean;
  passwordDigest?: string;
  cvFile?: CandidateCvFile;
  cvText?: string;
  cvMatch?: CvMatchResult;
  career?: string;
  yearsExperience?: number;
  photoDataUrl?: string;
  englishLevel?: EnglishLevel;
  hardSkills?: string[];
  executiveSummary?: string;
  personalNote?: string;
  status: CandidateStatus;
  createdAt: string;
  lastSeenAt?: string;
  loginCount?: number;
  startedAt?: string;
  completedAt?: string;
  consentAccepted?: boolean;
  behavioral?: BehavioralScores;
  personality?: BigFiveResult;
  surveyAnswers?: Record<string, number>;
  assessmentOrder?: string[];
  outcome?: CandidateOutcome;
  events: GameEvent[];
};

export type CandidateCvFile = {
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  uploadedAt: string;
};

export type JobPosition = {
  id: string;
  title: string;
  department?: string;
  location?: string;
  jd: string;
  status: "open" | "closed";
  createdAt: string;
  enabledAssessments?: string[]; // claves del catálogo; vacío/undefined = todas
};

export type CvMatchResult = {
  positionId: string;
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  recommendations: string[];
  evaluatedAt: string;
};

export type GameEvent = {
  id: string;
  type: string;
  at: string;
  payload: Record<string, unknown>;
};

