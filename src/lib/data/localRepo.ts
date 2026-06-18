import type { Candidate, JobPosition } from "../../types";
import type { Database, DataRepo } from "./types";
import {
  loadDatabase,
  upsertCandidate,
  recordCandidateAccess,
  createCandidate,
  createPosition,
  createCandidateAccount,
  findCandidateByCode,
  attachCandidateInvitation,
  exportJson,
  exportCsv,
} from "../storage";

// Implementación demo: envuelve storage.ts (localStorage). Comportamiento idéntico
// al actual; solo añade la fachada async de DataRepo.
export class LocalRepo implements DataRepo {
  async loadDatabase(): Promise<Database> {
    return loadDatabase();
  }
  async upsertCandidate(candidate: Candidate): Promise<void> {
    upsertCandidate(candidate);
  }
  async recordCandidateAccess(candidate: Candidate): Promise<Candidate> {
    return recordCandidateAccess(candidate);
  }
  async createCandidate(input: {
    name: string;
    email: string;
    phone?: string;
    roleTarget: string;
    positionId?: string;
  }): Promise<Candidate> {
    return createCandidate(input);
  }
  async createPosition(input: {
    title: string;
    department?: string;
    location?: string;
    jd: string;
    enabledAssessments?: string[];
  }): Promise<JobPosition> {
    return createPosition(input);
  }
  async createCandidateAccount(input: {
    name: string;
    email: string;
    phone?: string;
    passwordDigest?: string;
    provider?: Candidate["authProvider"];
    roleTarget?: string;
    positionId?: string;
  }): Promise<Candidate> {
    return createCandidateAccount(input);
  }
  async findCandidateByCode(code: string): Promise<Candidate | undefined> {
    return findCandidateByCode(code);
  }
  async attachCandidateInvitation(account: Candidate, code: string): Promise<Candidate | null> {
    return attachCandidateInvitation(account, code);
  }
  async exportJson(): Promise<string> {
    return exportJson();
  }
  async exportCsv(): Promise<string> {
    return exportCsv();
  }
}
