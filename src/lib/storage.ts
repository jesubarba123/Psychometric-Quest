import type { Candidate, JobPosition } from "../types";

const KEY = "signal-run-platform-v3";

type Database = {
  candidates: Candidate[];
  positions: JobPosition[];
};

const now = () => new Date().toISOString();

const seed: Database = {
  positions: [
    {
      id: "pos-product-ops",
      title: "Product Operations Analyst",
      department: "Producto",
      location: "Remoto",
      status: "open",
      jd: "Buscamos una persona analítica para mejorar procesos de producto, operaciones, dashboards, métricas, priorización, coordinación cross-functional, documentación, SQL básico y comunicación con stakeholders.",
      createdAt: now(),
    },
    {
      id: "pos-cs-lead",
      title: "Customer Success Lead",
      department: "Revenue",
      location: "Híbrido",
      status: "open",
      jd: "Liderar cartera de clientes, onboarding, soporte consultivo, análisis de salud de cuentas, retención, comunicación ejecutiva, coordinación con producto y mejora continua de experiencia del cliente.",
      createdAt: now(),
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
      createdAt: now(),
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
      createdAt: now(),
      completedAt: now(),
      consentAccepted: true,
      behavioral: {
        adaptability: 82,
        prioritization: 76,
        executiveControl: 71,
        calculatedRisk: 64,
        profile: "Operador estratégico",
      },
      personality: { domains: { O: 64, C: 78, E: 55, A: 82, N: 38 }, answeredAt: now(), inconsistency: 12 },
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
      createdAt: now(),
      completedAt: now(),
      consentAccepted: true,
      behavioral: { adaptability: 91, prioritization: 63, executiveControl: 66, calculatedRisk: 81, profile: "Explorador experimental" },
      personality: { domains: { O: 81, C: 60, E: 72, A: 49, N: 44 }, answeredAt: now(), inconsistency: 18 },
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
      createdAt: now(),
      completedAt: now(),
      consentAccepted: true,
      behavioral: { adaptability: 61, prioritization: 88, executiveControl: 84, calculatedRisk: 38, profile: "Operador estratégico" },
      personality: { domains: { O: 58, C: 84, E: 47, A: 66, N: 33 }, answeredAt: now(), inconsistency: 9 },
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
      createdAt: now(),
      completedAt: now(),
      consentAccepted: true,
      behavioral: { adaptability: 78, prioritization: 57, executiveControl: 59, calculatedRisk: 68, profile: "Creador adaptable" },
      personality: { domains: { O: 70, C: 55, E: 63, A: 71, N: 52 }, answeredAt: now(), inconsistency: 21 },
      events: [],
    },
  ],
};

export function loadDatabase(): Database {
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    localStorage.setItem(KEY, JSON.stringify(seed));
    return structuredClone(seed);
  }
  try {
    const parsed = JSON.parse(raw) as Database;
    if (!parsed.positions) parsed.positions = seed.positions;
    const missingSeed = seed.candidates.filter((candidate) => !parsed.candidates.some((item) => item.id === candidate.id));
    const missingPositions = seed.positions.filter((position) => !parsed.positions.some((item) => item.id === position.id));
    if (missingSeed.length || missingPositions.length) {
      const next = { candidates: [...parsed.candidates, ...missingSeed], positions: [...parsed.positions, ...missingPositions] };
      saveDatabase(next);
      return next;
    }
    return parsed;
  } catch {
    localStorage.setItem(KEY, JSON.stringify(seed));
    return structuredClone(seed);
  }
}

export function saveDatabase(db: Database) {
  localStorage.setItem(KEY, JSON.stringify(db));
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
  password?: string;
  passwordDigest?: string;
  provider?: Candidate["authProvider"];
  roleTarget?: string;
  positionId?: string;
}) {
  const code = `SELF-${Math.floor(10000 + Math.random() * 89999)}`;
  const existing = loadDatabase().candidates.find((candidate) => candidate.email.toLowerCase() === input.email.trim().toLowerCase());
  if (existing) {
    const updated: Candidate = {
      ...existing,
      name: input.name.trim() || existing.name,
      phone: input.phone?.trim() || existing.phone,
      authProvider: input.provider ?? existing.authProvider ?? "email",
      passwordCreated: Boolean(input.password || input.passwordDigest) || existing.passwordCreated,
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
    passwordCreated: Boolean(input.password || input.passwordDigest),
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

export function exportJson() {
  return JSON.stringify(loadDatabase(), null, 2);
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
