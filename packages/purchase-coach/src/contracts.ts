export interface HouseholdFinanceInput {
  monthlyNetIncomeCny: number;
  annualBaselineSpendCny: number;
  liquidReserveCny: number;
  /** Required before the coach can judge whether a reserve is protected. */
  reserveMonths?: number;
  plannedCommitmentsCny?: number;
  incomeStability?: "stable" | "variable" | "unknown";
  existingMonthlyDebtCny?: number;
}

export interface PurchaseCashScenario {
  carCashCny?: number;
  propertyUpfrontCny?: number;
  /** Months from today until each purchase; omitted means purchase now. */
  carPurchaseAfterMonths?: number;
  propertyPurchaseAfterMonths?: number;
  carMonthlyPaymentCny?: number;
  propertyMonthlyPaymentCny?: number;
  combinedMonthlyPaymentCapCny?: number;
  optionalCommitments?: PurchaseCommitment[];
  evaluationMonths?: number;
  propertyUpfrontBreakdown?: { downPaymentCny: number; renovationCny: number; parkingCny: number; otherCny: number };
}

export interface PurchaseCommitment {
  id: string;
  label: string;
  amountCny: number;
  afterMonths: number;
  enabled?: boolean;
}

export interface PurchaseSequenceEvent {
  month: number;
  label: string;
  outlayCny: number;
  balanceAfterCny: number;
}

export type LiquidityStatus = "within-floor" | "below-floor" | "unknown";

export interface LiquidityAssessment {
  monthlyFreeCashFlowCny: number;
  annualFreeCashFlowCny: number;
  plannedCashOutlayCny: number;
  savingsBeforePurchasesCny: number;
  remainingReserveCny: number;
  minimumReserveCny: number;
  reserveFloorCny?: number;
  /** Purchases whose monthly payment was not supplied; numeric payment totals include supplied inputs only. */
  missingMonthlyPaymentInputs: Array<"car" | "property">;
  combinedMonthlyPaymentCny: number;
  paymentHeadroomCny?: number;
  events: PurchaseSequenceEvent[];
  postPurchaseMonthlyCashFlowCny: number;
  paymentStatus: "within-cap" | "over-cap" | "unknown";
  paused: boolean;
  status: LiquidityStatus;
  reasons: string[];
}

export interface BuyerProfile {
  finance: HouseholdFinanceInput;
  scenario?: PurchaseCashScenario;
  selectedCandidateId?: string;
  timing?: { carAfterMonths?: number; propertyAfterMonths?: number };
  property?: {
    city: string;
    districts?: string[];
    housingTypes?: Array<"new" | "resale">;
    bedrooms?: number;
    livingRooms?: number;
    universityPreference?: string;
    commuteAnchors?: Array<{ id: string; label: string; maxMinutes?: number }>;
  };
  coachingMode?: "education-and-research" | "research-only";
}

export type PurchasePlanStage = "understand" | "bound" | "explore" | "compare" | "verify" | "negotiate" | "contract" | "review";

export interface PurchasePlanReport {
  generatedAt: string;
  stage: PurchasePlanStage;
  knownFacts: string[];
  unknowns: string[];
  liquidity: LiquidityAssessment;
  property: {
    status: "success" | "partial" | "failed" | "missing";
    candidates: Array<{ candidateId: string; community: string; eligibility: string; identityStatus?: string; actionItems: string[]; verificationTasks: unknown[] }>;
    pausedCandidateIds: string[];
  };
  car?: { status: "success" | "partial" | "blocked" | "failed" | "missing"; candidateCount: number };
  nextActions: string[];
}
