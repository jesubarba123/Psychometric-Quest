import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FrogRiskMetrics, RiskChoiceId } from "../../psychometrics/types";
import { AURORA, SEMANTIC, STRUCTURE } from "../../utils/palette";

const CHOICE_COLORS: Record<RiskChoiceId, string> = {
  safe: SEMANTIC.good,
  probe: SEMANTIC.warn,
  leap: SEMANTIC.bad,
};

const CHOICE_LABELS: Record<RiskChoiceId, string> = {
  safe: "Estabilizar",
  probe: "Probar",
  leap: "Saltar",
};

type Props = {
  metrics: FrogRiskMetrics;
  choices: Array<{ choice: RiskChoiceId }>;
};

export function CapitalCurveChart({ metrics, choices }: Props) {
  const data = metrics.capitalHistory.map((score, index) => ({
    turn: index === 0 ? "Inicio" : `T${index}`,
    score,
    choice: index > 0 ? choices[index - 1]?.choice : null,
  }));

  return (
    <div className="analytics-chart analytics-chart-tall">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="capitalGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={AURORA.signal} stopOpacity={0.22} />
              <stop offset="95%" stopColor={AURORA.signal} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(216,232,228,.08)" vertical={false} />
          <XAxis dataKey="turn" tick={{ fontSize: 11, fill: STRUCTURE.muted }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: STRUCTURE.muted }} axisLine={false} tickLine={false} width={42} />
          <ReferenceLine y={0} stroke="rgba(216,232,228,.22)" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ stroke: "rgba(78,205,196,.22)", strokeWidth: 1 }}
            contentStyle={{
              background: STRUCTURE.surface,
              border: `1px solid ${STRUCTURE.line}`,
              borderRadius: 8,
              color: STRUCTURE.ink,
              fontSize: 12,
            }}
            formatter={(value, _name, props) => {
              const choice = props.payload?.choice as RiskChoiceId | null;
              return [`${Number(value) >= 0 ? "+" : ""}${value}`, choice ? CHOICE_LABELS[choice] : "Inicio"];
            }}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke={AURORA.signal}
            strokeWidth={2.5}
            fill="url(#capitalGradient)"
            dot={(props) => <CapitalDot {...props} />}
            activeDot={{ r: 7, stroke: STRUCTURE.ink, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function CapitalDot(props: { cx?: number; cy?: number; payload?: { choice?: RiskChoiceId | null }; [key: string]: unknown }) {
  const { cx = 0, cy = 0, payload } = props;
  const choice = payload?.choice;
  const fill = choice ? CHOICE_COLORS[choice] : STRUCTURE.muted;
  return <circle cx={cx} cy={cy} r={choice ? 5 : 4} fill={fill} stroke={STRUCTURE.paper} strokeWidth={2} />;
}
