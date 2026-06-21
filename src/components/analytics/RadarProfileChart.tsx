import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { TooltipContentProps, TooltipValueType } from "recharts";
import type { CandidateProfile } from "../../psychometrics/types";
import { AURORA, STRUCTURE } from "../../utils/palette";

const DIMENSION_LABELS: Record<keyof CandidateProfile["radarDimensions"], string> = {
  sustainedAttention: "Atención",
  processingSpeed: "Velocidad",
  cognitiveConsistency: "Consistencia",
  riskAppetite: "Riesgo",
  lossResilience: "Resiliencia",
};

const BENCHMARK: Record<keyof CandidateProfile["radarDimensions"], number> = {
  sustainedAttention: 65,
  processingSpeed: 58,
  cognitiveConsistency: 60,
  riskAppetite: 45,
  lossResilience: 55,
};

type RadarDataPoint = {
  dimension: string;
  /** Valor numérico para dibujar el polígono; 0 cuando candidateNull=true. */
  candidate: number;
  /** true cuando la dimensión no tiene dato real (el candidato no tuvo hits). */
  candidateNull: boolean;
  benchmark: number;
};

type Props = {
  profile: CandidateProfile;
};

// Tooltip personalizado para mostrar "sin dato" cuando candidateNull=true.
// NUEVO-IMP-1: el formatter estándar de Recharts no tiene acceso al payload completo
// por entrada, así que usamos un componente de tooltip a medida.
function RadarTooltip({ active, payload }: TooltipContentProps<TooltipValueType, number | string>) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: STRUCTURE.surface,
        border: `1px solid ${STRUCTURE.line}`,
        borderRadius: 8,
        color: STRUCTURE.ink,
        fontSize: 12,
        padding: "8px 12px",
      }}
    >
      {payload.map((entry) => {
        // entry.payload es el objeto RadarDataPoint del punto activo
        const point = entry.payload as RadarDataPoint;
        const isCandidate = entry.dataKey === "candidate";
        const displayValue =
          isCandidate && point.candidateNull
            ? "sin dato"
            : `${entry.value}/100`;
        return (
          <div key={String(entry.dataKey)} style={{ color: entry.color }}>
            {entry.name}: {displayValue}
          </div>
        );
      })}
    </div>
  );
}

export function RadarProfileChart({ profile }: Props) {
  const data: RadarDataPoint[] = (
    Object.entries(profile.radarDimensions) as [keyof CandidateProfile["radarDimensions"], number | null][]
  ).map(([key, value]) => ({
    dimension: DIMENSION_LABELS[key],
    // NUEVO-IMP-1: el polígono usa 0 para poder dibujarse cuando value es null,
    // pero candidateNull=true indica al tooltip que debe decir "sin dato" en vez de "0/100".
    candidate: value ?? 0,
    candidateNull: value === null,
    benchmark: BENCHMARK[key],
  }));

  return (
    <div className="analytics-chart analytics-radar">
      <ResponsiveContainer>
        <RadarChart data={data} margin={{ top: 10, right: 36, bottom: 10, left: 36 }}>
          <PolarGrid stroke="rgba(216,232,228,.12)" />
          <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: STRUCTURE.mutedTick }} />
          <Radar
            name="Benchmark"
            dataKey="benchmark"
            stroke="rgba(216,232,228,.32)"
            fill="rgba(216,232,228,.06)"
            strokeDasharray="4 4"
          />
          <Radar
            name="Candidato"
            dataKey="candidate"
            stroke={AURORA.signal}
            fill="rgba(78,205,196,.18)"
            strokeWidth={2}
          />
          <Tooltip content={RadarTooltip} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
