from datetime import datetime, timezone

from fastapi.testclient import TestClient

from marketbridge import api
from marketbridge import judge
from marketbridge.app import app


client = TestClient(app)


def test_judge_live_baseline_route_is_registered_before_static_catch_all(monkeypatch):
    monkeypatch.setattr(
        api.pipeline,
        "snapshot",
        lambda: {"decisions": [], "providers": [], "data_mode": "SHADOW_ORACLE"},
    )
    monkeypatch.setattr(judge, "get_live_snapshot", lambda force=False: {"observations": []})
    response = client.post(
        "/v1/demo/live-baseline",
        json={
            "symbol": "NVDA",
            "inject_attack": False,
            "requested_notional_usd": 10000,
            "requested_leverage": 10,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["available"] is False
    assert payload["data_mode"] == "LIVE_BASELINE_UNAVAILABLE"


def test_judge_live_baseline_shows_fresh_research_observation_without_claiming_quorum(monkeypatch):
    monkeypatch.setattr(
        api.pipeline,
        "snapshot",
        lambda: {"decisions": [], "providers": [], "data_mode": "SHADOW_ORACLE"},
    )
    monkeypatch.setattr(
        judge,
        "get_live_snapshot",
        lambda force=False: {
            "observations": [
                {
                    "symbol": "NVDA",
                    "observed_price": 220.25,
                    "event_time": datetime.now(timezone.utc).isoformat(),
                    "source": {
                        "name": "Yahoo Finance via yfinance",
                        "family": "yahoo-research-feed",
                        "status": "FRESH",
                    },
                }
            ]
        },
    )

    response = client.post(
        "/v1/demo/live-baseline",
        json={
            "symbol": "NVDA",
            "inject_attack": False,
            "requested_notional_usd": 10000,
            "requested_leverage": 10,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["available"] is True
    assert payload["qualified"] is False
    assert payload["data_mode"] == "LIVE_RESEARCH_BASELINE"
    assert payload["market_truth"]["reference_price"] == 220.25
    assert payload["market_truth"]["reference_status"] == "UNQUALIFIED_RESEARCH_ONLY"
    assert payload["decision"]["action"] == "BLOCK_NEW_RISK"


def test_safe_alternative_route_is_reachable_and_advisory(monkeypatch):
    monkeypatch.setattr(
        api.pipeline,
        "snapshot",
        lambda: {"decisions": [], "providers": [], "data_mode": "SHADOW_ORACLE"},
    )
    api.risk_gateway.recovery.reset()
    now = datetime.now(timezone.utc).isoformat()
    response = client.post(
        "/v1/order/safe-alternative",
        json={
            "request": {
                "request_id": "judge-route-registration-test",
                "symbol": "NVDA",
                "intent": {
                    "kind": "OPEN",
                    "side": "BUY",
                    "notional_usd": 10000,
                    "requested_leverage": 10,
                },
                "account": {
                    "equity_usd": 10000,
                    "margin_available_usd": 10000,
                    "position_notional_usd": 22000,
                    "current_leverage": 2.2,
                    "liquidation_price": 140,
                    "position_side": "BUY",
                    "portfolio_positions": [
                        {
                            "symbol": "NVDA",
                            "notional_usd": 6000,
                            "sector": "SEMICONDUCTORS",
                            "correlation_group": "AI_COMPUTE",
                        },
                        {
                            "symbol": "AMD",
                            "notional_usd": 5000,
                            "sector": "SEMICONDUCTORS",
                            "correlation_group": "AI_COMPUTE",
                        },
                        {
                            "symbol": "MSFT",
                            "notional_usd": 4000,
                            "sector": "TECHNOLOGY",
                            "correlation_group": "MEGA_CAP_TECH",
                        },
                        {
                            "symbol": "AAPL",
                            "notional_usd": 4000,
                            "sector": "TECHNOLOGY",
                            "correlation_group": "MEGA_CAP_TECH",
                        },
                        {
                            "symbol": "TSLA",
                            "notional_usd": 3000,
                            "sector": "CONSUMER_DISCRETIONARY",
                            "correlation_group": "HIGH_BETA_GROWTH",
                        },
                    ],
                },
                "market": {
                    "mark_price": 200,
                    "oracle_price": 200,
                    "event_time": now,
                    "session": "OVERNIGHT",
                },
                "demo_scenario": "NORMAL",
            }
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["advisory_only"] is True
    assert payload["execution_submitted"] is False
