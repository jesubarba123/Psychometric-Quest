import type { ReactNode } from "react";
import type { CandidateProfile, RiskChoiceId } from "../../psychometrics/types";
import { CapitalCurveChart } from "./CapitalCurveChart";
import { DecayCurveChart } from "./DecayCurveChart";
import { PostFailureArrowChart } from "./PostFailureArrowChart";
import { RadarProfileChart } from "./RadarProfileChart";
import { RiskHeatmapChart } from "./RiskHeatmapChart";
import { RtDistributionChart } from "./RtDistributionChart";
import { SEMANTIC } from "../../utils/palette";
import { ScoreBand } from "../ScoreBand";
import "./PsychometricDashboard.css";

// C4 — Métricas del radar con escala 0–100 que usan ScoreBand con banda de incertidumbre.
// Las demás (riskAppetite, lossResilience, dPrime, medianRt, cvRt) NO usan ScoreBand:
// no son puntajes psicométricos 0–100 comparables (spec §7, "No cambiar").
const RADAR_SCORE_KEYS: ReadonlySet<keyof CandidateProfile["radarDimensions"]> = new Set([
  "sustainedAttention",
  "processingSpeed",
  "cognitiveConsistency",
]);

type Props = {
  profile: CandidateProfile;
  frogChoices: Array<{ choice: RiskChoiceId }>;
  audience: "candidate" | "admin";
};

const DIMENSION_LABELS: Record<keyof CandidateProfile["radarDimensions"], string> = {
  sustainedAttention: "Atención",
  processingSpeed: "Velocidad",
  cognitiveConsistency: "Consistencia",
  riskAppetite: "Riesgo",
  lossResilience: "Resiliencia",
};

