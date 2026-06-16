import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SignalSurgeMetrics } from "../../psychometrics/types";
import { AURORA, STRUCTURE } from "../../utils/palette";

const BENCHMARK_BY_PHASE = [
  { hitRate: 0.78 },
  { hitRate: 0.72 },
  { hitRate: 0.68 },
];

type Props = {
  metrics: SignalSurgeMetrics;
};

export function DecayCurveChart({ metrics }: Props) {
  const data = metrics.metricsByPhase.map((metric, index) => ({
    phase: `Fase ${metric.phase}`,
    hitRate: Math.round(metric.hitRate * 100),
    falseAlarms: Math.round(metric.faRate * 100),
    benchmark: Math.round(BENCHMARK_BY_PHASE[index].hitRate * 100),
  }));

  return (
    <div className="analytics-chart analytics-chart-tall">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(216,232,228,.08)" vertical={false} />
          <XAxis dataKey="phase" tick={{ fontSize: 11, fill: STRUCTURE.muted }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: STRUCTURE.muted }}
            axisLine={false}
            tickLine={false}
            width={42}
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip
            contentStyle={{
              background: STRUCTURE.surface,
              border: `1px solid ${STRUCTURE.line}`,
              borderRadius: 8,
              color: STRUCTURE.ink,
              fontSize: 12,
            }}
            formatter={(value, name) => [`${value}%`, name]}
          />
          <Legend wrapperStyle={{ color: STRUCTURE.muted, fontSize: 12 }} />
          <Line type="monotone" dataKey="benchmark" name="Benchmark hits" stroke="rgba(216,232,228,.38)" strokeDasharray="4 4" dot={false} />
          <Line type="monotone" dataKey="hitRate" name="Hit rate" stroke={AURORA.signal} strokeWidth={2.5} dot={{ r: 4, fill: AURORA.signal }} />
          <Line type="monotone" dataKey="falseAlarms" name="Falsas alarmas" stroke={AURORA.amber} strokeWidth={2} strokeDasharray="3 3" dot={{ r: 3, fill: AURORA.amber }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
