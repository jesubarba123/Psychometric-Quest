import type { SupabaseClient } from "@supabase/supabase-js";
import type { Candidate, JobPosition } from "../../types";
import type { Database, DataRepo, SessionContext } from "./types";

// Filas tal como las devuelve Postgres (snake_case), solo los campos que
// SupabaseRepo lee/escribe hoy. `mapPositionRow`/`mapCandidateRow` las
// traducen a los tipos app-facing (camelCase) que usa el resto de la app;
// E5 reusará estos mapeadores para `loadDatabase`.
type PositionRow = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  jd: string;
  status: "open" | "closed";
  enabled_assessments: string[] | null;
  created_at: string;
};

type CandidateRow = {
  id: string;
  position_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  role_target: string;
  invitation_code: string;
  auth_provider: string;
  status: "invited" | "started" | "completed";
  created_at: string;
};

function mapPositionRow(row: PositionRow): JobPosition {
  return {
    id: row.id,
    title: row.title,
    department: row.department ?? undefined,
    location: row.location ?? undefined,
    jd: row.jd,
    status: row.status,
    createdAt: row.created_at,
    enabledAssessments: row.enabled_assessments?.length ? row.enabled_assessments : undefined,
  };
}

function mapCandidateRow(row: CandidateRow): Candidate {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    phone: row.phone ?? undefined,
    roleTarget: row.role_target,
    positionId: row.position_id ?? undefined,
    invitationCode: row.invitation_code,
    authProvider: row.auth_provider as Candidate["authProvider"],
    status: row.status,
    createdAt: row.created_at,
    events: [],
  };
}

function generateInvitationCode(name: string): string {
  return `${name.slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 8999)}`;
}

// Implementación de producción: Postgres vía Supabase (RLS + funciones
// security definer). E2 solo cablea el contexto de sesión y la provisión
// del admin; el resto de métodos llegan en las etapas siguientes del plan
// (ver docs/superpowers/plans/2026-07-02-plan-maestro-etapas-bucle.md).
export class SupabaseRepo implements DataRepo {
  constructor(private readonly client: SupabaseClient) {}

  private async requireAdminOrg(): Promise<string> {
    const ctx = await this.getSessionContext();
    if (!ctx || ctx.role !== "admin" || !ctx.organizationId) {
      throw new Error("Se requiere sesión de admin con organización");
    }
    return ctx.organizationId;
  }

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

  async createCandidate(input: {
    name: string;
    email: string;
    phone?: string;
    roleTarget: string;
    positionId?: string;
  }): Promise<Candidate> {
    const organizationId = await this.requireAdminOrg();

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { data, error } = await this.client
        .from("candidates")
        .insert({
          organization_id: organizationId,
          position_id: input.positionId ?? null,
          full_name: input.name.trim(),
          email: input.email.trim(),
          phone: input.phone?.trim() ?? null,
          role_target: input.roleTarget.trim(),
          invitation_code: generateInvitationCode(input.name),
          auth_provider: "invitation",
          status: "invited",
        })
        .select()
        .single();

      if (!error) return mapCandidateRow(data as CandidateRow);
      if (error.code !== "23505" || attempt === maxAttempts) throw new Error(error.message);
      // Colisión de invitation_code único: reintenta con un código nuevo.
    }

    // Inalcanzable: el loop siempre retorna o lanza en la última iteración.
    throw new Error("No se pudo crear el candidato tras varios intentos");
  }

  async createPosition(input: {
    title: string;
    department?: string;
    location?: string;
    jd: string;
    enabledAssessments?: string[];
  }): Promise<JobPosition> {
    const organizationId = await this.requireAdminOrg();

    const { data, error } = await this.client
      .from("positions")
      .insert({
        organization_id: organizationId,
        title: input.title.trim(),
        department: input.department?.trim() ?? null,
        location: input.location?.trim() ?? null,
        jd: input.jd.trim(),
        status: "open",
        enabled_assessments: input.enabledAssessments ?? [],
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapPositionRow(data as PositionRow);
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
