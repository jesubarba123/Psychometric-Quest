import type { ReactNode } from "react";
import type { CandidateProfile, RiskChoiceId } from "../../psychometrics/types";
import { CapitalCurveChart } from "./CapitalCurveChart";
import { DecayCurveChart } from "./DecayCurveChart";
import { PostFailureArrowChart } from "./PostFailureArrowChart";
import { RadarProfileChart } from "./RadarProfileChart";
import { RiskHeatmapChart } from "./RiskHeatmapChart";
import { RtDistributionChart } from "./RtDistributionChart";
import "./PsychometricDashboard.css";

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
        <div className="analytics-metric-grid five">
          {Object.entries(profile.radarDimensions).map(([key, value]) => (
            <MetricCard
              key={key}
              label={DIMENSION_LABELS[key as keyof CandidateProfile["radarDimensions"]]}
              value={value}
              color={scoreColor(value)}
            />
          ))}
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
              <MetricCard label="Resiliencia" value={`${frog.lossResilience}/100`} color={scoreColor(frog.lossResilience)} />
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
                <MetricCard label="Mediana RT" value={`${signal.medianRt}ms`} />
                <MetricCard label="Consistencia" value={signal.cvRt.toFixed(2)} sub={consistencyLabel(signal.consistencyLabel)} color={consistencyColor(signal.consistencyLabel)} />
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
  if (value >= 70) return "#5cb88a";
  if (value >= 40) return "#e8a94a";
  return "#e05c5c";
}

function decisionProfileLabel(value: string) {
  if (value === "conservative") return "Cauteloso";
  if (value === "reckless") return "Temerario";
  return "Balanceado";
}

function profileColor(value: string) {
  if (value === "balanced") return "#5cb88a";
  if (value === "reckless") return "#e05c5c";
  return "#e8a94a";
}

function failureLabel(value: string) {
  if (value === "reduces") return "Reduce riesgo";
  if (value === "escalates") return "Escala riesgo";
  return "Mantiene riesgo";
}

function failureColor(value: string) {
  if (value === "reduces") return "#5cb88a";
  if (value === "escalates") return "#e05c5c";
  return "#e8a94a";
}

function fatigueLabel(value: string) {
  if (value === "stable") return "estable";
  if (value === "mild_decay") return "leve bajada";
  return "bajada notable";
}

function fatigueColor(value: string) {
  if (value === "stable") return "#5cb88a";
  if (value === "mild_decay") return "#e8a94a";
  return "#e05c5c";
}

function consistencyLabel(value: string) {
  if (value === "consistent") return "consistente";
  if (value === "moderate") return "moderado";
  return "variable";
}

function consistencyColor(value: string) {
  if (value === "consistent") return "#5cb88a";
  if (value === "moderate") return "#e8a94a";
  return "#e05c5c";
}

function impulsivityLabel(value: string) {
  if (value === "low") return "Baja";
  if (value === "moderate") return "Moderada";
  return "Alta";
}

function impulsivityColor(value: string) {
  if (value === "low") return "#5cb88a";
  if (value === "moderate") return "#e8a94a";
  return "#e05c5c";
}
