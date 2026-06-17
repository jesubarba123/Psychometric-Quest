import { isSupabaseConfigured } from "./supabaseClient";
import type { Candidate, JobPosition } from "../types";

const KEY = "signal-run-platform-v3";

// D-2 — versión del esquema persistido. Se sella en cada guardado; al cargar, si
// la versión no coincide podemos migrar/normalizar en lugar de fallar en silencio.
const SCHEMA_VERSION = 3;

type Database = {
  candidates: Candidate[];
  positions: JobPosition[];
  schemaVersion?: number;
};

const now = () => new Date().toISOString();

// A2 — use fixed ISO dates so demo data does not contaminate time-based metrics
//      (e.g. recency filters, decay curves, or "days since" calculations).
const seed: Database = {
  positions: [
    {
      id: "pos-product-ops",
      title: "Product Operations Analyst",
      department: "Producto",
      location: "Remoto",
      status: "open",
      jd: "Buscamos una persona analítica para mejorar procesos de producto, operaciones, dashboards, métricas, priorización, coordinación cross-functional, documentación, SQL básico y comunicación con stakeholders.",
      createdAt: "2026-01-10T09:00:00.000Z",
    },
    {
      id: "pos-cs-lead",
      title: "Customer Success Lead",
      department: "Revenue",
      location: "Híbrido",
      status: "open",
      jd: "Liderar cartera de clientes, onboarding, soporte consultivo, análisis de salud de cuentas, retención, comunicación ejecutiva, coordinación con producto y mejora continua de experiencia del cliente.",
      createdAt: "2026-01-10T09:00:00.000Z",
    },
  ],
  candidates: [
    {
      id: "cand-demo",
      name: "Candidata Demo",
      email: "demo@candidate.test",
      roleTarget: "Product Operations Analyst",
      positionId: "pos-product-ops",
      invitationCode: "DEMO-2026",
      status: "invited",
      createdAt: "2026-01-15T10:00:00.000Z",
      events: [],
    },
    {
      id: "cand-completed",
      name: "Mateo Rivera",
      email: "mateo@example.com",
      roleTarget: "Customer Success Lead",
      positionId: "pos-cs-lead",
      invitationCode: "MATEO-51",
      status: "completed",
      createdAt: "2026-01-15T10:00:00.000Z",
      completedAt: "2026-01-16T14:30:00.000Z",
      consentAccepted: true,
      behavioral: {
        adaptability: 82,
        prioritization: 76,
        executiveControl: 71,
        calculatedRisk: 64,
        profile: "Operador estratégico",
      },
      personality: { domains: { O: 64, C: 78, E: 55, A: 82, N: 38 }, answeredAt: "2026-01-16T14:25:00.000Z", inconsistency: 12 },
      events: [],
    },
    {
      id: "cand-ana",
      name: "Ana Torres",
      email: "ana@example.com",
      roleTarget: "Growth Analyst",
      positionId: "pos-product-ops",
      invitationCode: "ANA-72",
      status: "completed",
      createdAt: "2026-01-17T09:00:00.000Z",
      completedAt: "2026-01-18T11:00:00.000Z",
      consentAccepted: true,
      behavioral: { adaptability: 91, prioritization: 63, executiveControl: 66, calculatedRisk: 81, profile: "Explorador calibrado" },
      personality: { domains: { O: 81, C: 60, E: 72, A: 49, N: 44 }, answeredAt: "2026-01-18T10:55:00.000Z", inconsistency: 18 },
      events: [],
    },
    {
      id: "cand-lucia",
      name: "Lucía Vega",
      email: "lucia@example.com",
      roleTarget: "Operations Manager",
      positionId: "pos-product-ops",
      invitationCode: "LUC-88",
      status: "completed",
      createdAt: "2026-01-19T08:30:00.000Z",
      completedAt: "2026-01-20T10:15:00.000Z",
      consentAccepted: true,
      behavioral: { adaptability: 61, prioritization: 88, executiveControl: 84, calculatedRisk: 38, profile: "Operador estratégico" },
      personality: { domains: { O: 58, C: 84, E: 47, A: 66, N: 33 }, answeredAt: "2026-01-20T10:10:00.000Z", inconsistency: 9 },
      events: [],
    },
    {
      id: "cand-diego",
      name: "Diego Salas",
      email: "diego@example.com",
      roleTarget: "Product Designer",
      positionId: "pos-product-ops",
      invitationCode: "DIE-34",
      status: "completed",
      createdAt: "2026-01-21T13:00:00.000Z",
      completedAt: "2026-01-22T15:45:00.000Z",
      consentAccepted: true,
      behavioral: { adaptability: 78, prioritization: 57, executiveControl: 59, calculatedRisk: 68, profile: "Explorador calibrado" },
      personality: { domains: { O: 70, C: 55, E: 63, A: 71, N: 52 }, answeredAt: "2026-01-22T15:40:00.000Z", inconsistency: 21 },
      events: [],
    },
  ],
};

