import { describe, expect, it } from "vitest";
import { incidentImpactReducer, replayPassportId } from "./war-room-impact";

const decision = (overrides: Record<string, unknown> = {}) => ({
  scenario: "NORMAL",
  intent: "OPEN",
  symbol: "NVDA",
  story: { baseline_price: 200 },
  result: {
    action: "ALLOW",
    requested_notional_usd: 10_000,
    permitted_notional_usd: 10_000,
    requested_leverage: 10,
    permitted_leverage: 10,
    reasons: [],
    passport_id: "mbp_normal",
    market: { divergence_bps: 0.5, venue_mark: 200.01 },
    passport: { claims: { identity: { timestamp: "2026-09-11T14:00:00Z" } } },
  },
  ...overrides,
});

const poison = decision({
  scenario: "POISONED_MARK",
  result: {
    action: "BLOCK_NEW_RISK",
    requested_notional_usd: 10_000,
    permitted_notional_usd: 0,
    requested_leverage: 10,
    permitted_leverage: 0,
    reasons: ["MARK_DIVERGENCE_HALT"],
    passport_id: "mbp_poison",
    market: { divergence_bps: 308, venue_mark: 206.16 },
    passport: { claims: { identity: { timestamp: "2026-09-11T14:01:00Z" } } },
  },
});

describe("War Room incident impact", () => {
  it("does not create an incident for a normal ALLOW", () => {
    expect(incidentImpactReducer(null, { type: "DECISION", decision: decision() })).toBeNull();
  });

  it("captures transparent impact metrics for the poisoned OPEN decision", () => {
    const impact = incidentImpactReducer(null, { type: "DECISION", decision: poison });
    expect(impact).toMatchObject({
      scenario: "POISONED_MARK",
      action: "BLOCK_NEW_RISK",
      passportId: "mbp_poison",
      additionalExposurePreventedUsd: 10_000,
      illustrativeInitialMarginUsd: 1_000,
      simulatedPriceGapExposureUsd: 308,
      priceGapAsPctOfInitialMargin: 30.8,
    });
  });

  it("keeps the poison incident through close and recovery ALLOW decisions", () => {
    const impact = incidentImpactReducer(null, { type: "DECISION", decision: poison });
    const afterClose = incidentImpactReducer(impact, { type: "DECISION", decision: decision({ intent: "CLOSE" }) });
    const afterRecovery = incidentImpactReducer(afterClose, {
      type: "DECISION",
      decision: decision({
        scenario: "RECOVERY",
        result: { ...decision().result, action: "BLOCK_NEW_RISK", passport_id: "mbp_recovery_pending" },
      }),
    });
    expect(afterClose).toBe(impact);
    expect(afterRecovery).toBe(impact);
  });

  it("clears the stored incident only on reset", () => {
    const impact = incidentImpactReducer(null, { type: "DECISION", decision: poison });
    expect(incidentImpactReducer(impact, { type: "RESET" })).toBeNull();
  });

  it("uses actual permitted values for a leverage cap", () => {
    const capped = decision({
      scenario: "POISONED_MARK",
      result: {
        ...decision().result,
        action: "CAP_LEVERAGE",
        permitted_notional_usd: 4_000,
        permitted_leverage: 4,
        passport_id: "mbp_cap",
        market: { divergence_bps: 100, venue_mark: 202 },
      },
    });
    const impact = incidentImpactReducer(null, { type: "DECISION", decision: capped });
    expect(impact).toMatchObject({
      permittedNotionalUsd: 4_000,
      permittedLeverage: 4,
      additionalExposurePreventedUsd: 6_000,
      simulatedPriceGapExposureUsd: 100,
      priceGapAsPctOfInitialMargin: 10,
    });
  });

  it("replays the restricted passport after recovery", () => {
    const impact = incidentImpactReducer(null, { type: "DECISION", decision: poison });
    expect(replayPassportId(impact, "mbp_recovered")).toBe("mbp_poison");
    expect(replayPassportId(null, "mbp_current")).toBe("mbp_current");
  });
});
