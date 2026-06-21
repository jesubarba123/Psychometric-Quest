import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;
export const isSupabaseConfigured = Boolean(supabase);

// Lista blanca de administradores (correos), configurable con VITE_ADMIN_EMAILS
// (separados por coma). Por defecto, el admin del README. La autenticación la
// verifica Supabase; esta lista solo decide quién obtiene el rol de administrador.
const adminEmails = ((import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ?? "admin@signal.run")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email?: string | null) {
  return Boolean(email && adminEmails.includes(email.trim().toLowerCase()));
}

export type OAuthProvider = "google" | "github" | "linkedin_oidc" | "azure";

export async function signInWithProvider(provider: OAuthProvider) {
  if (!supabase) return { error: new Error("Supabase no esta configurado") };
  return supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin,
      scopes: provider === "azure" ? "email profile openid" : undefined,
    },
  });
}

export async function signUpWithEmail(input: { email: string; password: string; name: string; phone?: string }) {
  if (!supabase) return { error: new Error("Supabase no esta configurado") };
  return supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.name,
        name: input.name,
        phone: input.phone,
        role: "candidate",
      },
    },
  });
}

export async function signInWithEmail(input: { email: string; password: string }) {
  if (!supabase) return { data: { user: null, session: null }, error: new Error("Supabase no esta configurado") };
  return supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
}
