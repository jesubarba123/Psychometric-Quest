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
  meanRt: number;
  medianRt: number;
  rtP25: number;
  rtP75: number;
  rtStdDev: number;
  cvRt: number;
  consistencyLabel: "consistent" | "moderate" | "variable";
  rtOutliers: number[];
  metricsByPhase: Array<{
    phase: number;
    hitRate: number;
    faRate: number;
    meanRt: number;
  }>;
  rtBuckets: Array<{ bucket: string; count: number; phase: number }>;
};

export type CandidateProfile = {
  frog: FrogRiskMetrics | null;
  signal: SignalSurgeMetrics | null;
  completedAt: Date;
  radarDimensions: {
    sustainedAttention: number;
    processingSpeed: number;
    cognitiveConsistency: number;
    riskAppetite: number;
    lossResilience: number;
  };
};
