import type { Candidate, JobPosition } from "../../types";
import type { Database } from "../storage";

export type { Database };

export type SessionContext = {
  userId: string;
  email: string;
  role: "admin" | "candidate";
  organizationId: string | null;
};

// Interfaz de acceso a datos, app-facing y denormalizada (espeja storage.ts).
// Todas las operaciones son async para permitir un backend remoto (Supabase).
export interface DataRepo {
  loadDatabase(): Promise<Database>;
  getSessionContext(): Promise<SessionContext | null>;
  ensureAdminOrg(orgName?: string): Promise<{ organizationId: string }>;
  upsertCandidate(candidate: Candidate): Promise<void>;
  recordCandidateAccess(candidate: Candidate): Promise<Candidate>;
  createCandidate(input: {
    name: string;
    email: string;
    phone?: string;
    roleTarget: string;
    positionId?: string;
  }): Promise<Candidate>;
  createPosition(input: {
    title: string;
    department?: string;
    location?: string;
    jd: string;
    enabledAssessments?: string[];
  }): Promise<JobPosition>;
  createCandidateAccount(input: {
    name: string;
    email: string;
    phone?: string;
    passwordDigest?: string;
    provider?: Candidate["authProvider"];
    roleTarget?: string;
    positionId?: string;
  }): Promise<Candidate>;
  findCandidateByCode(code: string): Promise<Candidate | undefined>;
  attachCandidateInvitation(account: Candidate, code: string): Promise<Candidate | null>;
  exportJson(): Promise<string>;
  exportCsv(): Promise<string>;
}