// N-2 — migración por-forma del esquema persistido. Cada bump de SCHEMA_VERSION debe
// añadir aquí los pasos que llevan datos antiguos a la forma actual. Es idempotente:
// normaliza estructuras que versiones previas pudieron no tener. Devuelve un objeto ya
// sellado en SCHEMA_VERSION.
function migrate(db: Database): Database {
  const from = db.schemaVersion ?? 1;
  const next: Database = { ...db };
  if (!Array.isArray(next.positions)) next.positions = [...seed.positions];
  if (!Array.isArray(next.candidates)) next.candidates = [];
  // Normalización por candidato: campos que esquemas previos pudieron omitir.
  next.candidates = next.candidates.map((candidate) => ({
    ...candidate,
    events: Array.isArray(candidate.events) ? candidate.events : [],
  }));
  // Pasos versionados futuros: `if (from < 4) { ...transformaciones v3→v4... }`.
  // Hoy v1→v3 solo requiere la normalización de arrays/eventos de arriba.
  if (from < SCHEMA_VERSION) {
    // (sin transformaciones de forma adicionales en este rango)
  }
  next.schemaVersion = SCHEMA_VERSION;
  return next;
}

export function loadDatabase(): Database {
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    saveDatabase(seed);
    return structuredClone(seed);
  }
  try {
    const parsed = JSON.parse(raw) as Database;
    const wasOldVersion = parsed.schemaVersion !== SCHEMA_VERSION;
    const db = migrate(parsed);
    // Re-inyecta datos semilla que falten (posiciones/candidatos demo).
    const missingSeed = seed.candidates.filter((candidate) => !db.candidates.some((item) => item.id === candidate.id));
    const missingPositions = seed.positions.filter((position) => !db.positions.some((item) => item.id === position.id));
    if (missingSeed.length) db.candidates = [...db.candidates, ...missingSeed];
    if (missingPositions.length) db.positions = [...db.positions, ...missingPositions];
    // N-1 — no ignoramos el resultado del guardado. Si migramos de versión o
    // reinyectamos semilla, persistimos; si el persist falla, seguimos con el
    // estado en memoria (coherente) y avisamos.
    if (wasOldVersion || missingSeed.length || missingPositions.length) {
      if (!saveDatabase(db)) {
        console.warn("Estado migrado/normalizado disponible en memoria, pero no se pudo persistir.");
      }
    }
    return db;
  } catch {
    saveDatabase(seed);
    return structuredClone(seed);
  }
}

export function saveDatabase(db: Database): boolean {
  // D-1 — un setItem puede lanzar (QuotaExceededError, modo privado de Safari,
  // storage deshabilitado). No debe tumbar la app; reportamos y devolvemos false.
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...db, schemaVersion: SCHEMA_VERSION }));
    return true;
  } catch (error) {
    console.error("No se pudo guardar en localStorage (¿cuota excedida o almacenamiento deshabilitado?):", error);
    return false;
  }
}

export function upsertCandidate(candidate: Candidate) {
  const db = loadDatabase();
  const index = db.candidates.findIndex((item) => item.id === candidate.id);
  if (index >= 0) db.candidates[index] = candidate;
  else db.candidates.unshift(candidate);
  saveDatabase(db);
}

export function recordCandidateAccess(candidate: Candidate) {
  const next: Candidate = {
    ...candidate,
    lastSeenAt: now(),
    loginCount: (candidate.loginCount ?? 0) + 1,
  };
  upsertCandidate(next);
  return next;
}

