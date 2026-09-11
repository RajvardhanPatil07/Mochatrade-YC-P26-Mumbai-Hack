export type IncidentImpact = {
  timestamp: string;
  symbol: string;
  scenario: string;
  requestedNotionalUsd: number;
  permittedNotionalUsd: number;
  requestedLeverage: number;
  permittedLeverage: number;
  divergenceBps: number | null;
  baselinePrice: number | null;
  venueMark: number | null;
  action: string;
  reasons: string[];
  passportId: string;
  additionalExposurePreventedUsd: number;
  illustrativeInitialMarginUsd: number | null;
  simulatedPriceGapExposureUsd: number | null;
  priceGapAsPctOfInitialMargin: number | null;
};

type IncidentDecision = {
  scenario: string;
  intent: string;
  symbol: string;
  story: { baseline_price: number | null };
  result: {
    action: string;
    requested_notional_usd: number;
    permitted_notional_usd: number;
    requested_leverage: number;
    permitted_leverage: number;
    reasons: string[];
    passport_id: string;
    expires_at?: string;
    market: { divergence_bps: number | null; venue_mark: number | null };
    passport: { claims?: { identity?: { timestamp?: string } } };
  };
};

export type IncidentImpactEvent =
  | { type: "DECISION"; decision: IncidentDecision }
  | { type: "RESET" };

function materialIncident(decision: IncidentDecision) {
  if (decision.intent !== "OPEN" || decision.scenario !== "POISONED_MARK") return false;
  const result = decision.result;
  const restricted = result.permitted_notional_usd < result.requested_notional_usd
    || result.permitted_leverage < result.requested_leverage;
  return result.action === "BLOCK_NEW_RISK"
    || result.action === "CAP_LEVERAGE"
    || (result.action === "REVIEW" && restricted);
}

function impactFromDecision(decision: IncidentDecision): IncidentImpact {
  const result = decision.result;
  const additionalExposurePreventedUsd = Math.max(0, result.requested_notional_usd - result.permitted_notional_usd);
  const illustrativeInitialMarginUsd = result.requested_leverage > 0
    ? result.requested_notional_usd / result.requested_leverage
    : null;
  const simulatedPriceGapExposureUsd = result.market.divergence_bps == null
    ? null
    : result.requested_notional_usd * result.market.divergence_bps / 10_000;
  const priceGapAsPctOfInitialMargin = illustrativeInitialMarginUsd != null
    && illustrativeInitialMarginUsd > 0
    && simulatedPriceGapExposureUsd != null
    ? simulatedPriceGapExposureUsd / illustrativeInitialMarginUsd * 100
    : null;

  return {
    timestamp: result.passport.claims?.identity?.timestamp ?? result.expires_at ?? "",
    symbol: decision.symbol,
    scenario: decision.scenario,
    requestedNotionalUsd: result.requested_notional_usd,
    permittedNotionalUsd: result.permitted_notional_usd,
    requestedLeverage: result.requested_leverage,
    permittedLeverage: result.permitted_leverage,
    divergenceBps: result.market.divergence_bps,
    baselinePrice: decision.story.baseline_price,
    venueMark: result.market.venue_mark,
    action: result.action,
    reasons: result.reasons,
    passportId: result.passport_id,
    additionalExposurePreventedUsd,
    illustrativeInitialMarginUsd,
    simulatedPriceGapExposureUsd,
    priceGapAsPctOfInitialMargin,
  };
}

export function incidentImpactReducer(state: IncidentImpact | null, event: IncidentImpactEvent): IncidentImpact | null {
  if (event.type === "RESET") return null;
  return materialIncident(event.decision) ? impactFromDecision(event.decision) : state;
}

export function replayPassportId(incident: IncidentImpact | null, currentPassportId: string | null): string | null {
  return incident?.passportId ?? currentPassportId;
}
