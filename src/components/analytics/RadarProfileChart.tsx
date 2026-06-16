import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { CandidateProfile } from "../../psychometrics/types";
import { AURORA, STRUCTURE } from "../../utils/palette";

const DIMENSION_LABELS: Record<keyof CandidateProfile["radarDimensions"], string> = {
  sustainedAttention: "Atención",
  processingSpeed: "Velocidad",
  cognitiveConsistency: "Consistencia",
  riskAppetite: "Riesgo",
  lossResilience: "Resiliencia",
};

const BENCHMARK: CandidateProfile["radarDimensions"] = {
  sustainedAttention: 65,
  processingSpeed: 58,
  cognitiveConsistency: 60,
  riskAppetite: 45,
  lossResilience: 55,
};

type Props = {
  profile: CandidateProfile;
};

export function RadarProfileChart({ profile }: Props) {
  const data = Object.entries(profile.radarDimensions).map(([key, value]) => ({
    dimension: DIMENSION_LABELS[key as keyof CandidateProfile["radarDimensions"]],
    candidate: value,
    benchmark: BENCHMARK[key as keyof CandidateProfile["radarDimensions"]],
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
          <Tooltip
            contentStyle={{
              background: STRUCTURE.surface,
              border: `1px solid ${STRUCTURE.line}`,
              borderRadius: 8,
              color: STRUCTURE.ink,
              fontSize: 12,
            }}
            formatter={(value, name) => [`${value}/100`, name]}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