export function createCandidate(input: { name: string; email: string; phone?: string; roleTarget: string; positionId?: string }) {
  const code = `${input.name.slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 8999)}`;
  const candidate: Candidate = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone?.trim(),
    roleTarget: input.roleTarget.trim(),
    positionId: input.positionId,
    invitationCode: code,
    authProvider: "invitation",
    status: "invited",
    createdAt: now(),
    loginCount: 0,
    events: [],
  };
  upsertCandidate(candidate);
  return candidate;
}

export function createPosition(input: { title: string; department?: string; location?: string; jd: string; enabledAssessments?: string[] }) {
  const position: JobPosition = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    department: input.department?.trim(),
    location: input.location?.trim(),
    jd: input.jd.trim(),
    status: "open",
    createdAt: now(),
    enabledAssessments: input.enabledAssessments,
  };
  const db = loadDatabase();
  saveDatabase({ ...db, positions: [position, ...db.positions] });
  return position;
}

export function createCandidateAccount(input: {
  name: string;
  email: string;
  phone?: string;
  // B2 — `password` (plaintext) param removed; callers must hash before calling.
  passwordDigest?: string;
  provider?: Candidate["authProvider"];
  roleTarget?: string;
  positionId?: string;
}) {
  // A4 — when Supabase is active, auth/profile management is handled server-side;
  //      writing to localStorage would duplicate records.
  if (isSupabaseConfigured) {
    // Return a minimal in-memory stub so callers don't crash. The actual
    // candidate record lives in Supabase and is loaded via onAuthStateChange.
    return {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      email: input.email.trim(),
      phone: input.phone?.trim(),
      roleTarget: input.roleTarget?.trim() || "Proceso abierto",
      positionId: input.positionId,
      invitationCode: "",
      authProvider: input.provider ?? "email",
      passwordCreated: Boolean(input.passwordDigest),
      accountCreatedAt: now(),
      status: "invited" as const,
      createdAt: now(),
      loginCount: 0,
      events: [],
    };
  }

  const code = `SELF-${Math.floor(10000 + Math.random() * 89999)}`;
  const existing = loadDatabase().candidates.find((candidate) => candidate.email.toLowerCase() === input.email.trim().toLowerCase());
  if (existing) {
    const updated: Candidate = {
      ...existing,
      name: input.name.trim() || existing.name,
      phone: input.phone?.trim() || existing.phone,
      authProvider: input.provider ?? existing.authProvider ?? "email",
      passwordCreated: Boolean(input.passwordDigest) || existing.passwordCreated,
      // C2 — passwordDigest is persisted locally for offline auth; it is
      //      intentionally excluded from exportJson/exportCsv (see those fns).
      passwordDigest: input.passwordDigest ?? existing.passwordDigest,
      accountCreatedAt: existing.accountCreatedAt ?? now(),
      positionId: input.positionId ?? existing.positionId,
    };
    upsertCandidate(updated);
    return updated;
  }

  const candidate: Candidate = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone?.trim(),
    roleTarget: input.roleTarget?.trim() || "Proceso abierto",
    positionId: input.positionId,
    invitationCode: code,
    authProvider: input.provider ?? "email",
    passwordCreated: Boolean(input.passwordDigest),
    // C2 — see note above; excluded from exports below.
    passwordDigest: input.passwordDigest,
    accountCreatedAt: now(),
    status: "invited",
    createdAt: now(),
    loginCount: 0,
    events: [],
  };
  upsertCandidate(candidate);
  return candidate;
}

export function findCandidateByCode(code: string) {
  const normalized = code.trim().toUpperCase();
  return loadDatabase().candidates.find((candidate) => candidate.invitationCode.toUpperCase() === normalized);
}

