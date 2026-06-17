import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { bigFiveQuestions, bigFiveDomains, bigFiveDomainMap, BIG_FIVE_SCALE, type BigFiveDomainKey } from "./data/bigfive";
import { assessmentCatalog, assessmentMap, enabledAssessmentsFor, isAssessmentDone, ALL_ASSESSMENT_KEYS } from "./data/assessmentCatalog";
import { calculateBigFive, calculateBehavioral, downloadFile, gameEvent } from "./lib/assessment";
import FrogRiskRun, { type RiskChoice } from "./components/FrogRiskRun";
import SignalSurge, { type SignalEvent, type SignalSurgeResult } from "./components/SignalSurge";
import Switchboard, { type SwitchTrialResult } from "./components/Switchboard";
import MemorySurge, { type MemoryEvent, type MemorySurgeResult } from "./components/MemorySurge";
import OpsQueue, { type OpsChoiceResult } from "./components/OpsQueue";
import RavenMatrices, { type RavenResult } from "./components/RavenMatrices";
import { CandidateScatter3D } from "./components/analytics/CandidateScatter3D";
import { PsychometricDashboard } from "./components/analytics/PsychometricDashboard";
import { MeasurementReference } from "./components/analytics/MeasurementReference";
import { attachCandidateInvitation, createCandidate, createCandidateAccount, createPosition, exportCsv, exportJson, loadDatabase, recordCandidateAccess, upsertCandidate } from "./lib/storage";
import { isSupabaseConfigured, signInWithEmail, signInWithProvider, signUpWithEmail, supabase, type OAuthProvider } from "./lib/supabaseClient";
import { buildCandidateProfileFromEvents } from "./utils/psychometricCalculations";
import { computeComposite } from "./utils/compositeAxes";
import { dataQuality, percentileInPool, percentileBand, cvAptitudeGap, positionFit, correlationMatrix, type DataQuality } from "./utils/insights";
import { extractCvText } from "./utils/cvParse";
import type { Candidate, CandidateOutcome, CvMatchResult, EnglishLevel, GameEvent, HiringDecision, JobPosition, Role } from "./types";

const APP_NAME = "Psychometric Quest";
const APP_TAGLINE = "Juegos conductuales + personalidad Big Five";
const APP_LOGO = "/psychometric-quest-logo.png";

type Screen = "login" | "intro" | "profile" | "cv-match" | "access-code" | "consent" | "assessments" | "candidate-report" | "admin";

const routeChoices: RiskChoice[] = [
  { id: "safe", label: "Estabilizar", text: "+6 casi seguro", reward: 6, risk: 0.08 },
  { id: "probe", label: "Probar", text: "+12 con varianza media", reward: 12, risk: 0.32 },
  { id: "leap", label: "Saltar", text: "+22 con alta varianza", reward: 22, risk: 0.56 },
];

export function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [role, setRole] = useState<Role | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [dbVersion, setDbVersion] = useState(0);

  // A1 — mount-only; the internal `role` check prevents double-enter if the
  // auth state fires while a session is already active.
  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        enterCandidate(candidateFromSupabaseUser(data.session.user));
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) enterCandidate(candidateFromSupabaseUser(session.user));
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    setDbVersion((value) => value + 1);
  }

  function enterAdmin() {
    setRole("admin");
    setCandidate(null);
    setScreen("admin");
  }

  function enterCandidate(found: Candidate) {
    const active = recordCandidateAccess(found);
    setRole("candidate");
    setCandidate(active);
    setScreen(active.status === "completed" ? "candidate-report" : "intro");
  }

  function updateCandidate(next: Candidate, nextScreen?: Screen) {
    upsertCandidate(next);
    setCandidate(next);
    refresh();
    if (nextScreen) setScreen(nextScreen);
  }

  return (
    <main className={`shell ${screen === "login" ? "login-shell" : ""}`}>
      <JourneyBackground progress={journeyProgress(screen, candidate)} />
      {screen !== "login" && <Topbar role={role} onLogout={() => { setRole(null); setCandidate(null); setScreen("login"); }} />}
      {screen === "login" && <Login onAdmin={enterAdmin} onCandidate={enterCandidate} />}
      {screen === "intro" && candidate && <CandidateIntro candidate={candidate} onContinue={() => setScreen(nextCandidateScreen(candidate))} />}
      {screen === "profile" && candidate && <CandidateProfile candidate={candidate} onComplete={(next) => updateCandidate(next, "cv-match")} />}
      {screen === "cv-match" && candidate && <CvMatchReview candidate={candidate} onBack={(next) => updateCandidate(next, "profile")} onContinue={(next) => updateCandidate(next, "access-code")} />}
      {screen === "access-code" && candidate && <AccessCode candidate={candidate} onComplete={(next) => updateCandidate(next, next.consentAccepted ? "assessments" : "consent")} />}
      {screen === "consent" && candidate && <Consent candidate={candidate} onAccept={(next) => updateCandidate(next, "assessments")} />}
      {screen === "assessments" && candidate && <Assessments candidate={candidate} onComplete={(next) => updateCandidate(next, "candidate-report")} />}
      {screen === "candidate-report" && candidate && <CandidateReport candidate={candidate} />}
      {screen === "admin" && <AdminDashboard key={dbVersion} onRefresh={refresh} />}
    </main>
  );
}

function Topbar({ role, onLogout }: { role: Role | null; onLogout: () => void }) {
  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-logo" src={APP_LOGO} alt="" />
        <div>
          <strong>{APP_NAME}</strong>
          <small>{APP_TAGLINE}</small>
        </div>
      </div>
      <div className="top-actions">
        <span className="pill">{isSupabaseConfigured ? "Supabase conectado" : "Modo demo local"}</span>
        {role && <button className="icon-button" onClick={onLogout}>Salir</button>}
      </div>
    </header>
  );
}

function JourneyBackground({ progress }: { progress: number }) {
  return (
    <div className="journey-bg" aria-hidden="true" style={{ "--journey": `${progress}%` } as CSSProperties}>
      <div className="skyline" />
      <div className="mountain mountain-back" />
      <div className="mountain mountain-front" />
      <div className="trail">
        <span className="trail-line" />
        <span className="checkpoint c1" />
        <span className="checkpoint c2" />
        <span className="checkpoint c3" />
        <span className="checkpoint c4" />
        <img className="journey-logo-runner" src={APP_LOGO} alt="" />
        <span className="goal-flag" />
      </div>
      <span className="obstacle obstacle-one" />
      <span className="obstacle obstacle-two" />
      <span className="obstacle obstacle-three" />
    </div>
  );
}

function journeyProgress(screen: Screen, candidate: Candidate | null) {
  if (screen === "login") return 7;
  if (screen === "intro") return 14;
  if (screen === "profile") return 22;
  if (screen === "cv-match") return 30;   // A3 — was missing, fell through to 10 (< login)
  if (screen === "access-code") return 38;
  if (screen === "consent") return 50;
  if (screen === "assessments") return 74;
  if (screen === "candidate-report" || candidate?.status === "completed") return 96;
  if (screen === "admin") return 55;
  return 10;
}

function nextCandidateScreen(candidate: Candidate): Screen {
  if (!candidate.phone || !candidate.cvFile || !candidate.positionId) return "profile";
  if (!candidate.cvMatch || candidate.cvMatch.positionId !== candidate.positionId) return "cv-match";
  if (!candidate.invitationVerifiedAt) return "access-code";
  return candidate.consentAccepted ? "assessments" : "consent";
}

