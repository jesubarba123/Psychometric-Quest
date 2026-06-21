export type RiskChoiceId = "safe" | "probe" | "leap";

export type RiskChoiceEvent = {
  choice: RiskChoiceId;
  reward: number;
  risk: number;
  failed: boolean;
  score: number;
};

export type SignalEvent = 
  | { type: "hit"; rt: number; phase: number }
  | { type: "miss"; phase: number }
  | { type: "false_alarm"; phase: number };

export type FrogRiskMetrics = {
  calculatedRisk: number;
  riskSequence: number[];
  meanRisk: number;
  riskStdDev: number;
  lossResilience: number;
  // B5 — when the player never failed, lossResilience defaults to 50 (neutral).
  //      hasFailures=false signals that the value should not be shown as meaningful.
  hasFailures: boolean;
  postFailureDelta: number[];
  riskAfterFailure: "reduces" | "maintains" | "escalates";
  decisionQuality: number;
  riskAdjustedScore: number;
  decisionProfile: "conservative" | "balanced" | "reckless";
  capitalHistory: number[];
  finalScore: number;
  totalGains: number;
  totalLosses: number;
};

export type SignalSurgeMetrics = {
  sustainedAttention: number;
  hitRateByPhase: number[];
  decayIndex: number;
  fatigueLabel: "stable" | "mild_decay" | "notable_decay";
  falseAlarmRate: number;
  falseAlarmsByPhase: number[];
  dPrime: number;
  impulsivityLabel: "low" | "moderate" | "high";
  /** null cuando no hubo hits — excluir del cálculo en vez de inventar un 0
   *  que inflaría rtScore (CRIT-1: bug inverso al placeholder 999 de C3). */
  meanRt: number | null;
  /** null cuando no hubo hits. */
  medianRt: number | null;
  rtP25: number | null;
  rtP75: number | null;
  rtStdDev: number | null;
  cvRt: number | null;
  consistencyLabel: "consistent" | "moderate" | "variable" | "n/a";
  rtOutliers: number[];
  metricsByPhase: Array<{
    phase: number;
    hitRate: number;
    faRate: number;
    /** null cuando no hubo hits en esa fase. */
    meanRt: number | null;
  }>;
  rtBuckets: Array<{ bucket: string; count: number; phase: number }>;
};

export type CandidateProfile = {
  frog: FrogRiskMetrics | null;
  signal: SignalSurgeMetrics | null;
  completedAt: Date;
  radarDimensions: {
    sustainedAttention: number;
    /** null cuando no hubo hits en Signal Surge (CRIT-1: excluir > inventar). */
    processingSpeed: number | null;
    /** null cuando no hubo hits en Signal Surge (sin RT no hay variabilidad). */
    cognitiveConsistency: number | null;
    riskAppetite: number;
    lossResilience: number;
  };
};