export function PsychometricDashboard({ profile, frogChoices, audience }: Props) {
  const { frog, signal } = profile;

  return (
    <div className="psychometric-dashboard">
      <div className="analytics-header">
        <div>
          <p className="eyebrow">Análisis psicométrico</p>
          <h2>{audience === "candidate" ? "Lectura individual de tus juegos" : "Lectura individual del candidato"}</h2>
        </div>
        <p>
          {audience === "candidate"
            ? "Estos indicadores se calculan solo desde tus eventos de juego y no te comparan con otros candidatos."
            : "Métricas derivadas desde eventos crudos de FrogRiskRun y SignalSurge; no se persisten como nuevos campos."}
        </p>
      </div>

      <ChartCard title="Perfil psicométrico">
        <RadarProfileChart profile={profile} />
        {/* C4 — Métricas 0-100 (sustainedAttention, processingSpeed, cognitiveConsistency)
            usan ScoreBand con banda de incertidumbre.
            El resto (riskAppetite, lossResilience) sigue como MetricCard (spec §7). */}
        <div className="analytics-metric-grid five">
          {(Object.entries(profile.radarDimensions) as [keyof CandidateProfile["radarDimensions"], number | null][]).map(([key, value]) => {
            const label = DIMENSION_LABELS[key];
            if (RADAR_SCORE_KEYS.has(key)) {
              // Métricas 0–100: ScoreBand con banda de incertidumbre.
              // Se envuelve en analytics-metric para mantener el marco visual,
              // pero el label lo gestiona ScoreBand (primera columna del grid).
              return (
                <div key={key} className="analytics-metric">
                  <ScoreBand label={label} value={value} />
                </div>
              );
            }
            // Métricas con unidades propias: MetricCard sin modificar
            return (
              <MetricCard
                key={key}
                label={label}
                // CRIT-1: processingSpeed/cognitiveConsistency pueden ser null (sin hits)
                value={value !== null ? value : "—"}
                color={value !== null ? scoreColor(value) : undefined}
              />
            );
          })}
        </div>
      </ChartCard>

      {!frog && !signal && (
        <div className="analytics-empty">Este candidato aún no tiene eventos suficientes para el análisis psicométrico.</div>
      )}

      {frog && (
        <>
          <ChartCard title="Evolución del capital - Frog Risk Run">
            <CapitalCurveChart metrics={frog} choices={frogChoices} />
            <div className="analytics-metric-grid three">
              <MetricCard label="Score final" value={signed(frog.finalScore)} />
              <MetricCard label="Perfil" value={decisionProfileLabel(frog.decisionProfile)} color={profileColor(frog.decisionProfile)} />
              <MetricCard label="Score ajustado" value={frog.riskAdjustedScore.toFixed(1)} />
            </div>
          </ChartCard>

          <ChartCard title="Reacción al fallo - cambio de estrategia">
            <PostFailureArrowChart metrics={frog} />
            <div className="analytics-metric-grid two">
              <MetricCard label="Tras un fallo" value={failureLabel(frog.riskAfterFailure)} color={failureColor(frog.riskAfterFailure)} />
              {/* B5 — suppress lossResilience when no failure occurred (value is meaningless 50) */}
              <MetricCard label="Resiliencia" value={frog.hasFailures ? `${frog.lossResilience}/100` : "Sin fallos"} color={frog.hasFailures ? scoreColor(frog.lossResilience) : undefined} />
            </div>
          </ChartCard>
        </>
      )}

      {signal && (
        <>
          <ChartCard title="Atención por fase - Signal Surge">
            <DecayCurveChart metrics={signal} />
            <div className="analytics-metric-grid three">
              <MetricCard label="Atención" value={`${signal.sustainedAttention}/100`} color={scoreColor(signal.sustainedAttention)} />
              <MetricCard label="Decay" value={`${Math.round(signal.decayIndex * 100)}%`} sub={fatigueLabel(signal.fatigueLabel)} color={fatigueColor(signal.fatigueLabel)} />
              <MetricCard label="d-prime" value={signal.dPrime.toFixed(2)} sub="señal de detección" />
            </div>
          </ChartCard>

          <div className="analytics-split">
            <ChartCard title="Distribución de RT">
              <RtDistributionChart metrics={signal} />
              <div className="analytics-metric-grid two">
                {/* CRIT-1: medianRt y cvRt son null cuando no hubo hits */}
                <MetricCard label="Mediana RT" value={signal.medianRt !== null ? `${signal.medianRt}ms` : "—"} />
                <MetricCard label="Consistencia" value={signal.cvRt !== null ? signal.cvRt.toFixed(2) : "—"} sub={consistencyLabel(signal.consistencyLabel)} color={consistencyColor(signal.consistencyLabel)} />
              </div>
            </ChartCard>

            <ChartCard title="Heatmap RT x fase">
              <RiskHeatmapChart metrics={signal} />
              <div className="analytics-metric-grid two">
                <MetricCard label="Falsas alarmas" value={signal.falseAlarmsByPhase.reduce((sum, value) => sum + value, 0)} color={impulsivityColor(signal.impulsivityLabel)} />
                <MetricCard label="Impulsividad" value={impulsivityLabel(signal.impulsivityLabel)} color={impulsivityColor(signal.impulsivityLabel)} />
              </div>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="analytics-card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="analytics-metric">
      <span>{label}</span>
      <strong style={{ color }}>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function signed(value: number) {
  return value >= 0 ? `+${value}` : String(value);
}

function scoreColor(value: number) {
  if (value >= 70) return SEMANTIC.good;
  if (value >= 40) return SEMANTIC.warn;
  return SEMANTIC.bad;
}

function decisionProfileLabel(value: string) {
  if (value === "conservative") return "Cauteloso";
  if (value === "reckless") return "Temerario";
  return "Balanceado";
}

function profileColor(value: string) {
  if (value === "balanced") return SEMANTIC.good;
  if (value === "reckless") return SEMANTIC.bad;
  return SEMANTIC.warn;
}

function failureLabel(value: string) {
  if (value === "reduces") return "Reduce riesgo";
  if (value === "escalates") return "Escala riesgo";
  return "Mantiene riesgo";
}

function failureColor(value: string) {
  if (value === "reduces") return SEMANTIC.good;
  if (value === "escalates") return SEMANTIC.bad;
  return SEMANTIC.warn;
}

function fatigueLabel(value: string) {
  if (value === "stable") return "estable";
  if (value === "mild_decay") return "leve bajada";
  return "bajada notable";
}

function fatigueColor(value: string) {
  if (value === "stable") return SEMANTIC.good;
  if (value === "mild_decay") return SEMANTIC.warn;
  return SEMANTIC.bad;
}

function consistencyLabel(value: string) {
  if (value === "consistent") return "consistente";
  if (value === "moderate") return "moderado";
  if (value === "n/a") return "sin datos";
  return "variable";
}

function consistencyColor(value: string) {
  if (value === "consistent") return SEMANTIC.good;
  if (value === "moderate") return SEMANTIC.warn;
  if (value === "n/a") return undefined;
  return SEMANTIC.bad;
}

function impulsivityLabel(value: string) {
  if (value === "low") return "Baja";
  if (value === "moderate") return "Moderada";
  return "Alta";
}

function impulsivityColor(value: string) {
  if (value === "low") return SEMANTIC.good;
  if (value === "moderate") return SEMANTIC.warn;
  return SEMANTIC.bad;
}