function Login({ onAdmin, onCandidate }: { onAdmin: () => void; onCandidate: (candidate: Candidate) => void }) {
  const [authMode, setAuthMode] = useState<"create" | "signin">("create");
  const [signup, setSignup] = useState({ name: "", email: "", phone: "", password: "", confirmPassword: "" });
  const [signin, setSignin] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  async function socialLogin(provider: "google" | "outlook" | "linkedin" | "github") {
    const providerMap: Record<typeof provider, OAuthProvider> = {
      google: "google",
      outlook: "azure",
      linkedin: "linkedin_oidc",
      github: "github",
    };

    if (isSupabaseConfigured) {
      await signInWithProvider(providerMap[provider]);
      return;
    }

    const label = provider === "outlook" ? "Outlook" : provider[0].toUpperCase() + provider.slice(1);
    const created = createCandidateAccount({
      name: `${label} Candidate`,
      email: `${provider}.candidate@example.com`,
      provider,
      roleTarget: "Proceso abierto",
    });
    onCandidate(created);
  }

  async function submitSignup() {
    if (!signup.name || !signup.email || !signup.password) {
      setError("Completa nombre, correo y contraseña para crear tu usuario.");
      return;
    }
    if (!signup.confirmPassword) {
      setError("Vuelve a escribir tu contraseña para confirmar la cuenta.");
      return;
    }
    if (signup.password !== signup.confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (isSupabaseConfigured) {
      const { error: signUpError } = await signUpWithEmail(signup);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
    }
    const created = createCandidateAccount({ ...signup, passwordDigest: await digestPassword(signup.email, signup.password), provider: "email" });
    onCandidate(created);
  }

  async function submitSignin() {
    if (!signin.email || !signin.password) {
      setError("Ingresa correo y contraseña para continuar.");
      return;
    }

    if (isSupabaseConfigured) {
      const { data, error: signInError } = await signInWithEmail(signin);
      if (signInError) {
        setError(signInError.message);
        return;
      }
      if (data.user) onCandidate(candidateFromSupabaseUser(data.user));
      return;
    }

    const existing = loadDatabase().candidates.find((item) => item.email.trim().toLowerCase() === signin.email.trim().toLowerCase());
    if (!existing?.passwordDigest) {
      setError("No encontramos una cuenta local con contraseña para ese correo.");
      return;
    }
    const digest = await digestPassword(signin.email, signin.password);
    if (digest !== existing.passwordDigest) {
      setError("Correo o contraseña incorrectos.");
      return;
    }
    onCandidate(existing);
  }

  return (
    <section className="login-screen">
      <video className="login-video" autoPlay muted loop playsInline preload="auto" poster={APP_LOGO} aria-hidden="true">
        <source src="/hero-loop.mp4" type="video/mp4" />
      </video>
      <div className="login-video-veil" aria-hidden="true" />
      <div className="login-hero">
        <div className="login-hero-copy">
          <div className="login-brand">
            <img src={APP_LOGO} alt="" />
            <span>{APP_NAME}</span>
          </div>
          <h1>Tu próximo rol<br />empieza por conocerte.</h1>
          <p className="lead">
            Juegos conductuales y un perfil de personalidad Big Five que revelan cómo decides, te adaptas y priorizas — en una sola sesión.
          </p>
          <div className="hero-meta">
            <span>5 juegos conductuales</span>
            <span>5 dimensiones Big Five</span>
            <span>Reporte PDF</span>
          </div>
        </div>
        <div className="login-access">
        <div className="login-card login-auth-card">
          {authMode === "create" ? (
            <>
              <button className="auth-toggle" onClick={() => { setAuthMode("signin"); setError(""); }}>Inicia sesión con tu cuenta</button>
              <div className="social-grid">
                <button className="social-button" onClick={() => socialLogin("google")}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Google
                </button>
                <button className="social-button" onClick={() => socialLogin("outlook")}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3H3a2 2 0 00-2 2v14a2 2 0 002 2h18a2 2 0 002-2V5a2 2 0 00-2-2z" fill="#0078D4"/><path d="M3 5l9 7 9-7" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                  Outlook
                </button>
                <button className="social-button" onClick={() => socialLogin("linkedin")}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" fill="#0A66C2"/></svg>
                  LinkedIn
                </button>
                <button className="social-button" onClick={() => socialLogin("github")}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" fill="currentColor"/></svg>
                  GitHub
                </button>
              </div>
              <div className="login-divider"><span>o crea una cuenta</span></div>
              <div className="form-stack">
                <input aria-label="Nombre completo" autoComplete="name" placeholder="Nombre completo" value={signup.name} onChange={(event) => setSignup({ ...signup, name: event.target.value })} />
                <input aria-label="Correo" type="email" autoComplete="email" placeholder="Correo" value={signup.email} onChange={(event) => setSignup({ ...signup, email: event.target.value })} />
                <input aria-label="Teléfono" type="tel" autoComplete="tel" placeholder="Teléfono" value={signup.phone} onChange={(event) => setSignup({ ...signup, phone: event.target.value })} />
                <input aria-label="Contraseña" placeholder="Contraseña" type="password" autoComplete="new-password" value={signup.password} onChange={(event) => setSignup({ ...signup, password: event.target.value })} />
                <input aria-label="Repite tu contraseña" placeholder="Repite tu contraseña" type="password" autoComplete="new-password" value={signup.confirmPassword} onChange={(event) => setSignup({ ...signup, confirmPassword: event.target.value })} />
                <button className="button" onClick={submitSignup}>Crear cuenta y continuar</button>
              </div>
            </>
          ) : (
            <>
              <button className="auth-toggle muted-toggle" onClick={() => { setAuthMode("create"); setError(""); }}>Crear una cuenta nueva</button>
              <div className="login-divider"><span>cuenta existente</span></div>
              <div className="form-stack">
                <input aria-label="Correo" type="email" autoComplete="email" placeholder="Correo" value={signin.email} onChange={(event) => setSignin({ ...signin, email: event.target.value })} />
                <input aria-label="Contraseña" placeholder="Contraseña" type="password" autoComplete="current-password" value={signin.password} onChange={(event) => setSignin({ ...signin, password: event.target.value })} />
                <button className="button" onClick={submitSignin}>Ingresar</button>
              </div>
            </>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        {/* C3 — only show demo admin bypass when Supabase is NOT configured */}
        {!isSupabaseConfigured && (
          <div className="admin-login-strip">
            <span>Acceso administrador demo</span>
            <button className="button secondary" onClick={onAdmin}>Entrar como admin</button>
          </div>
        )}
        </div>
      </div>
    </section>
  );
}

const INTRO_DIMENSIONS = [
  { label: "Flexibilidad", bars: [38, 64, 50, 82, 70], pct: "22%" },
  { label: "Memoria de trabajo", bars: [30, 52, 70, 56, 76], pct: "20%" },
  { label: "Atención sostenida", bars: [58, 72, 60, 68, 80], pct: "20%" },
  { label: "Priorización", bars: [44, 60, 76, 62, 71], pct: "20%" },
  { label: "Riesgo calculado", bars: [54, 47, 66, 73, 60], pct: "18%" },
];

function CandidateIntro({ candidate, onContinue }: { candidate: Candidate; onContinue: () => void }) {
  const firstName = candidate.name.split(" ")[0];
  return (
    <>
      <section className="aurora-hero">
        <div className="aurora-hero-copy">
          <p className="eyebrow">Plataforma de evaluación</p>
          <h1>Toma el control<br />de tu evaluación.</h1>
          <p className="lead">
            Ya estás dentro, {firstName}. Completa tus datos y sube tu CV; luego validas tu código y entras a cinco desafíos conductuales que construyen tu perfil.
          </p>
          <button className="button intro-cta" onClick={onContinue}>Continuar a perfil y CV</button>
          <div className="hero-meta">
            <span>Exploración conductual</span>
            <span>5 juegos · Big Five</span>
            <span>Reporte PDF</span>
          </div>
        </div>
        <aside className="aurora-hero-panel" aria-label="Dimensiones que mide la evaluación">
          <div className="hero-panel-head">
            <span>Lo que vamos a medir</span>
            <span className="hero-panel-pill">5 juegos</span>
          </div>
          <div className="hero-stat-rows">
            {INTRO_DIMENSIONS.map((dim) => (
              <div className="hero-stat-row" key={dim.label}>
                <span className="hero-stat-label">{dim.label}</span>
                <span className="hero-spark" aria-hidden="true">
                  {dim.bars.map((height, index) => (
                    <i key={index} style={{ height: `${height}%` }} />
                  ))}
                </span>
                <strong className="hero-stat-pct">{dim.pct}</strong>
              </div>
            ))}
          </div>
        </aside>
      </section>
      <section className="hero-columns">
        <article>
          <h3>Perfil y CV</h3>
          <p>Sube tu currículum y elige la posición. Calculamos tu match con la descripción del rol antes de jugar.</p>
        </article>
        <article>
          <h3>Desafíos conductuales</h3>
          <p>Cinco juegos cortos miden flexibilidad, memoria de trabajo, atención, priorización y riesgo calculado.</p>
        </article>
        <article>
          <h3>Personalidad y reporte</h3>
          <p>Respondes el cuestionario de personalidad Big Five y recibes un reporte PDF con tu perfil individual, sin compararte con otros.</p>
        </article>
      </section>
    </>
  );
}

const ENGLISH_LEVELS: EnglishLevel[] = ["Básico", "Intermedio", "Avanzado", "Nativo / Bilingüe"];

function CandidateProfile({ candidate, onComplete }: { candidate: Candidate; onComplete: (candidate: Candidate) => void }) {
  const positions = loadDatabase().positions.filter((position) => position.status === "open");
  const [profile, setProfile] = useState({
    name: candidate.name,
    email: candidate.email,
    phone: candidate.phone ?? "",
    roleTarget: candidate.roleTarget,
    positionId: candidate.positionId ?? positions[0]?.id ?? "",
    career: candidate.career ?? "",
    yearsExperience: candidate.yearsExperience != null ? String(candidate.yearsExperience) : "",
    englishLevel: candidate.englishLevel ?? "" as EnglishLevel | "",
    executiveSummary: candidate.executiveSummary ?? "",
    personalNote: candidate.personalNote ?? "",
  });
  const [cvFile, setCvFile] = useState(candidate.cvFile);
  const [cvText, setCvText] = useState(candidate.cvText ?? "");
  const [photo, setPhoto] = useState(candidate.photoDataUrl);
  const [skills, setSkills] = useState<string[]>(candidate.hardSkills ?? []);
  const [skillInput, setSkillInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");

  function addSkill(raw: string) {
    const value = raw.trim().replace(/,$/, "").trim();
    if (!value) return;
    setSkills((items) => items.some((s) => s.toLowerCase() === value.toLowerCase()) ? items : [...items, value]);
    setSkillInput("");
  }

  async function loadCv(file?: File) {
    if (!file) return;
    if (file.size > 3_500_000) {
      setError("Para el demo local usa un CV menor a 3.5 MB. En Supabase se subirá a Storage.");
      return;
    }
    const dataUrl = await readFile(file);
    setCvFile({ name: file.name, size: file.size, type: file.type || "application/octet-stream", dataUrl, uploadedAt: new Date().toISOString() });
    setCvText((value) => value || file.name.replace(/\.[^.]+$/, "").replaceAll(/[-_]/g, " "));
    setError("");
    setParsing(true);
    const extracted = await extractCvText(file);
    setParsing(false);
    if (extracted && extracted.length > 40) setCvText(extracted);
  }

  async function loadPhoto(file?: File) {
    if (!file) return;
    if (file.size > 2_500_000) { setError("La foto debe pesar menos de 2.5 MB."); return; }
    setPhoto(await readFile(file));
    setError("");
  }

  function submit() {
    if (!profile.name || !profile.email || !profile.phone || !profile.positionId || !cvFile) {
      setError("Necesitamos nombre, correo, teléfono, posición y CV para continuar.");
      return;
    }
    if (!profile.career || !profile.yearsExperience || !profile.englishLevel || !profile.executiveSummary) {
      setError("Completa carrera, años de experiencia, nivel de inglés y resumen ejecutivo.");
      return;
    }
    const position = positions.find((item) => item.id === profile.positionId);
    onComplete({
      ...candidate,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      positionId: profile.positionId,
      roleTarget: position?.title ?? profile.roleTarget,
      cvFile,
      cvText,
      cvMatch: undefined,
      career: profile.career,
      yearsExperience: Number(profile.yearsExperience),
      englishLevel: profile.englishLevel || undefined,
      executiveSummary: profile.executiveSummary,
      personalNote: profile.personalNote || undefined,
      photoDataUrl: photo,
      hardSkills: skills,
      authProvider: candidate.authProvider ?? "invitation",
      profileCompletedAt: new Date().toISOString(),
    });
  }

  return (
    <section className="workbench narrow">
      <p className="eyebrow">Perfil del candidato</p>
      <h1>Completa tu candidatura.</h1>
      <p className="lead">Cuéntanos tu formación, experiencia y habilidades. Esto se cruza con tu desempeño en los juegos para el análisis del reclutador.</p>

      <h2 className="profile-section-title">Datos básicos</h2>
      <div className="profile-form">
        <label>Nombre completo<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
        <label>Correo<input value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} /></label>
        <label>Teléfono<input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label>
        <label>
          Posición a la que aplicas
          <select value={profile.positionId} onChange={(event) => {
            const position = positions.find((item) => item.id === event.target.value);
            setProfile({ ...profile, positionId: event.target.value, roleTarget: position?.title ?? profile.roleTarget });
          }}>
            {positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}
          </select>
        </label>
      </div>

      <h2 className="profile-section-title">Formación y experiencia</h2>
      <div className="profile-form">
        <label>Carrera que estudiaste<input value={profile.career} onChange={(event) => setProfile({ ...profile, career: event.target.value })} placeholder="Ej. Ingeniería Industrial, Economía…" /></label>
        <label>Años de experiencia en puestos similares<input type="number" min="0" max="60" value={profile.yearsExperience} onChange={(event) => setProfile({ ...profile, yearsExperience: event.target.value })} placeholder="Ej. 3" /></label>
        <label>
          Nivel de inglés
          <select value={profile.englishLevel} onChange={(event) => setProfile({ ...profile, englishLevel: event.target.value as EnglishLevel })}>
            <option value="">Selecciona…</option>
            {ENGLISH_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
        <label className="photo-field">
          Foto de perfil (opcional)
          <div className="photo-row">
            {photo ? <img className="photo-preview" src={photo} alt="" /> : <span className="photo-placeholder" aria-hidden="true">👤</span>}
            <input type="file" accept="image/*" onChange={(event) => loadPhoto(event.target.files?.[0])} />
          </div>
        </label>
      </div>

      <h2 className="profile-section-title">Hard skills</h2>
      <div className="skills-field">
        <div className="skills-tags">
          {skills.map((skill) => (
            <span className="skill-chip" key={skill}>
              {skill}
              <button type="button" aria-label={`Quitar ${skill}`} onClick={() => setSkills((items) => items.filter((s) => s !== skill))}>×</button>
            </span>
          ))}
          <input
            value={skillInput}
            onChange={(event) => setSkillInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addSkill(skillInput); }
              else if (event.key === "Backspace" && !skillInput && skills.length) { setSkills((items) => items.slice(0, -1)); }
            }}
            onBlur={() => addSkill(skillInput)}
            placeholder={skills.length ? "Agregar otra…" : "Excel, Python, Bloomberg, análisis de datos, ChatGPT, n8n…"}
          />
        </div>
        <small className="field-hint">Escribe una habilidad y pulsa Enter o coma para agregarla.</small>
      </div>

      <h2 className="profile-section-title">Tu candidatura en texto</h2>
      <div className="profile-form">
        <label className="file-drop">
          Currículum PDF/DOC/DOCX
          <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => loadCv(event.target.files?.[0])} />
          <span>{cvFile ? `${cvFile.name} · ${Math.round(cvFile.size / 1024)} KB` : "Selecciona archivo"}{parsing ? " · extrayendo texto…" : ""}</span>
        </label>
        <label className="file-drop">
          Texto del CV (se autocompleta al subir un PDF; puedes editarlo)
          <textarea value={cvText} onChange={(event) => setCvText(event.target.value)} placeholder="Al subir un PDF extraemos su texto automáticamente. Para DOC/DOCX, pega aquí tu experiencia y habilidades." />
        </label>
        <label className="span-2">
          Resumen ejecutivo de tu experiencia profesional
          <textarea value={profile.executiveSummary} onChange={(event) => setProfile({ ...profile, executiveSummary: event.target.value })} placeholder="2-4 líneas sobre tu trayectoria, logros y lo que aportas." />
        </label>
        <label className="span-2">
          Sobre ti, fuera de lo laboral (opcional)
          <textarea value={profile.personalNote} onChange={(event) => setProfile({ ...profile, personalNote: event.target.value })} placeholder="Intereses, hobbies, qué te motiva… cuéntanos un poco de ti." />
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      <button className="button" onClick={submit}>Guardar perfil y continuar</button>
    </section>
  );
}

function CvMatchReview({
  candidate,
  onBack,
  onContinue,
}: {
  candidate: Candidate;
  onBack: (candidate: Candidate) => void;
  onContinue: (candidate: Candidate) => void;
}) {
  const position = loadDatabase().positions.find((item) => item.id === candidate.positionId);
  if (!position) return null;
  const match = calculateCvMatch(candidate, position);

  return (
    <section className="workbench narrow">
      <p className="eyebrow">Match CV vs posición</p>
      <h1>{position.title}</h1>
      <p className="lead">Antes de jugar, revisa qué tan alineado está tu CV con la descripción de la posición. Puedes subir otro CV o continuar con el actual.</p>
      <div className="match-card">
        <div className="match-score" style={{ "--match": `${match.score}%` } as CSSProperties}>
          <strong>{match.score}%</strong>
          <span>match actual</span>
        </div>
        <div>
          <h2>Coincidencias detectadas</h2>
          <div className="keyword-cloud">
            {match.matchedKeywords.length ? match.matchedKeywords.map((keyword) => <span key={keyword}>{keyword}</span>) : <em>Sin coincidencias fuertes todavía.</em>}
          </div>
        </div>
      </div>
      <div className="report-grid">
        <div className="panel">
          <h2>Palabras clave faltantes</h2>
          <div className="keyword-cloud muted-keywords">
            {match.missingKeywords.slice(0, 10).map((keyword) => <span key={keyword}>{keyword}</span>)}
          </div>
        </div>
        <ListBlock title="Recomendaciones para mejorar" items={match.recommendations} />
      </div>
      <div className="jd-preview">
        <h2>JD de referencia</h2>
        <p>{position.jd}</p>
      </div>
      <div className="actions">
        <button className="button secondary" onClick={() => onBack({ ...candidate, cvMatch: undefined })}>Subir otro CV</button>
        <button className="button" onClick={() => onContinue({ ...candidate, cvMatch: match })}>Continuar con este CV</button>
      </div>
    </section>
  );
}

function AccessCode({ candidate, onComplete }: { candidate: Candidate; onComplete: (candidate: Candidate) => void }) {
  const [code, setCode] = useState("DEMO-2026");
  const [error, setError] = useState("");

  function submit() {
    const linked = attachCandidateInvitation(candidate, code);
    if (!linked) {
      setError("No encontramos esa invitación. Revisa el código o pide uno nuevo al administrador.");
      return;
    }
    onComplete(linked);
  }

  return (
    <section className="workbench narrow gate-card">
      <p className="eyebrow">Código de candidato</p>
      <h1>Desbloquea tu evaluación.</h1>
      <p className="lead">
        Ya tenemos tu sesión, datos básicos y CV. Ahora valida el código entregado por la empresa para abrir los juegos.
      </p>
      <div className="gate-steps">
        <span>Sesión</span>
        <span>Perfil + CV</span>
        <strong>Código</strong>
        <span>Evaluación</span>
      </div>
      <label>
        Código de invitación
        <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="DEMO-2026" />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="button" onClick={submit}>Validar y continuar</button>
    </section>
  );
}

function Consent({ candidate, onAccept }: { candidate: Candidate; onAccept: (candidate: Candidate) => void }) {
  return (
    <section className="workbench narrow">
      <p className="eyebrow">Consentimiento</p>
      <h1>Hola, {candidate.name}.</h1>
      <p className="lead">
        Esta experiencia registra decisiones, tiempos de respuesta y respuestas de personalidad para generar insights de talento. No es diagnóstico clínico ni debe usarse como decisión única de selección.
      </p>
      <div className="notice-grid">
        <div><strong>Tu reporte</strong><span>Recibirás un PDF descargable con tu perfil de personalidad, recomendaciones y curva individual de capital.</span></div>
        <div><strong>Datos internos</strong><span>La empresa verá resultados agregados y resumen conductual para análisis.</span></div>
        <div><strong>Privacidad</strong><span>El reporte candidato no muestra comparaciones con otros participantes.</span></div>
      </div>
      <button className="button" onClick={() => onAccept({
        ...candidate,
        consentAccepted: true,
        status: "started",
        startedAt: new Date().toISOString(),
        completedAt: undefined,
        behavioral: undefined,
        personality: undefined,
        events: [],
      })}>Acepto y comenzar</button>
    </section>
  );
}

// Menú de pruebas: el candidato elige cuál hacer y en qué orden (solo las habilitadas).
function Assessments({ candidate, onComplete }: { candidate: Candidate; onComplete: (candidate: Candidate) => void }) {
  const position = loadDatabase().positions.find((item) => item.id === candidate.positionId);
  const enabled = enabledAssessmentsFor(position?.enabledAssessments);
  const [work, setWork] = useState<Candidate>({ ...candidate, status: "started" });
  const [active, setActive] = useState<string | null>(null);

  const doneKeys = enabled.filter((key) => isAssessmentDone(work, key));
  const allDone = doneKeys.length === enabled.length;

  function back(updated?: Candidate) {
    if (updated) setWork(updated);
    setActive(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (active === "personality") {
    return <Survey candidate={work} onComplete={(next) => back(next)} onBack={() => back()} />;
  }
  if (active) {
    // C-1: al re-tomar una prueba, REEMPLAZAR sus eventos (no acumular). Quitamos del
    // historial los eventos cuyo tipo vuelve a entregar esta prueba, y luego añadimos los nuevos.
    return <GamePlayer key={active} gameKey={active} onDone={(events) => {
      const incomingTypes = new Set(events.map((event) => event.type));
      const kept = (work.events ?? []).filter((event) => !incomingTypes.has(event.type));
      back({ ...work, events: [...kept, ...events] });
    }} onBack={() => back()} />;
  }

  return (
    <section className="workbench">
      <div className="section-head">
        <div>
          <p className="eyebrow">Tus pruebas</p>
          <h1>Elige una prueba para comenzar.</h1>
        </div>
        <Progress value={Math.round((doneKeys.length / enabled.length) * 100)} />
      </div>
      <p className="lead">Puedes hacerlas en el orden que prefieras y continuar más tarde. {doneKeys.length}/{enabled.length} completadas.</p>
      <div className="assessment-menu">
        {enabled.map((key) => {
          const meta = assessmentMap[key];
          const done = isAssessmentDone(work, key);
          return (
            <button key={key} className={`assessment-card ${done ? "is-done" : ""}`} onClick={() => setActive(key)}>
              <div className="assessment-card-top">
                <strong>{meta.name}</strong>
                <span className={`assessment-status ${done ? "done" : ""}`}>{done ? "✓ Completada" : "Pendiente"}</span>
              </div>
              <p>{meta.construct}</p>
              <span className="assessment-duration">≈ {meta.durationMin} min{done ? " · repetir" : ""}</span>
            </button>
          );
        })}
      </div>
      <div className="sticky-submit">
        <span>{doneKeys.length}/{enabled.length} pruebas completadas</span>
        <button className="button" disabled={!allDone} onClick={() => onComplete({ ...work, status: "completed", completedAt: new Date().toISOString(), behavioral: calculateBehavioral(work.events ?? []) })}>
          Finalizar y ver mi reporte
        </button>
      </div>
    </section>
  );
}

// Pantalla informativa de una prueba (antes de empezar)
function AssessmentIntro({ metaKey, onStart, onBack }: { metaKey: string; onStart: () => void; onBack: () => void }) {
  const meta = assessmentMap[metaKey];
  return (
    <div className="assessment-intro">
      <span className="eyebrow">{meta.name}</span>
      <h2>{meta.construct}</h2>
      <p className="assessment-intro-text">{meta.candidateIntro}</p>
      <p className="assessment-intro-meta">Duración aproximada: {meta.durationMin} min</p>
      <div className="actions">
        <button className="button secondary" onClick={onBack}>← Volver al menú</button>
        <button className="button" onClick={onStart} autoFocus>Comenzar</button>
      </div>
    </div>
  );
}

// Runner de una sola prueba (intro → práctica única → evaluación real)
function GamePlayer({ gameKey, onDone, onBack }: { gameKey: string; onDone: (events: GameEvent[]) => void; onBack: () => void }) {
  const meta = assessmentMap[gameKey];
  const [stage, setStage] = useState<"intro" | "practice" | "real">("intro");
  const collected = useRef<GameEvent[]>([]);
  // Estado de Route (orquestado)
  const [rRound, setRRound] = useState(0);
  const [rScore, setRScore] = useState(0);
  const [rHistory, setRHistory] = useState<number[]>([0]);
  const [rComplete, setRComplete] = useState(false);
  const rEvents = useRef<GameEvent[]>([]);
  const [pRound, setPRound] = useState(0);
  const [pScore, setPScore] = useState(0);
  const [pHistory, setPHistory] = useState<number[]>([0]);
  const [pComplete, setPComplete] = useState(false);
  const noop = () => {};

  function routeReal(id: string) {
    if (rComplete) return;
    const choice = routeChoices.find((item) => item.id === id)!;
    const pseudo = Math.abs(Math.sin((rRound + 1) * (id.length + 2)) * 1000) % 1;
    const failed = pseudo < choice.risk;
    const delta = failed ? -Math.round(choice.reward * 0.72) : choice.reward;
    const next = rScore + delta;
    rEvents.current = [...rEvents.current, gameEvent("route_choice", { round: rRound, choice: id, risk: choice.risk, failed, delta, score: next })];
    setRScore(next); setRHistory((items) => [...items, next]);
    if (rRound + 1 >= 6) setRComplete(true);
    else setRRound((value) => value + 1);
  }
  function routePractice(id: string) {
    if (pComplete) return;
    const choice = routeChoices.find((item) => item.id === id)!;
    const failed = Math.random() < choice.risk;
    const delta = failed ? -Math.round(choice.reward * 0.72) : choice.reward;
    const next = pScore + delta;
    setPScore(next); setPHistory((items) => [...items, next]);
    if (pRound + 1 >= 2) setPComplete(true);
    else setPRound((value) => value + 1);
  }

  // Almacena los eventos de la prueba real (se entregan al pulsar "Continuar")
  const store = {
    switchboard: (evts: SwitchTrialResult[]) => { collected.current = evts.map((e) => gameEvent("switch_answer", { ...e })); },
    memory_surge: (res: MemorySurgeResult, evts: MemoryEvent[]) => { collected.current = [gameEvent("memory_result", { ...res }), ...evts.map((e, i) => gameEvent("memory_event", { ...e, index: i }))]; },
    raven: (res: RavenResult, raw: Array<{ item: number; ok: boolean; rt: number }>) => { collected.current = [gameEvent("raven_result", { ...res }), ...raw.map((e, i) => gameEvent("raven_item", { ...e, index: i }))]; },
    signal_surge: (res: SignalSurgeResult, evts: SignalEvent[]) => { collected.current = [gameEvent("signal_surge_result", { hits: res.hits, misses: res.misses, falseAlarms: res.falseAlarms, meanRt: res.meanRt, rtVariability: res.rtVariability, decayIndex: res.decayIndex, attentionScore: res.attentionScore }), ...evts.map((e, i) => gameEvent("signal_surge_event", { ...e, index: i }))]; },
    ops_queue: (evts: OpsChoiceResult[]) => { collected.current = evts.map((e) => gameEvent("ops_choice", { ...e })); },
  };
  const finishReal = () => onDone(collected.current);

  return (
    <section className="workbench">
      <div className="section-head">
        <div>
          <p className="eyebrow">Prueba{stage === "practice" ? " · práctica" : ""}</p>
          <h1>{meta.name}</h1>
        </div>
        <button className="button secondary" onClick={onBack}>← Menú</button>
      </div>
      {stage === "practice" && (
        <div className="practice-banner" role="status">
          <strong>Modo práctica</strong> — esta ronda no cuenta. Una oportunidad para familiarizarte antes de la evaluación real.
        </div>
      )}
      <div className="playfield playfield--single">
        {stage === "intro" && <AssessmentIntro metaKey={gameKey} onStart={() => setStage("practice")} onBack={onBack} />}

        {stage !== "intro" && gameKey === "switchboard" && (stage === "practice"
          ? <Switchboard key="p" practice onComplete={noop} onContinue={() => setStage("real")} />
          : <Switchboard key="r" onComplete={store.switchboard} onContinue={finishReal} />)}
        {stage !== "intro" && gameKey === "memory_surge" && (stage === "practice"
          ? <MemorySurge key="p" practice onComplete={noop} onContinue={() => setStage("real")} />
          : <MemorySurge key="r" onComplete={store.memory_surge} onContinue={finishReal} />)}
        {stage !== "intro" && gameKey === "raven" && (stage === "practice"
          ? <RavenMatrices key="p" practice onComplete={noop} onContinue={() => setStage("real")} />
          : <RavenMatrices key="r" onComplete={store.raven} onContinue={finishReal} />)}
        {stage !== "intro" && gameKey === "signal_surge" && (stage === "practice"
          ? <SignalSurge key="p" practice onComplete={noop} onContinue={() => setStage("real")} />
          : <SignalSurge key="r" onComplete={store.signal_surge} onContinue={finishReal} />)}
        {stage !== "intro" && gameKey === "ops_queue" && (stage === "practice"
          ? <OpsQueue key="p" practice onComplete={noop} onContinue={() => setStage("real")} />
          : <OpsQueue key="r" onComplete={store.ops_queue} onContinue={finishReal} />)}
        {stage !== "intro" && gameKey === "route_risk" && (stage === "practice"
          ? <FrogRiskRun key="p" round={pRound} score={pScore} history={pHistory} complete={pComplete} choices={routeChoices} totalRounds={2} onAnswer={routePractice} onContinue={() => setStage("real")} />
          : <FrogRiskRun key="r" round={rRound} score={rScore} history={rHistory} complete={rComplete} choices={routeChoices} onAnswer={routeReal} onContinue={() => rComplete && onDone(rEvents.current)} />)}
      </div>
    </section>
  );
}

function capitalSeries(events: GameEvent[]) {
  return [0, ...events.filter((event) => event.type === "route_choice").map((event) => Number(event.payload.score ?? 0))];
}

function calculateCvMatch(candidate: Candidate, position: JobPosition): CvMatchResult {
  const jdKeywords = extractKeywords(`${position.title} ${position.jd}`);
  // El "corpus" del candidato ahora incluye el texto real del CV (extraído del PDF),
  // las hard skills declaradas, el resumen ejecutivo y la carrera — no solo lo pegado.
  const cvCorpus = [
    candidate.cvText ?? "",
    candidate.cvFile?.name ?? "",
    candidate.roleTarget,
    candidate.career ?? "",
    (candidate.hardSkills ?? []).join(" "),
    candidate.executiveSummary ?? "",
  ].join(" ");
  const cvKeywords = new Set(extractKeywords(cvCorpus, 200));
  const matchedKeywords = jdKeywords.filter((keyword) => cvKeywords.has(keyword));
  const missingKeywords = jdKeywords.filter((keyword) => !cvKeywords.has(keyword));
  const coverage = jdKeywords.length ? matchedKeywords.length / jdKeywords.length : 0;
  const roleBonus = normalize(position.title) === normalize(candidate.roleTarget) ? 12 : 0;
  // Bonus por experiencia declarada (hasta +8 alrededor de ~5 años)
  const expBonus = candidate.yearsExperience != null ? Math.min(8, candidate.yearsExperience * 1.6) : 0;
  const score = clamp(Math.round(34 + coverage * 50 + roleBonus + expBonus), 18, 98);
  const recommendations = buildCvRecommendations(matchedKeywords, missingKeywords, position);

  return {
    positionId: position.id,
    score,
    matchedKeywords: matchedKeywords.slice(0, 14),
    missingKeywords: missingKeywords.slice(0, 14),
    recommendations,
    evaluatedAt: new Date().toISOString(),
  };
}

function extractKeywords(text: string, limit = 28) {
  // M3 — slice(0, limit) must come AFTER dedup + stopword filter, not before,
  // so long JDs are not truncated before meaningful tokens are extracted.
  const stopwords = new Set([
    "para", "con", "por", "una", "uno", "del", "las", "los", "que", "como", "esta", "este", "desde", "sobre",
    "persona", "buscamos", "experiencia", "equipo", "trabajo", "rol", "posición", "posicion", "nivel", "actual",
  ]);
  return [...new Set(normalize(text)
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3 && !stopwords.has(word))
    .slice(0, limit))];
}

function buildCvRecommendations(matched: string[], missing: string[], position: JobPosition) {
  const topMissing = missing.slice(0, 5);
  const items = [
    `Alinea el resumen profesional con la posición "${position.title}" usando lenguaje similar al de la JD.`,
    topMissing.length ? `Incluye evidencia concreta relacionada con: ${topMissing.join(", ")}.` : "Tu CV cubre las palabras clave principales; refuerza logros medibles.",
    "Agrega resultados cuantificados: métricas, impacto, volumen, tiempos o mejora lograda.",
    matched.length < 4 ? "Haz más explícitas tus herramientas, responsabilidades y contexto de trabajo." : "Mantén las coincidencias actuales y ordénalas por relevancia para la posición.",
  ];
  return items;
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
}

const SURVEY_PAGE_SIZE = 5;

function Survey({ candidate, onComplete, onBack }: { candidate: Candidate; onComplete: (candidate: Candidate) => void; onBack?: () => void }) {
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [page, setPage] = useState(0);

  if (!started) {
    return (
      <section className="workbench">
        <div className="playfield playfield--single">
          <AssessmentIntro metaKey="personality" onStart={() => setStarted(true)} onBack={() => onBack?.()} />
        </div>
      </section>
    );
  }
  const totalPages = Math.ceil(bigFiveQuestions.length / SURVEY_PAGE_SIZE);
  const pageQuestions = bigFiveQuestions.slice(page * SURVEY_PAGE_SIZE, page * SURVEY_PAGE_SIZE + SURVEY_PAGE_SIZE);
  const answered = Object.keys(answers).length;
  const pageComplete = pageQuestions.every((question) => answers[question.id]);
  const isLast = page === totalPages - 1;
  const pct = Math.round((answered / bigFiveQuestions.length) * 100);

  function pick(id: string, value: number) {
    setAnswers((items) => ({ ...items, [id]: value }));
  }

  function goNext() {
    if (isLast) {
      const personality = calculateBigFive(answers);
      const surveyEvent = gameEvent("survey_result", { ...personality.domains, inconsistency: personality.inconsistency });
      // C-1: re-tomar no debe duplicar el survey_result; reemplazamos el previo si existe.
      const kept = (candidate.events ?? []).filter((event) => event.type !== "survey_result");
      onComplete({ ...candidate, personality, surveyAnswers: answers, events: [...kept, surveyEvent] });
    } else {
      setPage((value) => value + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <section className="workbench jung-survey">
      <div className="jung-head">
        <div className="jung-progress-row">
          <span className="jung-pct">{pct}%</span>
          <span className="jung-page">{page + 1} de {totalPages}</span>
        </div>
        <div className="jung-progress-bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="jung-legend-card">
          <p>Indica cuánto te describe cada afirmación. No hay respuestas correctas o incorrectas — responde con sinceridad.</p>
          <div className="jung-legend">
            {BIG_FIVE_SCALE.map((option) => (
              <div className="jung-legend-item" key={option.value}>
                <span className="jung-circle" style={{ "--opt": option.color } as CSSProperties} />
                <small style={{ color: option.color }}>{option.label}</small>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="jung-questions">
        {pageQuestions.map((question, index) => (
          <div className="jung-question" key={question.id}>
            <p>{question.text}</p>
            <div className="jung-options" role="radiogroup" aria-label={question.text}>
              {BIG_FIVE_SCALE.map((option) => (
                <button
                  key={option.value}
                  className={`jung-circle jung-opt ${answers[question.id] === option.value ? "is-selected" : ""}`}
                  style={{ "--opt": option.color } as CSSProperties}
                  onClick={() => pick(question.id, option.value)}
                  role="radio"
                  aria-checked={answers[question.id] === option.value}
                  aria-label={option.label}
                  title={option.label}
                />
              ))}
            </div>
            {index < pageQuestions.length - 1 && <span className="jung-divider" />}
          </div>
        ))}
      </div>

      <div className="sticky-submit jung-foot">
        <span>{answered}/{bigFiveQuestions.length} respuestas</span>
        <div className="actions">
          {page > 0 && (
            <button className="button secondary" onClick={() => { setPage((value) => value - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Atrás</button>
          )}
          <button className="button" disabled={!pageComplete} onClick={goNext}>{isLast ? "Ver mi perfil" : "Siguiente"}</button>
        </div>
      </div>
    </section>
  );
}

// Reporte de personalidad Big Five (5 dominios), lenguaje no evaluativo
function BigFiveReport({ result, audience }: { result: import("./types").BigFiveResult; audience: "candidate" | "admin" }) {
  return (
    <div className="bigfive-report">
      {bigFiveDomains.map((domain) => {
        const value = result.domains[domain.key];
        const tendency = value >= 60 ? domain.highLabel : value <= 40 ? domain.lowLabel : "En un punto intermedio entre ambos extremos.";
        return (
          <div className="bf-domain" key={domain.key}>
            <div className="bf-domain-head">
              <strong>{domain.name}</strong>
              <span className="bf-domain-score" style={{ color: domain.color }}>{value}</span>
            </div>
            <div className="bf-bar"><i style={{ width: `${value}%`, background: domain.color }} /></div>
            <p className="bf-domain-desc">{audience === "candidate" ? `Tiendes a: ${tendency.toLowerCase()}` : tendency}</p>
          </div>
        );
      })}
      {result.inconsistency > 60 && audience === "admin" && (
        <p className="bf-inconsistency">⚠ Índice de inconsistencia alto ({result.inconsistency}/100): posibles respuestas incoherentes o poco cuidadosas. Interpretar con cautela.</p>
      )}
    </div>
  );
}

function CandidateReport({ candidate }: { candidate: Candidate }) {
  const psychometricAnalysis = useMemo(() => buildCandidateProfileFromEvents(candidate.events ?? []), [candidate.events]);
  if (!candidate.behavioral && !candidate.personality) return null;

  function downloadReport() {
    const html = candidateReportHtml(candidate);
    const win = window.open("", "_blank", "width=900,height=1200");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  return (
    <section className="workbench">
      <div className="report-hero report-hero--plain">
        <div>
          <p className="eyebrow">Reporte del candidato</p>
          <h1>{candidate.name}</h1>
          <p className="lead">Tu perfil combina personalidad (Big Five) y desempeño en los juegos conductuales. La personalidad describe tu estilo, no tu capacidad.</p>
          <div className="actions">
            <button className="button" onClick={downloadReport}>Descargar PDF</button>
            <button className="button secondary" onClick={() => downloadFile(`psychometric-quest-${candidate.name}.json`, JSON.stringify(candidate, null, 2), "application/json")}>Descargar mi JSON</button>
          </div>
        </div>
      </div>
      <div className="report-grid">
        {candidate.personality && (
          <div className="panel wide">
            <h2>Tu perfil de personalidad (Big Five)</h2>
            <p className="muted-copy">Cinco dimensiones de estilo personal. No hay puntuaciones "buenas" o "malas" — describen cómo tiendes a ser.</p>
            <BigFiveReport result={candidate.personality} audience="candidate" />
          </div>
        )}
        {candidate.behavioral && (
          <div className="panel wide">
            <h2>Tu ubicación 3D individual</h2>
            <p className="muted-copy">Este gráfico muestra únicamente tu resultado en los tres ejes conductuales. No compara tu punto con otros candidatos.</p>
            <CandidateScatter3D candidates={[candidate]} mode="personal" />
          </div>
        )}
        {candidate.behavioral && (
          <div className="panel">
            <h2>Detalle conductual</h2>
            <div className="score-list">
              <ScoreRow label="Adaptabilidad" value={candidate.behavioral.adaptability} />
              <ScoreRow label="Priorización" value={candidate.behavioral.prioritization} />
              <ScoreRow label="Control ejecutivo" value={candidate.behavioral.executiveControl} />
              <ScoreRow label="Riesgo calculado" value={candidate.behavioral.calculatedRisk} />
              {typeof candidate.behavioral.sustainedAttention === "number" && <ScoreRow label="Atención sostenida" value={candidate.behavioral.sustainedAttention} />}
              {typeof candidate.behavioral.workingMemory === "number" && <ScoreRow label="Memoria de trabajo" value={candidate.behavioral.workingMemory} />}
              {typeof candidate.behavioral.fluidReasoning === "number" && <ScoreRow label="Razonamiento fluido" value={candidate.behavioral.fluidReasoning} />}
            </div>
            <p className="profile-note"><strong>{candidate.behavioral.profile}</strong> resume el patrón observado durante los juegos conductuales.</p>
          </div>
        )}
        {candidate.cvMatch && (
          <div className="panel">
            <h2>Match CV / posición</h2>
            <div className="match-score-large">{candidate.cvMatch.score}%</div>
            <p className="muted-copy">Nivel de coincidencia actual entre tu CV cargado y la posición seleccionada.</p>
            <h3>Recomendaciones para mejorar el match</h3>
            <ul className="compact-list">{candidate.cvMatch.recommendations.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        )}
        {psychometricAnalysis && (
          <div className="panel wide">
            <PsychometricDashboard
              profile={psychometricAnalysis.profile}
              frogChoices={psychometricAnalysis.frogChoices}
              audience="candidate"
            />
          </div>
        )}
      </div>
      <p className="disclaimer">Resultado orientativo. No es diagnóstico psicológico ni debe usarse como decisión única de selección.</p>
    </section>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-row">
      <span>{label}</span>
      <div><i style={{ width: `${value}%` }} /></div>
      <strong>{value}</strong>
    </div>
  );
}

function buildValidationCsv(candidates: Candidate[], positions: JobPosition[]): string {
  const esc = (value: unknown) => {
    const s = value == null ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = [
    "candidate_id", "name", "email", "position", "status",
    "career", "years_experience", "english_level", "hard_skills_count",
    "cv_match_score",
    "adaptability", "prioritization", "executive_control", "calculated_risk", "sustained_attention", "working_memory", "fluid_reasoning",
    "composite_cognition", "composite_strategy", "composite_risk_calibrated",
    "openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism", "personality_inconsistency",
    "data_quality_score", "data_quality_level",
    "outcome_decision", "outcome_performance_rating", "outcome_performance_at",
    "completed_at",
  ];
  const rows = candidates.map((candidate) => {
    const comp = computeComposite(candidate);
    const quality = dataQuality(candidate);
    const behavioral = candidate.behavioral;
    const position = positions.find((item) => item.id === candidate.positionId);
    return [
      candidate.id, candidate.name, candidate.email, position?.title ?? candidate.roleTarget, candidate.status,
      candidate.career ?? "", candidate.yearsExperience ?? "", candidate.englishLevel ?? "", candidate.hardSkills?.length ?? 0,
      candidate.cvMatch?.score ?? "",
      behavioral?.adaptability ?? "", behavioral?.prioritization ?? "", behavioral?.executiveControl ?? "", behavioral?.calculatedRisk ?? "", behavioral?.sustainedAttention ?? "", behavioral?.workingMemory ?? "", behavioral?.fluidReasoning ?? "",
      comp?.cognition ?? "", comp?.strategy ?? "", comp?.riskCalibrated ?? "",
      candidate.personality?.domains.O ?? "", candidate.personality?.domains.C ?? "", candidate.personality?.domains.E ?? "", candidate.personality?.domains.A ?? "", candidate.personality?.domains.N ?? "", candidate.personality?.inconsistency ?? "",
      candidate.status === "completed" ? quality.score : "", candidate.status === "completed" ? quality.level : "",
      candidate.outcome?.decision ?? "", candidate.outcome?.performanceRating ?? "", candidate.outcome?.performanceAt ?? "",
      candidate.completedAt ?? "",
    ];
  });
  return [headers.join(","), ...rows.map((row) => row.map(esc).join(","))].join("\n");
}

function AdminCandidateDetail({ candidate, positions, pool, onBack }: { candidate: Candidate; positions: JobPosition[]; pool: Candidate[]; onBack: () => void }) {
  const position = positions.find((item) => item.id === candidate.positionId);
  const quality = dataQuality(candidate);
  const gap = cvAptitudeGap(candidate);
  const fit = positionFit(candidate);
  const comp = computeComposite(candidate);
  const poolComps = pool.map((c) => computeComposite(c)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const band = percentileBand(poolComps.length);
  const percentiles = comp ? [
    { label: "Cognición", value: comp.cognition, p: percentileInPool(comp.cognition, poolComps.map((c) => c.cognition)) },
    { label: "Estrategia", value: comp.strategy, p: percentileInPool(comp.strategy, poolComps.map((c) => c.strategy)) },
    { label: "Riesgo calibrado", value: comp.riskCalibrated, p: percentileInPool(comp.riskCalibrated, poolComps.map((c) => c.riskCalibrated)) },
  ] : [];
  function openCv() {
    if (!candidate.cvFile?.dataUrl) return;
    // C1 (iframe) — avoid document.write with a data URL; open the data URL
    // directly instead. Browsers treat data: URLs as opaque origins so there is
    // no cross-origin escalation risk, and no arbitrary HTML is injected.
    window.open(candidate.cvFile.dataUrl, "_blank", "noopener,noreferrer");
  }
  return (
    <section className="workbench">
      <div className="section-head">
        <div>
          <p className="eyebrow">Ficha del candidato</p>
          <h1>{candidate.name}</h1>
        </div>
        <button className="button secondary" onClick={onBack}>← Volver al panel</button>
      </div>

      <div className="detail-head">
        {candidate.photoDataUrl
          ? <img className="detail-photo" src={candidate.photoDataUrl} alt="" />
          : <span className="detail-photo detail-photo--placeholder" aria-hidden="true">{candidate.name[0]?.toUpperCase()}</span>}
        <div className="detail-head-main">
          <h2>{position?.title ?? candidate.roleTarget}</h2>
          <div className="detail-facts">
            <span><b>Carrera</b>{candidate.career ?? "—"}</span>
            <span><b>Experiencia</b>{candidate.yearsExperience != null ? `${candidate.yearsExperience} año(s)` : "—"}</span>
            <span><b>Inglés</b>{candidate.englishLevel ?? "—"}</span>
            <span><b>Match CV</b>{candidate.cvMatch ? `${candidate.cvMatch.score}%` : "—"}</span>
            <span><b>Correo</b>{candidate.email}</span>
            <span><b>Teléfono</b>{candidate.phone ?? "—"}</span>
            <span><b>Estado</b><span className={`status ${candidate.status}`}>{candidate.status}</span></span>
          </div>
        </div>
      </div>

      <div className="report-grid">
        {candidate.hardSkills?.length ? (
          <div className="panel">
            <h2>Hard skills</h2>
            <div className="keyword-cloud">{candidate.hardSkills.map((skill) => <span key={skill}>{skill}</span>)}</div>
          </div>
        ) : null}
        {candidate.cvFile ? (
          <div className="panel">
            <h2>Currículum adjunto</h2>
            <p className="muted-copy">{candidate.cvFile.name} · {Math.round(candidate.cvFile.size / 1024)} KB</p>
            <div className="actions">
              {candidate.cvFile.dataUrl && <button className="button" onClick={openCv}>Ver CV</button>}
              {candidate.cvFile.dataUrl && <a className="button secondary" href={candidate.cvFile.dataUrl} download={candidate.cvFile.name}>Descargar</a>}
            </div>
          </div>
        ) : null}
        {candidate.executiveSummary ? (
          <div className="panel wide"><h2>Resumen ejecutivo</h2><p className="muted-copy">{candidate.executiveSummary}</p></div>
        ) : null}
        {candidate.personalNote ? (
          <div className="panel wide"><h2>Sobre el candidato (fuera de lo laboral)</h2><p className="muted-copy">{candidate.personalNote}</p></div>
        ) : null}
      </div>

      {(candidate.behavioral || candidate.personality) && (
        <>
          <h2 className="profile-section-title">Insights del reclutador</h2>
          <div className="report-grid">
            <div className="panel">
              <h2 className="panel-head">Calidad de los datos <GraphHelp
                title="Calidad / validez de la sesión"
                measures="Señales de que la sesión puede no reflejar el desempeño real: respuestas demasiado rápidas (al azar), juegos incompletos, o encuesta respondida en línea recta (careless responding)."
                theory="El 'careless/insufficient effort responding' es un sesgo conocido en pruebas autoaplicadas; se detecta con varianza intra-sujeto, rachas largas y tiempos de respuesta implausibles. Filtrar estas sesiones protege la validez de todo lo demás (basura entra, basura sale)."
                analysis="Permite decidir si confiar en los scores o repetir la evaluación. Una sesión marcada 'baja' no debe usarse para comparar ni rankear."
                sources={["Meade, A. W., & Craig, S. B. (2012). Identifying careless responses in survey data. Psychological Methods.", "Huang, J. L. et al. (2012). Detecting insufficient effort responding. J. of Business and Psychology."]}
              /></h2>
              <div className={`quality-badge quality-badge--${quality.level}`}>{quality.level === "ok" ? "✓ Datos confiables" : quality.level === "review" ? "Revisar" : "Baja confiabilidad"} · {quality.score}/100</div>
              {quality.flags.length ? (
                <ul className="quality-flags">{quality.flags.map((flag) => <li key={flag.code} className={`flag-${flag.severity}`}>{flag.label}</li>)}</ul>
              ) : <p className="muted-copy">Sin alertas de calidad.</p>}
            </div>

            {percentiles.length > 0 && (
              <div className="panel">
                <h2 className="panel-head">Percentil en el pool <GraphHelp
                  title="Percentil relativo al pool"
                  measures={`Posición del candidato frente a los ${poolComps.length} candidatos completados de este proceso, en cada índice compuesto. NO es un percentil poblacional ni un equivalente de CI.`}
                  theory={`Sin normas poblacionales validadas, el único marco honesto es la comparación relativa al grupo evaluado. La banda de confianza (±${band}) refleja que con pocos candidatos el percentil es inestable.`}
                  analysis="Permite ubicar al candidato dentro del pool ('top de cognición') sin sobreinterpretar. A medida que crece el pool, la banda se estrecha."
                  sources={["AERA, APA, NCME (2014). Standards for Educational and Psychological Testing.", "Crawford & Howell (1998). Comparing an individual's test score against norms derived from small samples."]}
                /></h2>
                <p className="muted-copy">vs. pool de {poolComps.length} candidatos · banda ±{band}</p>
                <div className="score-list">
                  {percentiles.map((row) => (
                    <div className="score-row" key={row.label}>
                      <span>{row.label}</span>
                      <div><i style={{ width: `${row.p}%` }} /></div>
                      <strong>P{row.p}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="panel">
              <h2 className="panel-head">Brecha CV ↔ aptitud <GraphHelp
                title="CV declarado vs. aptitud medida"
                measures="Compara el match del CV con la posición contra la aptitud cognitiva medida en los juegos. Detecta divergencias en ambas direcciones."
                theory="El CV mide experiencia/ajuste declarado; los juegos miden aptitud demostrada. La divergencia es informativa: alta aptitud + CV débil = talento subvalorado; CV fuerte + baja aptitud = verificar en entrevista. No implica que uno sea 'la verdad'."
                analysis="Bandera para la entrevista: indaga las divergencias en vez de descartar. Útil para no perder perfiles fuertes con CV poco pulido."
                sources={["Schmidt & Hunter (1998). The validity and utility of selection methods.", "Ones, Dilchert & Viswesvaran (2012). Cognitive abilities. Handbook of Industrial/Org Psych."]}
              /></h2>
              {gap.gap == null ? <p className="muted-copy">{gap.note}</p> : (
                <>
                  <div className="gap-row"><span><b>{gap.cv}</b>CV</span><span className={`gap-delta ${gap.gap >= 0 ? "pos" : "neg"}`}>{gap.gap >= 0 ? "+" : ""}{gap.gap}</span><span><b>{gap.aptitude}</b>Aptitud</span></div>
                  <p className="muted-copy">{gap.note}</p>
                </>
              )}
            </div>

            <div className="panel">
              <h2 className="panel-head">Fit a la posición <GraphHelp
                title="Ajuste a un perfil objetivo"
                measures={`Distancia del candidato a un perfil ideal definido para la posición (por defecto Cognición 80 · Estrategia 80 · Riesgo 70). 100% = encaje exacto. Es un criterio configurable, no una validación.`}
                theory="Operacionaliza la idea de 'person-job fit': qué tan cerca está el perfil del candidato del perfil deseado para el rol. Es una hipótesis del reclutador a contrastar con resultados reales, no una verdad establecida."
                analysis="Permite priorizar por ajuste al rol en vez de por puntaje bruto, y ajustar el perfil objetivo por posición. Debe validarse con datos de desempeño antes de usarse como filtro duro."
                sources={["Kristof-Brown, A. L. et al. (2005). Consequences of individuals' fit at work. Personnel Psychology.", "Edwards, J. R. (1991). Person-job fit: A conceptual integration."]}
              /></h2>
              {fit == null ? <p className="muted-copy">Faltan datos de juegos.</p> : (
                <>
                  <div className="fit-score">{fit}%</div>
                  <p className="muted-copy">Ajuste al perfil objetivo de <strong>{position?.title ?? "la posición"}</strong>.</p>
                </>
              )}
            </div>
          </div>

          <OutcomePanel candidate={candidate} />

          <div className="detail-report">
            <h2 className="profile-section-title">Resultados de la evaluación</h2>
            <CandidateReport candidate={candidate} />
          </div>
        </>
      )}
      {!candidate.behavioral && !candidate.personality && (
        <div className="analytics-empty" style={{ marginTop: 18 }}>Este candidato aún no ha completado ninguna prueba.</div>
      )}
    </section>
  );
}

function AdminDashboard({ onRefresh }: { onRefresh: () => void }) {
  const db = loadDatabase();
  const [form, setForm] = useState({ name: "", email: "", phone: "", positionId: db.positions[0]?.id ?? "" });
  const [positionForm, setPositionForm] = useState({ title: "", department: "", location: "", jd: "" });
  const [positionAssessments, setPositionAssessments] = useState<string[]>([...ALL_ASSESSMENT_KEYS]);
  const [analyticsCandidateId, setAnalyticsCandidateId] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rankMode, setRankMode] = useState<"both" | "games" | "cv">("both");
  const [gamesWeight, setGamesWeight] = useState(50); // % del peso para juegos en modo "ambos"
  const [showMeasRef, setShowMeasRef] = useState(false);
  const completed = db.candidates.filter((candidate) => candidate.status === "completed");
  const detailCandidate = detailId ? db.candidates.find((candidate) => candidate.id === detailId) ?? null : null;
  const searchMatches = search.trim()
    ? db.candidates.filter((candidate) => candidate.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6)
    : [];
  const personalityPool = completed.filter((candidate) => candidate.personality);
  const bigFiveAverages = bigFiveDomains.map((domain) => ({
    ...domain,
    avg: personalityPool.length
      ? Math.round(personalityPool.reduce((sum, candidate) => sum + (candidate.personality!.domains[domain.key] ?? 0), 0) / personalityPool.length)
      : 0,
  }));
  const analyticsCandidates = useMemo(() => completed.map((candidate) => ({
    candidate,
    analysis: buildCandidateProfileFromEvents(candidate.events ?? []),
  })), [completed]);
  const selectedAnalytics = analyticsCandidates.find((item) => item.candidate.id === analyticsCandidateId) ?? analyticsCandidates[0];
  const averages = useMemo(() => {
    const scores = completed.map((candidate) => candidate.behavioral).filter(Boolean);
    return {
      adaptability: avg(scores.map((score) => score!.adaptability)),
      prioritization: avg(scores.map((score) => score!.prioritization)),
      executiveControl: avg(scores.map((score) => score!.executiveControl)),
      calculatedRisk: avg(scores.map((score) => score!.calculatedRisk)),
      sustainedAttention: avgDefined(scores.map((score) => score!.sustainedAttention)),
      workingMemory: avgDefined(scores.map((score) => score!.workingMemory)),
      fluidReasoning: avgDefined(scores.map((score) => score!.fluidReasoning)),
    };
  }, [completed]);

  const ranked = useMemo(() => {
    const wGames = gamesWeight / 100;
    return completed.map((candidate) => {
      const comp = computeComposite(candidate);
      const gameScore = comp ? Math.round((comp.cognition + comp.strategy + comp.riskCalibrated) / 3) : null;
      const cvScore = candidate.cvMatch?.score ?? null;
      const both = gameScore != null && cvScore != null
        ? Math.round(gameScore * wGames + cvScore * (1 - wGames))
        : (gameScore ?? cvScore ?? 0);
      const score = rankMode === "games" ? (gameScore ?? 0) : rankMode === "cv" ? (cvScore ?? 0) : both;
      return { candidate, gameScore, cvScore, score };
    }).sort((a, b) => b.score - a.score);
  }, [completed, rankMode, gamesWeight]);

  if (detailCandidate) {
    return <AdminCandidateDetail candidate={detailCandidate} positions={db.positions} pool={completed} onBack={() => setDetailId(null)} />;
  }

  function addCandidate() {
    const position = db.positions.find((item) => item.id === form.positionId);
    if (!form.name || !form.email || !position) return;
    createCandidate({ ...form, roleTarget: position.title });
    setForm({ name: "", email: "", phone: "", positionId: db.positions[0]?.id ?? "" });
    onRefresh();
  }

  function addPosition() {
    if (!positionForm.title || !positionForm.jd) return;
    if (positionAssessments.length === 0) return; // al menos una prueba
    createPosition({ ...positionForm, enabledAssessments: positionAssessments });
    setPositionForm({ title: "", department: "", location: "", jd: "" });
    setPositionAssessments([...ALL_ASSESSMENT_KEYS]);
    onRefresh();
  }

  return (
    <section className="workbench">
      {showMeasRef && <MeasurementReference onClose={() => setShowMeasRef(false)} />}
      <div className="section-head">
        <div>
          <p className="eyebrow">Administrador</p>
          <h1>Resultados y base de candidatos.</h1>
        </div>
        <div className="actions">
          <div className="admin-search">
            <input type="search" aria-label="Buscar candidato por nombre" placeholder="🔍 Buscar candidato por nombre…" value={search} onChange={(event) => setSearch(event.target.value)} />
            {searchMatches.length > 0 && (
              <div className="admin-search-results">
                {searchMatches.map((candidate) => (
                  <button key={candidate.id} onClick={() => { setDetailId(candidate.id); setSearch(""); }}>
                    <strong>{candidate.name}</strong>
                    <span>{candidate.roleTarget} · {candidate.status}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="button secondary" onClick={() => setShowMeasRef(true)} title="Qué mide cada prueba, con su sustento">Ficha de medición</button>
          <button className="button secondary" onClick={() => downloadFile("psychometric-quest-export.csv", exportCsv(), "text/csv")}>Exportar CSV</button>
          <button className="button secondary" onClick={() => downloadFile("dataset-validacion.csv", buildValidationCsv(db.candidates, db.positions), "text/csv")} title="Predictores + outcome, una fila por candidato, listo para análisis de validez">Dataset validación</button>
          <button className="button" onClick={() => downloadFile("psychometric-quest-export.json", exportJson(), "application/json")}>Exportar JSON</button>
        </div>
      </div>
      <div className="admin-grid">
        <Metric value={String(db.candidates.length)} label="registrados" />
        <Metric value={String(db.candidates.filter((candidate) => candidate.status === "started").length)} label="iniciados" />
        <Metric value={String(completed.length)} label="completados" />
        <Metric value={`${Math.round((completed.length / Math.max(db.candidates.length, 1)) * 100)}%`} label="conversión" />
      </div>
      {(() => {
        const withPerf = db.candidates.filter((c) => c.outcome?.decision === "hired" && typeof c.outcome.performanceRating === "number").length;
        const hired = db.candidates.filter((c) => c.outcome?.decision === "hired").length;
        const ready = withPerf >= 30;
        return (
          <div className={`validation-banner ${ready ? "is-ready" : ""}`}>
            <div>
              <strong>Validez de criterio: {withPerf} resultado(s) de desempeño registrado(s)</strong>
              <span>{ready
                ? "Hay volumen suficiente para estimar la correlación predictores ↔ desempeño."
                : `Se necesitan ~30+ contrataciones con desempeño para un análisis significativo (${hired} contratado(s) hasta ahora). Registra el seguimiento en la ficha de cada candidato.`}</span>
            </div>
            <div className="validation-bar"><i style={{ width: `${Math.min(100, (withPerf / 30) * 100)}%` }} /></div>
          </div>
        );
      })()}
      <div className="dashboard-grid">
        <div className="panel wide">
          <h2>Nueva posición</h2>
          <div className="position-form">
            <input aria-label="Título de posición" placeholder="Título de posición" value={positionForm.title} onChange={(event) => setPositionForm({ ...positionForm, title: event.target.value })} />
            <input aria-label="Área" placeholder="Área" value={positionForm.department} onChange={(event) => setPositionForm({ ...positionForm, department: event.target.value })} />
            <input aria-label="Ubicación" placeholder="Ubicación" value={positionForm.location} onChange={(event) => setPositionForm({ ...positionForm, location: event.target.value })} />
            <textarea aria-label="Job Description" placeholder="Job Description / responsabilidades / requisitos / habilidades clave" value={positionForm.jd} onChange={(event) => setPositionForm({ ...positionForm, jd: event.target.value })} />
            <div className="assessment-checklist">
              <span className="checklist-label">Pruebas de esta posición {positionAssessments.length === 0 && <em className="error-inline">elige al menos una</em>}</span>
              <div className="checklist-grid">
                {assessmentCatalog.map((meta) => {
                  const on = positionAssessments.includes(meta.key);
                  return (
                    <label key={meta.key} className={`check-chip ${on ? "is-on" : ""}`}>
                      <input type="checkbox" checked={on} onChange={(event) => {
                        setPositionAssessments((items) => event.target.checked ? [...items, meta.key] : items.filter((k) => k !== meta.key));
                      }} />
                      {meta.name}
                    </label>
                  );
                })}
              </div>
            </div>
            <button className="button" onClick={addPosition} disabled={positionAssessments.length === 0}>Crear posición</button>
          </div>
        </div>
        <div className="panel">
          <h2>Nuevo candidato</h2>
          <div className="form-grid">
            <input aria-label="Nombre del candidato" placeholder="Nombre" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <input aria-label="Email del candidato" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            <input aria-label="Teléfono del candidato" placeholder="Teléfono" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            <select aria-label="Posición del candidato" value={form.positionId} onChange={(event) => setForm({ ...form, positionId: event.target.value })}>
              {db.positions.filter((position) => position.status === "open").map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}
            </select>
            <button className="button" onClick={addCandidate}>Crear invitación</button>
          </div>
        </div>
        <div className="panel">
          <h2>Posiciones abiertas</h2>
          <div className="position-list">
            {db.positions.map((position) => (
              <div key={position.id}>
                <strong>{position.title}</strong>
                <span>{position.department || "Sin área"} · {position.location || "Sin ubicación"}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2 className="panel-head">Promedios conductuales <GraphHelp
            title="Dimensiones conductuales"
            measures="Promedio del pool en cada dimensión, derivada de un paradigma cognitivo clásico: Adaptabilidad/Control ejecutivo (cambio de tarea), Priorización (juicio de triaje), Riesgo calculado (tarea de riesgo), Atención sostenida (vigilancia/CPT), Memoria de trabajo (n-back) y Razonamiento fluido (matrices de Raven)."
            theory="Cada juego operacionaliza un constructo validado: el cambio de regla mide flexibilidad cognitiva (Monsell, 2003); el n-back, memoria de trabajo (Kirchner, 1958); la vigilancia con detección de señales usa d′ (Green & Swets, 1966); las matrices progresivas miden inteligencia fluida (Raven, 1938; Cattell, 1963); y la toma de riesgo se basa en tareas tipo BART (Lejuez et al., 2002)."
            analysis="Permite comparar a un candidato contra el promedio del pool, detectar fortalezas/brechas por dimensión y construir un perfil de aptitudes en vez de un único número."
            sources={["Monsell, S. (2003). Task switching. Trends in Cognitive Sciences, 7(3).", "Kirchner, W. K. (1958). Age differences in short-term retention. J. Exp. Psychology.", "Lejuez, C. W. et al. (2002). The Balloon Analogue Risk Task (BART). J. Exp. Psych: Applied.", "Raven, J. C. (1938). Progressive Matrices."]}
          /></h2>
          <Bar label="Adaptabilidad" value={averages.adaptability} />
          <Bar label="Priorización" value={averages.prioritization} />
          <Bar label="Control ejecutivo" value={averages.executiveControl} />
          <Bar label="Riesgo calculado" value={averages.calculatedRisk} />
          <Bar label="Atención sostenida" value={averages.sustainedAttention} />
          <Bar label="Memoria de trabajo" value={averages.workingMemory} />
          <Bar label="Razonamiento fluido" value={averages.fluidReasoning} />
        </div>
        <div className="panel wide">
          <div className="analytics-admin-head">
            <div>
              <h2 className="panel-head">Ranking de candidatos <GraphHelp
                title="Ranking multi-criterio"
                measures="Ordena a los candidatos de mejor a peor combinando el desempeño en los juegos (promedio de los 3 índices compuestos) y el match del CV con la posición. 'Ambos' pondera 50/50 por defecto."
                theory="La validez predictiva de la habilidad cognitiva general (GMA) sobre el desempeño laboral es de las más altas conocidas (r≈0.51), y combinarla con otras señales (experiencia/ajuste del CV) incrementa la validez incremental. Por eso el criterio 'Ambos' suele ser el más robusto para decisiones de selección."
                analysis="Permite priorizar shortlists, comparar candidatos bajo un criterio explícito y auditar cómo cambia el orden si pesas más los juegos o el CV. Útil para detectar candidatos fuertes en cognición pero con CV poco alineado (o viceversa)."
                sources={["Schmidt, F. L., & Hunter, J. E. (1998). The validity and utility of selection methods. Psychological Bulletin, 124(2).", "Cortina, J. M. (2000). Incremental validity. Journal of Applied Psychology."]}
              /></h2>
              <p className="muted-copy">Del mejor al peor según el criterio elegido. Haz clic en un candidato para ver su ficha.</p>
            </div>
            <div className="rank-controls">
              <div className="rank-toggle" role="group" aria-label="Criterio de ranking">
                {([["both", "Ambos"], ["games", "Juegos"], ["cv", "CV"]] as const).map(([mode, label]) => (
                  <button key={mode} className={rankMode === mode ? "is-active" : ""} onClick={() => setRankMode(mode)}>{label}</button>
                ))}
              </div>
              {rankMode === "both" && (
                <div className="rank-weight">
                  <div className="rank-weight-labels">
                    <span>Juegos <b>{gamesWeight}%</b></span>
                    <span>CV <b>{100 - gamesWeight}%</b></span>
                  </div>
                  <input type="range" min="0" max="100" step="5" value={gamesWeight} onChange={(event) => setGamesWeight(Number(event.target.value))} aria-label="Peso de juegos vs CV" />
                  <div className="rank-weight-presets">
                    <button onClick={() => setGamesWeight(70)}>70/30</button>
                    <button onClick={() => setGamesWeight(50)}>50/50</button>
                    <button onClick={() => setGamesWeight(30)}>30/70</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          {ranked.length === 0 ? (
            <div className="analytics-empty">Aún no hay candidatos completados para rankear.</div>
          ) : (
            <ol className="rank-list">
              {ranked.map((row, index) => (
                <li
                  key={row.candidate.id}
                  className="rank-row"
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir ficha de ${row.candidate.name}`}
                  onClick={() => setDetailId(row.candidate.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setDetailId(row.candidate.id);
                    }
                  }}
                >
                  <span className={`rank-pos ${index < 3 ? `rank-pos--${index + 1}` : ""}`}>{index + 1}</span>
                  <div className="rank-name">
                    <strong>{row.candidate.name}</strong>
                    <span>{row.candidate.roleTarget}{row.candidate.personality ? ` · ${dominantDomain(row.candidate.personality.domains)}` : ""}</span>
                  </div>
                  <div className="rank-sub">
                    <span><b>Juegos</b>{row.gameScore ?? "—"}</span>
                    <span><b>CV</b>{row.cvScore ?? "—"}</span>
                  </div>
                  <div className="rank-score">
                    <div className="rank-bar"><i style={{ width: `${row.score}%` }} /></div>
                    <strong>{row.score}</strong>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="panel wide">
          <h2 className="panel-head">Mapa 3D de candidatos <GraphHelp
            title="Espacio cognitivo 3D (reducción a 3 índices)"
            measures="Cada candidato es un punto en un espacio de 3 ejes compuestos: Cognición (control ejecutivo, atención, memoria, razonamiento), Estrategia (priorización, adaptabilidad, calidad de decisión) y Riesgo calibrado (riesgo en banda óptima + resiliencia). El cubo teal marca la 'zona ideal' (los 3 ≥ 65)."
            theory="Es una reducción de dimensionalidad interpretable (proyección fija, no PCA) inspirada en la teoría CHC de habilidades cognitivas, que agrupa decenas de aptitudes en factores de orden superior. Mantener ejes con nombre fijo (en vez de componentes estadísticos) permite leer el espacio y comparar de forma estable entre candidatos y sesiones."
            analysis="Permite ver clusters, outliers y cercanía a un perfil objetivo de un vistazo; comparar candidatos en 3 dimensiones simultáneas; e identificar quién entra en la zona ideal. Rotar/zoom ayuda a separar puntos ocluidos."
            sources={["Carroll, J. B. (1993). Human Cognitive Abilities: A survey of factor-analytic studies.", "McGrew, K. S. (2009). CHC theory and the human cognitive abilities project. Intelligence."]}
          /></h2>
          <p className="muted-copy">Haz clic en cualquier punto para abrir el reporte completo del candidato.</p>
          <CandidateScatter3D candidates={completed} onOpenCandidate={(id) => setDetailId(id)} />
        </div>
        <div className="panel wide">
          <div className="analytics-admin-head">
            <div>
              <h2 className="panel-head">Análisis psicométrico <GraphHelp
                title="Métricas finas de los juegos"
                measures="Indicadores derivados de los eventos crudos: curva de capital y perfil de decisión (Route Risk), reacción tras el fallo y resiliencia, atención por fase y decaimiento (Signal Surge), d′ (sensibilidad), distribución de tiempos de reacción y consistencia (CV de TR)."
                theory="Se apoya en la Teoría de Detección de Señales (d′ separa sensibilidad de sesgo de respuesta; Green & Swets, 1966), en modelos de toma de decisiones bajo riesgo y aprendizaje tras pérdidas, y en la literatura de vigilancia/decremento atencional (Mackworth, 1948). La variabilidad del TR es un marcador de control atencional."
                analysis="Permite distinguir, p. ej., un candidato con alta precisión pero lento de otro rápido pero impulsivo (muchas falsas alarmas), o ver si sostiene la atención bajo fatiga. Da matices que un único score promedio oculta."
                sources={["Green, D. M., & Swets, J. A. (1966). Signal Detection Theory and Psychophysics.", "Mackworth, N. H. (1948). The breakdown of vigilance during prolonged visual search."]}
              /></h2>
              <p className="muted-copy">Selecciona un candidato para ver métricas derivadas de los juegos.</p>
            </div>
            <select
              value={selectedAnalytics?.candidate.id ?? ""}
              onChange={(event) => setAnalyticsCandidateId(event.target.value)}
            >
              {analyticsCandidates.map(({ candidate }) => (
                <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
              ))}
            </select>
          </div>
          {selectedAnalytics?.analysis ? (
            <PsychometricDashboard
              profile={selectedAnalytics.analysis.profile}
              frogChoices={selectedAnalytics.analysis.frogChoices}
              audience="admin"
            />
          ) : (
            <div className="analytics-empty">Este candidato no tiene eventos crudos suficientes de FrogRiskRun o SignalSurge.</div>
          )}
        </div>
        <div className="panel wide">
          <h2 className="panel-head">Correlación entre dimensiones <GraphHelp
            title="Estructura: correlaciones entre dimensiones"
            measures="Correlación de Pearson entre cada par de dimensiones conductuales a través del pool de candidatos. Teal = covarían juntas; rojo = inversamente; gris = sin relación clara."
            theory="Es un análisis EXPLORATORIO de validez de constructo: dimensiones que deberían relacionarse (p. ej. memoria de trabajo y razonamiento fluido) suelen correlacionar; correlaciones muy altas entre 'dimensiones distintas' sugieren redundancia. Con N pequeño las correlaciones son muy inestables y NO deben interpretarse como definitivas."
            analysis="Permite revisar si los juegos miden cosas distintas o se solapan, y depurar el modelo a futuro. Requiere ~100+ candidatos para ser confiable; aquí es solo orientativo."
            sources={["Cronbach, L. J., & Meehl, P. E. (1955). Construct validity in psychological tests.", "Schönbrodt & Perugini (2013). At what sample size do correlations stabilize?"]}
          /></h2>
          <CorrelationHeatmap data={correlationMatrix(completed)} />
        </div>
        <div className="panel wide">
          <h2 className="panel-head">Personalidad del pool (Big Five) <GraphHelp
            title="Promedios Big Five del pool"
            measures="Puntuación media del pool en cada uno de los cinco dominios de personalidad (0–100), medidos con el banco IPIP-50."
            theory="El modelo de los Cinco Grandes (Big Five) es el marco de personalidad con mayor respaldo empírico. La personalidad describe estilo y preferencias, no aptitud; no debe tratarse como 'mejor/peor' ni como predictor único de desempeño."
            analysis="Permite ver el perfil de estilo agregado del pool y compararlo con el de un candidato. Léase junto con las medidas cognitivas, que son constructos distintos."
            sources={["Goldberg, L. R. (1992). The development of markers for the Big-Five factor structure.", "International Personality Item Pool, ipip.ori.org (dominio público)."]}
          /></h2>
          <p className="muted-copy">Promedio del pool ({personalityPool.length} con personalidad). Estilo, no aptitud.</p>
          <div className="domain-bars">
            {bigFiveAverages.map((item) => <Bar key={item.key} label={item.name} value={item.avg} />)}
          </div>
        </div>
      </div>
      <div className="panel">
        <h2>Candidatos</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Email</th>
                <th scope="col">Teléfono</th>
                <th scope="col">Rol</th>
                <th scope="col">Posición</th>
                <th scope="col">Match CV</th>
                <th scope="col">Código</th>
                <th scope="col">Auth</th>
                <th scope="col">CV</th>
                <th scope="col">Estado</th>
                <th scope="col">Calidad</th>
                <th scope="col">Outcome</th>
                <th scope="col">Personalidad</th>
                <th scope="col">Conductual</th>
                <th scope="col">Accesos</th>
                <th scope="col">Última sesión</th>
              </tr>
            </thead>
            <tbody>
              {db.candidates.map((item) => (
                <tr
                  key={item.id}
                  className="candidate-row"
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir ficha de ${item.name}`}
                  onClick={() => setDetailId(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setDetailId(item.id);
                    }
                  }}
                >
                  <td>{item.name}</td>
                  <td>{item.email}</td>
                  <td>{item.phone ?? "-"}</td>
                  <td>{item.roleTarget}</td>
                  <td>{db.positions.find((position) => position.id === item.positionId)?.title ?? "-"}</td>
                  <td>{item.cvMatch ? `${item.cvMatch.score}%` : "-"}</td>
                  <td><code>{item.invitationCode}</code></td>
                  <td>{item.authProvider ?? "invitation"}</td>
                  <td>{item.cvFile?.name ?? "-"}</td>
                  <td><span className={`status ${item.status}`}>{item.status}</span></td>
                  <td>{item.status === "completed" ? <QualityChip quality={dataQuality(item)} /> : "-"}</td>
                  <td>{item.outcome?.decision
                    ? <span className={`outcome-chip outcome-chip--${item.outcome.decision}`}>{DECISION_LABELS[item.outcome.decision]}{item.outcome.performanceRating ? ` · ${item.outcome.performanceRating}★` : ""}</span>
                    : "-"}</td>
                  <td>{item.personality ? dominantDomain(item.personality.domains) : "-"}</td>
                  <td>{item.behavioral?.profile ?? "-"}</td>
                  <td>{item.loginCount ?? 0}</td>
                  <td>{item.lastSeenAt ? new Date(item.lastSeenAt).toLocaleDateString("es-PE") : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function dominantDomain(domains: Record<BigFiveDomainKey, number>): string {
  const top = bigFiveDomains.reduce((best, domain) => (domains[domain.key] > domains[best.key] ? domain : best), bigFiveDomains[0]);
  return `${top.shortName} ${domains[top.key]}`;
}

// C1 — escape all user-supplied values before interpolating into HTML strings
function escHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pdfBars(rows: Array<[string, number, string?]>) {
  return rows.map(([label, value, color]) => {
    // label comes from bigFiveDomains (static) or static strings — still escape for safety.
    // value is always a number; color comes from static domain definitions.
    const safeLabel = escHtml(label);
    const safeValue = Number(value); // numeric — no interpolation risk
    const safeColor = color ? escHtml(color) : "";
    return `<div class="row"><span>${safeLabel}</span><div class="bar"><i style="width:${safeValue}%${safeColor ? `;background:${safeColor}` : ""}"></i></div><strong>${safeValue}</strong></div>`;
  }).join("");
}

function candidateReportHtml(candidate: Candidate) {
  const p = candidate.personality;
  const b = candidate.behavioral;
  const bfRows: Array<[string, number, string?]> = p ? bigFiveDomains.map((domain) => [domain.name, p.domains[domain.key], domain.color]) : [];
  const bhRows: Array<[string, number, string?]> = b ? [
    ["Adaptabilidad", b.adaptability],
    ["Priorización", b.prioritization],
    ["Control ejecutivo", b.executiveControl],
    ["Riesgo calculado", b.calculatedRisk],
    ...(typeof b.sustainedAttention === "number" ? [["Atención sostenida", b.sustainedAttention] as [string, number]] : []),
    ...(typeof b.workingMemory === "number" ? [["Memoria de trabajo", b.workingMemory] as [string, number]] : []),
    ...(typeof b.fluidReasoning === "number" ? [["Razonamiento fluido", b.fluidReasoning] as [string, number]] : []),
  ] : [];
  // C1 — candidate.name is user-supplied; escape before interpolation
  const safeName = escHtml(candidate.name);
  return `<!doctype html><html><head><title>Reporte ${safeName}</title><style>
    body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;color:#17201c;background:#f7f8f4}
    .page{max-width:760px;margin:0 auto;padding:44px}
    h1{font-size:40px;line-height:1;margin:0 0 6px}.tag{color:#2a7a75;font-weight:800;text-transform:uppercase;font-size:12px}
    h2{margin-top:30px;font-size:20px}
    .row{display:grid;grid-template-columns:200px 1fr 40px;gap:12px;align-items:center;margin:8px 0;font-size:14px}
    .bar{height:9px;border-radius:99px;background:#e4e9e4;overflow:hidden}.bar i{display:block;height:100%;background:#2a7a75}
    .note{margin-top:28px;padding:14px;border:1px solid #d8b46a;background:#fff6dd;border-radius:12px;font-size:13px}
    @media print{button{display:none}.page{padding:28px}}
  </style></head><body><main class="page">
    <p class="tag">Reporte · ${escHtml(APP_NAME)}</p>
    <h1>${safeName}</h1>
    <p>${new Date().toLocaleDateString("es-PE")}</p>
    ${p ? `<h2>Perfil de personalidad (Big Five)</h2><p style="font-size:13px;color:#5a6b63">Estilo personal — no hay valores buenos o malos.</p>${pdfBars(bfRows)}` : ""}
    ${b ? `<h2>Desempeño conductual</h2>${pdfBars(bhRows)}` : ""}
    <p class="note">Resultado orientativo. No es diagnóstico psicológico ni debe usarse como decisión única de selección.</p>
  </main></body></html>`;
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div className="metric"><b>{value}</b><span>{label}</span></div>;
}

function GraphHelp({ title, measures, theory, analysis, sources }: { title: string; measures: string; theory: string; analysis: string; sources: string[] }) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useMemo(() => `gh-title-${Math.random().toString(36).slice(2, 9)}`, []);

  useEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    if (!card) return;
    const focusables = () =>
      Array.from(card.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(
        (el) => !el.hasAttribute("disabled")
      );
    // Mueve el foco al primer elemento accionable del modal al abrir.
    focusables()[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Restaura el foco al disparador al cerrar.
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <span className="graph-help">
      <button ref={triggerRef} className="graph-help-btn" onClick={() => setOpen(true)} aria-label={`Sustento teórico de ${title}`} title="Sustento teórico">?</button>
      {open && (
        <div className="graph-help-overlay" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className="graph-help-card" ref={cardRef} onClick={(event) => event.stopPropagation()}>
            <button className="graph-help-close" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
            <p className="eyebrow">Sustento teórico</p>
            <h3 id={titleId}>{title}</h3>
            <h4>Qué mide</h4>
            <p>{measures}</p>
            <h4>Fundamento</h4>
            <p>{theory}</p>
            <h4>Qué análisis permite</h4>
            <p>{analysis}</p>
            <h4>Fuentes</h4>
            <ul className="graph-help-sources">{sources.map((source) => <li key={source}>{source}</li>)}</ul>
          </div>
        </div>
      )}
    </span>
  );
}

// B3 — PanelHead removed: defined but never used in JSX.

function QualityChip({ quality }: { quality: DataQuality }) {
  const label = quality.level === "ok" ? "Confiable" : quality.level === "review" ? "Revisar" : "Baja";
  return <span className={`quality-chip quality-chip--${quality.level}`} title={quality.flags.map((f) => f.label).join(" · ") || "Sin alertas"}>{label}</span>;
}

const DECISION_LABELS: Record<HiringDecision, string> = { hired: "Contratado", rejected: "Rechazado", pending: "Pendiente" };

function OutcomePanel({ candidate }: { candidate: Candidate }) {
  const [decision, setDecision] = useState<HiringDecision>(candidate.outcome?.decision ?? "pending");
  const [rating, setRating] = useState<number>(candidate.outcome?.performanceRating ?? 0);
  const [perfAt, setPerfAt] = useState<string>(candidate.outcome?.performanceAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState<string>(candidate.outcome?.note ?? "");
  const [saved, setSaved] = useState(false);

  function save() {
    const outcome: CandidateOutcome = {
      decision,
      performanceRating: decision === "hired" && rating > 0 ? rating : undefined,
      performanceAt: decision === "hired" && rating > 0 ? new Date(perfAt).toISOString() : undefined,
      note: note.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    upsertCandidate({ ...candidate, outcome });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="panel wide outcome-panel">
      <h2 className="panel-head">Seguimiento del candidato (outcome) <GraphHelp
        title="Captura de criterio para validación"
        measures="Registra la decisión de contratación y el desempeño real posterior (3–6 meses). Es el 'criterio' que hoy falta para poder afirmar que la evaluación predice algo."
        theory="Un test solo tiene validez de criterio cuando sus puntajes correlacionan con un resultado externo (desempeño laboral). Sin recolectar ese resultado, cualquier afirmación predictiva es infundada. Por eso esto se captura ahora y la correlación se calcula recién con N suficiente."
        analysis="Acumulado en el tiempo, permite correlacionar predictores (juegos, CV) con desempeño y estimar validez/utilidad real de la herramienta, además de detectar adverse impact."
        sources={["AERA, APA, NCME (2014). Standards for Educational and Psychological Testing.", "Schmidt, F. L., & Hunter, J. E. (1998). The validity and utility of selection methods. Psychological Bulletin."]}
      /></h2>
      <p className="muted-copy">Esto no afecta el reporte del candidato; alimenta el futuro estudio de validez.</p>

      <div className="outcome-grid">
        <div className="outcome-field">
          <label>Decisión</label>
          <div className="rank-toggle">
            {(["hired", "rejected", "pending"] as HiringDecision[]).map((value) => (
              <button key={value} className={decision === value ? "is-active" : ""} onClick={() => setDecision(value)}>{DECISION_LABELS[value]}</button>
            ))}
          </div>
        </div>
        <div className="outcome-field">
          <label>Desempeño a 3–6 meses {decision !== "hired" && <em>(solo si fue contratado)</em>}</label>
          <div className="rating-row">
            {[1, 2, 3, 4, 5].map((value) => (
              <button key={value} disabled={decision !== "hired"} className={`rating-star ${rating >= value ? "on" : ""}`} onClick={() => setRating(value)} aria-label={`${value} de 5`}>★</button>
            ))}
            {decision === "hired" && rating > 0 && (
              <input type="date" className="perf-date" value={perfAt} onChange={(event) => setPerfAt(event.target.value)} />
            )}
          </div>
        </div>
      </div>
      <label className="outcome-note">
        Nota (opcional)
        <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Contexto de la decisión o del desempeño observado." />
      </label>
      <div className="actions">
        <button className="button" onClick={save}>{saved ? "✓ Guardado" : "Guardar seguimiento"}</button>
        {candidate.outcome?.updatedAt && <span className="muted-copy">Última actualización: {new Date(candidate.outcome.updatedAt).toLocaleDateString("es-PE")}</span>}
      </div>
    </div>
  );
}

function CorrelationHeatmap({ data }: { data: ReturnType<typeof correlationMatrix> }) {
  function cellStyle(value: number | null): CSSProperties {
    if (value == null) return { background: "var(--surface-2)", color: "var(--muted)" };
    const a = Math.min(Math.abs(value), 1);
    const color = value >= 0 ? "78,205,196" : "224,92,92";
    return { background: `rgba(${color},${0.12 + a * 0.6})`, color: a > 0.55 ? "#0e1318" : "var(--ink)" };
  }
  if (data.n < 3) return <div className="analytics-empty">Se necesitan al menos 3 candidatos completados para estimar correlaciones.</div>;
  return (
    <>
      {!data.reliable && (
        <div className="corr-warning">⚠ Exploratorio: con N={data.n} las correlaciones son inestables. Interpretar solo como tendencia, no como conclusión (idealmente N ≥ 100).</div>
      )}
      <div className="corr-grid" style={{ gridTemplateColumns: `90px repeat(${data.labels.length}, 1fr)` }}>
        <span className="corr-corner" />
        {data.labels.map((label) => <span key={`h-${label}`} className="corr-head">{label}</span>)}
        {data.labels.map((rowLabel, r) => (
          <Fragment key={`r-${rowLabel}`}>
            <span className="corr-rowhead">{rowLabel}</span>
            {data.matrix[r].map((value, c) => (
              <span key={`c-${r}-${c}`} className="corr-cell" style={cellStyle(value)}>{value == null ? "—" : value.toFixed(2)}</span>
            ))}
          </Fragment>
        ))}
      </div>
    </>
  );
}

function Progress({ value }: { value: number }) {
  return <div className="progress"><span>{value}%</span><div><i style={{ width: `${value}%` }} /></div></div>;
}

// B4 — Info and ReportBlock removed: defined but never used in JSX.

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return <div className="panel"><h2>{title}</h2><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}

function Bar({ label, value }: { label: string; value: number }) {
  return <div className="bar-row"><span>{label}</span><div><i style={{ width: `${value}%` }} /></div><b>{value}</b></div>;
}

function avg(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function avgDefined(values: Array<number | undefined>) {
  return avg(values.filter((value): value is number => typeof value === "number"));
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function digestPassword(email: string, password: string) {
  const payload = new TextEncoder().encode(`${email.trim().toLowerCase()}::${password}`);
  const hash = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function candidateFromSupabaseUser(user: {
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}) {
  const metadata = user.user_metadata ?? {};
  const providerRaw = String(user.app_metadata?.provider ?? metadata.provider ?? "email");
  const provider = providerRaw === "azure" ? "outlook" : providerRaw === "linkedin_oidc" ? "linkedin" : providerRaw;
  return createCandidateAccount({
    name: String(metadata.full_name ?? metadata.name ?? user.email ?? "Candidato"),
    email: String(user.email ?? metadata.email ?? ""),
    phone: metadata.phone ? String(metadata.phone) : undefined,
    provider: provider === "google" || provider === "outlook" || provider === "linkedin" || provider === "github" ? provider : "email",
    roleTarget: "Proceso abierto",
  });
}
