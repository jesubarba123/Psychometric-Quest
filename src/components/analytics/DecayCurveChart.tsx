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
          <XAxis dataKey="phase" tick={{ fontSize: 11, fill: "#7a9898" }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "#7a9898" }}
            axisLine={false}
            tickLine={false}
            width={42}
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip
            contentStyle={{
              background: "#161d24",
              border: "1px solid #2a3a48",
              borderRadius: 8,
              color: "#d8e8e4",
              fontSize: 12,
            }}
            formatter={(value, name) => [`${value}%`, name]}
          />
          <Legend wrapperStyle={{ color: "#7a9898", fontSize: 12 }} />
          <Line type="monotone" dataKey="benchmark" name="Benchmark hits" stroke="rgba(216,232,228,.38)" strokeDasharray="4 4" dot={false} />
          <Line type="monotone" dataKey="hitRate" name="Hit rate" stroke="#4ecdc4" strokeWidth={2.5} dot={{ r: 4, fill: "#4ecdc4" }} />
          <Line type="monotone" dataKey="falseAlarms" name="Falsas alarmas" stroke="#e8a94a" strokeWidth={2} strokeDasharray="3 3" dot={{ r: 3, fill: "#e8a94a" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