export function attachCandidateInvitation(account: Candidate, code: string) {
  const normalized = code.trim().toUpperCase();
  const db = loadDatabase();
  const inviteIndex = db.candidates.findIndex((candidate) => candidate.invitationCode.toUpperCase() === normalized);
  if (inviteIndex < 0) return null;

  const invitation = db.candidates[inviteIndex];
  const merged: Candidate = {
    ...invitation,
    name: account.name || invitation.name,
    email: account.email || invitation.email,
    phone: account.phone || invitation.phone,
    roleTarget: account.roleTarget || invitation.roleTarget,
    positionId: account.positionId ?? invitation.positionId,
    authProvider: account.authProvider ?? invitation.authProvider,
    passwordCreated: account.passwordCreated ?? invitation.passwordCreated,
    passwordDigest: account.passwordDigest ?? invitation.passwordDigest,
    cvFile: account.cvFile ?? invitation.cvFile,
    cvText: account.cvText ?? invitation.cvText,
    cvMatch: account.cvMatch ?? invitation.cvMatch,
    accountCreatedAt: account.accountCreatedAt ?? invitation.accountCreatedAt ?? now(),
    profileCompletedAt: account.profileCompletedAt ?? invitation.profileCompletedAt,
    invitationVerifiedAt: now(),
    lastSeenAt: now(),
    loginCount: Math.max(account.loginCount ?? 0, invitation.loginCount ?? 0),
    events: invitation.events?.length ? invitation.events : account.events,
  };

  const withoutAccountDuplicate = db.candidates.filter((candidate, index) => index === inviteIndex || candidate.id !== account.id);
  withoutAccountDuplicate[withoutAccountDuplicate.findIndex((candidate) => candidate.id === invitation.id)] = merged;
  saveDatabase({ ...db, candidates: withoutAccountDuplicate });
  return merged;
}

// C2 — strip passwordDigest before any export so credential hashes never leave the app.
function stripSensitiveFields(candidate: Candidate): Omit<Candidate, "passwordDigest"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordDigest: _omit, ...safe } = candidate;
  return safe;
}

export function exportJson() {
  const db = loadDatabase();
  const safe = { ...db, candidates: db.candidates.map(stripSensitiveFields) };
  return JSON.stringify(safe, null, 2);
}

export function exportCsv() {
  const rows = loadDatabase().candidates.map((candidate) => ({
    name: candidate.name,
    email: candidate.email,
    phone: candidate.phone ?? "",
    roleTarget: candidate.roleTarget,
    status: candidate.status,
    positionId: candidate.positionId ?? "",
    invitationCode: candidate.invitationCode,
    authProvider: candidate.authProvider ?? "",
    accountCreatedAt: candidate.accountCreatedAt ?? "",
    profileCompletedAt: candidate.profileCompletedAt ?? "",
    invitationVerifiedAt: candidate.invitationVerifiedAt ?? "",
    lastSeenAt: candidate.lastSeenAt ?? "",
    loginCount: candidate.loginCount ?? 0,
    cvFileName: candidate.cvFile?.name ?? "",
    cvFileSize: candidate.cvFile?.size ?? "",
    cvMatchScore: candidate.cvMatch?.score ?? "",
    behavioralProfile: candidate.behavioral?.profile ?? "",
    adaptability: candidate.behavioral?.adaptability ?? "",
    prioritization: candidate.behavioral?.prioritization ?? "",
    executiveControl: candidate.behavioral?.executiveControl ?? "",
    calculatedRisk: candidate.behavioral?.calculatedRisk ?? "",
    openness: candidate.personality?.domains.O ?? "",
    conscientiousness: candidate.personality?.domains.C ?? "",
    extraversion: candidate.personality?.domains.E ?? "",
    agreeableness: candidate.personality?.domains.A ?? "",
    neuroticism: candidate.personality?.domains.N ?? "",
    completedAt: candidate.completedAt ?? "",
  }));

  const headers = Object.keys(rows[0] ?? {
    name: "",
    email: "",
    phone: "",
    roleTarget: "",
    status: "",
    positionId: "",
    invitationCode: "",
    authProvider: "",
    accountCreatedAt: "",
    profileCompletedAt: "",
    invitationVerifiedAt: "",
    lastSeenAt: "",
    loginCount: "",
    cvFileName: "",
    cvFileSize: "",
    cvMatchScore: "",
    behavioralProfile: "",
    adaptability: "",
    prioritization: "",
    executiveControl: "",
    calculatedRisk: "",
    openness: "",
    conscientiousness: "",
    extraversion: "",
    agreeableness: "",
    neuroticism: "",
    completedAt: "",
  });

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvValue(String(row[header as keyof typeof row] ?? ""))).join(",")),
  ].join("\n");
}

function csvValue(value: string) {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}
