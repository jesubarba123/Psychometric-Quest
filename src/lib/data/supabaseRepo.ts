import type { SupabaseClient } from "@supabase/supabase-js";
import type { Candidate, JobPosition } from "../../types";
import type { Database, DataRepo, SessionContext } from "./types";

// Implementación de producción: Postgres vía Supabase (RLS + funciones
// security definer). E2 solo cablea el contexto de sesión y la provisión
// del admin; el resto de métodos llegan en las etapas siguientes del plan
// (ver docs/superpowers/plans/2026-07-02-plan-maestro-etapas-bucle.md).
export class SupabaseRepo implements DataRepo {
  constructor(private readonly client: SupabaseClient) {}

  async getSessionContext(): Promise<SessionContext | null> {
    const {
      data: { user },
    } = await this.client.auth.getUser();
    if (!user) return null;

    const { data: profile } = await this.client
      .from("profiles")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile) {
      return {
        userId: user.id,
        email: user.email ?? "",
        role: profile.role as "admin" | "candidate",
        organizationId: profile.organization_id,
      };
    }

    return {
      userId: user.id,
      email: user.email ?? "",
      role: "candidate",
      organizationId: null,
    };
  }

  async ensureAdminOrg(orgName?: string): Promise<{ organizationId: string }> {
    const { data, error } = await this.client.rpc("ensure_admin_org", {
      p_org_name: orgName ?? null,
    });
    if (error) throw new Error(error.message);
    return { organizationId: data as string };
  }

  async loadDatabase(): Promise<Database> {
    throw new Error("SupabaseRepo.loadDatabase: no implementado aún (llega en E5 del plan)");
  }

  async upsertCandidate(_candidate: Candidate): Promise<void> {
    throw new Error("SupabaseRepo.upsertCandidate: no implementado aún (llega en E4 del plan)");
  }

  async recordCandidateAccess(_candidate: Candidate): Promise<Candidate> {
    throw new Error("SupabaseRepo.recordCandidateAccess: no implementado aún (llega en E4 del plan)");
  }

  async createCandidate(_input: {
    name: string;
    email: string;
    phone?: string;
    roleTarget: string;
    positionId?: string;
  }): Promise<Candidate> {
    throw new Error("SupabaseRepo.createCandidate: no implementado aún (llega en E3 del plan)");
  }

  async createPosition(_input: {
    title: string;
    department?: string;
    location?: string;
    jd: string;
    enabledAssessments?: string[];
  }): Promise<JobPosition> {
    throw new Error("SupabaseRepo.createPosition: no implementado aún (llega en E3 del plan)");
  }

  async createCandidateAccount(_input: {
    name: string;
    email: string;
    phone?: string;
    passwordDigest?: string;
    provider?: Candidate["authProvider"];
    roleTarget?: string;
    positionId?: string;
  }): Promise<Candidate> {
    throw new Error("SupabaseRepo.createCandidateAccount: no implementado aún (llega en E4 del plan)");
  }

  async findCandidateByCode(_code: string): Promise<Candidate | undefined> {
    throw new Error("SupabaseRepo.findCandidateByCode: no implementado aún (llega en E4 del plan)");
  }

  async attachCandidateInvitation(_account: Candidate, _code: string): Promise<Candidate | null> {
    throw new Error("SupabaseRepo.attachCandidateInvitation: no implementado aún (llega en E4 del plan)");
  }

  async exportJson(): Promise<string> {
    throw new Error("SupabaseRepo.exportJson: no implementado aún (llega en E5 del plan)");
  }

  async exportCsv(): Promise<string> {
    throw new Error("SupabaseRepo.exportCsv: no implementado aún (llega en E5 del plan)");
  }
}
