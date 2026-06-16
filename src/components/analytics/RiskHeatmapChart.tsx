import type { SignalSurgeMetrics } from "../../psychometrics/types";

const PHASES = [1, 2, 3];
const BUCKETS = ["200-400", "400-600", "600-800", "800+"];

type Props = {
  metrics: SignalSurgeMetrics;
};

export function RiskHeatmapChart({ metrics }: Props) {
  const maxCount = Math.max(...metrics.rtBuckets.map((bucket) => bucket.count), 1);
  const cellW = 72;
  const cellH = 38;
  const padLeft = 44;
  const padTop = 30;
  const width = padLeft + cellW * BUCKETS.length + 8;
  const height = padTop + cellH * PHASES.length + 20;

  function getCount(phase: number, bucket: string) {
    return metrics.rtBuckets.find((item) => item.phase === phase && item.bucket === bucket)?.count ?? 0;
  }

  return (
    <svg className="analytics-heatmap" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Heatmap de tiempos de reacción por fase">
      {BUCKETS.map((bucket, index) => (
        <text key={bucket} x={padLeft + index * cellW + cellW / 2} y={17} textAnchor="middle">
          {bucket}ms
        </text>
      ))}
      {PHASES.map((phase, phaseIndex) => (
        <g key={phase}>
          <text x={padLeft - 8} y={padTop + phaseIndex * cellH + cellH / 2 + 4} textAnchor="end">F{phase}</text>
          {BUCKETS.map((bucket, bucketIndex) => {
            const count = getCount(phase, bucket);
            const intensity = count / maxCount;
            return (
              <g key={`${phase}-${bucket}`}>
                <rect
                  x={padLeft + bucketIndex * cellW + 2}
                  y={padTop + phaseIndex * cellH + 2}
                  width={cellW - 4}
                  height={cellH - 4}
                  rx={6}
                  fill={`rgba(78,205,196,${Math.max(0.06, intensity * 0.82)})`}
                  stroke="rgba(216,232,228,.08)"
                />
                {count > 0 && (
                  <text
                    className={intensity > 0.5 ? "strong" : ""}
                    x={padLeft + bucketIndex * cellW + cellW / 2}
                    y={padTop + phaseIndex * cellH + cellH / 2 + 4}
                    textAnchor="middle"
                  >
                    {count}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
