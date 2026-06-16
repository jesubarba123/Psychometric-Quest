import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SignalSurgeMetrics } from "../../psychometrics/types";

const BUCKETS = ["200-400", "400-600", "600-800", "800+"];

type Props = {
  metrics: SignalSurgeMetrics;
};

export function RtDistributionChart({ metrics }: Props) {
  const data = BUCKETS.map((bucket) => ({
    bucket,
    total: metrics.rtBuckets.filter((item) => item.bucket === bucket).reduce((sum, item) => sum + item.count, 0),
  }));
  const medianBucket =
    metrics.medianRt < 400 ? "200-400" :
    metrics.medianRt < 600 ? "400-600" :
    metrics.medianRt < 800 ? "600-800" :
    "800+";

  return (
    <div className="analytics-chart analytics-chart-small">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(216,232,228,.08)" vertical={false} />
          <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "#7a9898" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#7a9898" }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: "#161d24",
              border: "1px solid #2a3a48",
              borderRadius: 8,
              color: "#d8e8e4",
              fontSize: 12,
            }}
            formatter={(value) => [value, "Hits"]}
          />
          <Bar dataKey="total" radius={[5, 5, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.bucket} fill={entry.bucket === medianBucket ? "#4ecdc4" : "rgba(78,205,196,.38)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
