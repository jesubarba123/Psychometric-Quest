import type { Candidate, JobPosition } from "../../types";
import type { Database, SessionContext } from "./types";
import { repo } from "./repo";

// Store con snapshot en memoria: envuelve `repo` (DataRepo) para que los
// componentes lean/escriban de forma síncrona vía snapshot() mientras la
// persistencia real es async por debajo. Esto permite enchufar un
// SupabaseRepo en el futuro sin tocar componentes.
let db: Database = { candidates: [], positions: [] };

export async function hydrate(): Promise<void> {
  db = await repo.loadDatabase();
}

export async function refresh(): Promise<void> {
  db = await repo.loadDatabase();
}

export function snapshot(): Database {
  return db;
}

export async function upsertCandidate(candidate: Candidate): Promise<void> {
  const result = await repo.upsertCandidate(candidate);
  await refresh();
  return result;
}

export async function recordCandidateAccess(candidate: Candidate): Promise<Candidate> {
  const result = await repo.recordCandidateAccess(candidate);
  await refresh();
  return result;
}

export async function createCandidate(input: {
  name: string;
  email: string;
  phone?: string;
  roleTarget: string;
  positionId?: string;
}): Promise<Candidate> {
  const result = await repo.createCandidate(input);
  await refresh();
  return result;
}

export async function createPosition(input: {
  title: string;
  department?: string;
  location?: string;
  jd: string;
  enabledAssessments?: string[];
}): Promise<JobPosition> {
  const result = await repo.createPosition(input);
  await refresh();
  return result;
}

export async function createCandidateAccount(input: {
  name: string;
  email: string;
  phone?: string;
  passwordDigest?: string;
  provider?: Candidate["authProvider"];
  roleTarget?: string;
  positionId?: string;
}): Promise<Candidate> {
  const result = await repo.createCandidateAccount(input);
  await refresh();
  return result;
}

export async function findCandidateByCode(code: string): Promise<Candidate | undefined> {
  return repo.findCandidateByCode(code);
}

export async function attachCandidateInvitation(account: Candidate, code: string): Promise<Candidate | null> {
  const result = await repo.attachCandidateInvitation(account, code);
  await refresh();
  return result;
}

export async function exportJson(): Promise<string> {
  return repo.exportJson();
}

export async function exportCsv(): Promise<string> {
  return repo.exportCsv();
}

export async function getSessionContext(): Promise<SessionContext | null> {
  return repo.getSessionContext();
}

export async function ensureAdminOrg(orgName?: string): Promise<{ organizationId: string }> {
  return repo.ensureAdminOrg(orgName);
}
