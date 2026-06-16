import type { FrogRiskMetrics } from "../../psychometrics/types";

type Props = {
  metrics: FrogRiskMetrics;
};

const RISK_LABELS = [
  { value: 0.56, label: "leap", y: 22 },
  { value: 0.32, label: "probe", y: 54 },
  { value: 0.08, label: "safe", y: 86 },
];

export function PostFailureArrowChart({ metrics }: Props) {
  const pairs = buildPairs(metrics);

  if (!pairs.length) {
    return <div className="analytics-empty compact">Sin fallos con decisión posterior.</div>;
  }

  const colW = Math.max(58, Math.min(96, 360 / pairs.length));
  const width = pairs.length * colW + 64;
  const height = 124;

  return (
    <svg className="analytics-arrow-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cambio de riesgo después de cada fallo">
      <defs>
        <marker id="risk-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M2 2L8 5L2 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      {RISK_LABELS.map((item) => (
        <g key={item.label}>
          <text x={38} y={item.y + 4} textAnchor="end">{item.label}</text>
          <line x1={44} y1={item.y} x2={width - 10} y2={item.y} />
        </g>
      ))}
      {pairs.map((pair, index) => {
        const cx = 50 + index * colW + colW / 2;
        const yBefore = yForRisk(pair.before);
        const yAfter = yForRisk(pair.after);
        const color = pair.after < pair.before ? "#5cb88a" : pair.after > pair.before ? "#e05c5c" : "#e8a94a";
        return (
          <g key={`${pair.index}-${pair.before}-${pair.after}`} style={{ color }}>
            <circle cx={cx} cy={yBefore} r={5} fill={color} opacity={0.62} />
            {Math.abs(yBefore - yAfter) > 1 ? (
              <line x1={cx} y1={yBefore} x2={cx} y2={yAfter} stroke={color} strokeWidth={1.8} markerEnd="url(#risk-arrow)" />
            ) : (
              <line x1={cx - 10} y1={yBefore} x2={cx + 10} y2={yAfter} stroke={color} strokeWidth={1.8} markerEnd="url(#risk-arrow)" />
            )}
            <circle cx={cx} cy={yAfter} r={5} fill={color} />
            <text x={cx} y={height - 6} textAnchor="middle">F{index + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

function buildPairs(metrics: FrogRiskMetrics) {
  let cursor = 0;
  return metrics.postFailureDelta.flatMap((delta, index) => {
    const found = metrics.riskSequence.findIndex((risk, riskIndex) => {
      if (riskIndex < cursor || riskIndex >= metrics.riskSequence.length - 1) return false;
      return Math.abs(metrics.riskSequence[riskIndex + 1] - risk - delta) < 0.001;
    });
    if (found < 0) return [];
    cursor = found + 1;
    return [{ before: metrics.riskSequence[found], after: metrics.riskSequence[found + 1], index }];
  });
}

function yForRisk(risk: number) {
  const closest = RISK_LABELS.reduce((best, item) => (
    Math.abs(item.value - risk) < Math.abs(best.value - risk) ? item : best
  ), RISK_LABELS[0]);
  return closest.y;
}
