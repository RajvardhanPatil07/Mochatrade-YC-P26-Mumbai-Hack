<div align="center">

# 🌉 MarketBridge

### The market-safety control plane for 24/7 equity perpetuals

**US stocks sleep. Equity perpetuals do not.**<br>
**MarketBridge verifies the market before leverage acts on it.**

[90-second demo guide](./docs/DEMO.md) · [Architecture](./docs/ARCHITECTURE.md) · [Proof methodology](./docs/PROOF.md) · [Mochatrade integration](./docs/MOCHATRADE_INTEGRATION.md)

</div>

![MarketBridge system architecture](./docs/media/architecture.svg)

## The two-minute version

Mochatrade enables 24/7 leveraged trading on assets such as US stocks. But the underlying stock market is not always open, liquid, or producing reliable price discovery. During those gaps, a stale or manipulated venue mark can create unsafe leverage and liquidation decisions.

**MarketBridge is a pre-trade safety layer.** It combines independent market evidence, the venue mark, the trader's current exposure, and the requested order. It then returns one explainable action:

| Decision | Meaning |
|---|---|
| `ALLOW` | Evidence and portfolio risk support the order. |
| `CAP_LEVERAGE` | The order can proceed only at a safer leverage/notional. |
| `REVIEW` | The evidence is ambiguous and needs intervention. |
| `BLOCK_NEW_RISK` | New exposure is unsafe under current conditions. |

Every decision produces a short-lived **Safety Passport** containing the inputs, evidence provenance, policy versions, reason codes, expiry, and a fingerprint for deterministic replay.

> The core insight: a margin engine asks whether the **account** can survive the leverage. MarketBridge first asks whether the **market price** deserves that leverage.

## What judges should try

Run the War Room and complete this flow in about 90 seconds:

1. **Normal market** — independent evidence agrees; a leveraged open can proceed.
2. **Poison the venue mark** — choose an attack size; MarketBridge restricts new risk.
3. **Prove exits stay open** — the same degraded market still permits a valid `CLOSE`.
4. **Inspect the Safety Passport** — see the evidence, reasons, policy, expiry, and hash.
5. **Replay the decision** — compare the real decision with a clearly labelled no-gate counterfactual.
6. **Recover safely** — repeated stable evidence is required; one clean tick cannot immediately restore leverage.

The demo accepts editable symbol, notional, leverage, account equity, existing exposure, evidence mode, and attack size. `AUTO` uses qualified live evidence when a genuine independent quorum exists; otherwise it falls back to an explicitly labelled deterministic synthetic fixture. No trade is submitted.

## How it works

```text
independent market evidence ──┐
                              ├─> Market Truth ─┐
venue/perpetual mark ─────────┘                 │
                                                ├─> Risk Gateway ─> decision
account + portfolio + order intent ─────────────┘                    │
                                                                      ▼
                                                               Safety Passport
                                                                      │
                                                                      ▼
                                                            deterministic replay
```

MarketBridge enforces five important invariants:

- **No fake consensus:** provider labels and venue families are checked separately, so correlated sources do not become false independence.
- **Fail closed for new risk:** stale, insufficient, conflicting, or halted evidence cannot silently authorize more exposure.
- **Never trap the trader:** valid `REDUCE` and `CLOSE` requests remain available during degraded conditions.
- **Recovery has hysteresis:** a market moves through `RECOVERY_PENDING` instead of reopening leverage after one good observation.
- **AI cannot weaken safety:** learned estimates may tighten the posture, but deterministic rules own the final risk-critical decision.

## Why this is useful to Mochatrade

| Without MarketBridge | With MarketBridge |
|---|---|
| Venue price can become the only truth | Venue mark is checked against independent Market Truth |
| Risk controls return a binary yes/no | Unsafe orders receive a safe leverage/notional alternative when possible |
| A warning disappears after the moment | Every decision creates a replayable Safety Passport |
| Data vendors may look independent by name | Provider and venue-family independence is explicit |
| A single clean tick can reopen risk | Recovery requires repeated stable evidence |

The host integration is a small pre-trade call:

```text
Mochatrade order intent
        │
        ▼
POST /v1/integrations/mochatrade/risk-check
        │
        ├── ALLOW
        ├── CAP_LEVERAGE + safe alternative
        ├── REVIEW
        └── BLOCK_NEW_RISK
```

See the reference adapter in [`examples/mochatrade-pretrade.ts`](./examples/mochatrade-pretrade.ts).

## Proof, not just a dashboard

The project includes three judge-facing evidence layers:

- **Historical reconstruction:** published incident observations are passed through the same deterministic consequence function used by the live gate. It is labelled counterfactual and does not use future outcomes.
- **Seeded policy regression:** reproducible varied market/account/order states measure action distribution, invariant violations, scenario coverage, and in-process p50/p95/p99 latency. It is not presented as classifier accuracy or a historical backtest.
- **Portfolio Risk Firewall:** concentration, account, session, and existing exposure can cap an order even when Market Truth itself is qualified.

Useful endpoints:

```text
GET  /v1/proof/historical
GET  /v1/proof/benchmark?cases=2000&seed=20260911
GET  /v1/proof/portfolio
POST /v1/proof/portfolio
POST /v1/demo/war-room
POST /v1/order/safe-alternative
POST /v1/integrations/mochatrade/risk-check
POST /v1/replay/risk-decision
```

## Run locally

Requirements: Python 3.12+, Node.js 24+, [`uv`](https://docs.astral.sh/uv/), and npm.

```bash
git clone https://github.com/RajvardhanPatil07/Mochatrade-YC-P26-Mumbai-Hack.git
cd Mochatrade-YC-P26-Mumbai-Hack
cp .env.example .env
make setup
make demo
```

Open [http://127.0.0.1:8000/demo/](http://127.0.0.1:8000/demo/). The synthetic judge flow works without market-data credentials.

For live free-first display/evidence, configure supported provider credentials in `.env`. Secrets must remain server-side and must never use `NEXT_PUBLIC_*` variables.

## Tech stack

| Layer | Technology |
|---|---|
| Web experience | Next.js 16, React 19, TypeScript, Lightweight Charts |
| API and policy engine | FastAPI, Python 3.12, Pydantic |
| Evidence and local analytics | DuckDB, JSONL replay records |
| Market/context adapters | Alpaca/IEX, Hyperliquid, Marketaux, SEC EDGAR, Nasdaq directory, optional Twelve Data |
| Verification | Pytest, Hypothesis, Vitest, Playwright, Ruff, GitHub Actions |
| Deployment | Docker/Railway backend + exported frontend; optional split Vercel frontend |

The deterministic risk-critical policy path makes **zero LLM calls** and requires **zero paid API calls inside the policy function**.

## Project structure

```text
apps/web/                    Next.js judge experience and market workstation
backend/marketbridge/        FastAPI application, evidence engine, and risk gateway
backend/marketbridge/risk/   Policy, portfolio controls, recovery, and passports
config/                      Asset and entitlement policies
docs/                        Architecture, proof, threat model, and demo guides
examples/                    Mochatrade pre-trade integration example
fixtures/                    Reproducible adversarial market scenarios
scripts/                     Benchmarks, replay, evaluation, and evidence export
tests/                       Backend, policy, security, and property tests
```

## Verify the build

```bash
make verify          # lint + typecheck + unit tests + frontend build + Python tests
make benchmark-risk # deterministic safety-policy regression
make e2e             # browser-level demo and risk-gate flows
make live-check      # configured provider health and entitlement checks
```

CI runs the same core verification on every push.

## Provider trust boundary

MarketBridge is provider-agnostic. Market prices, venue state, and intelligence context are deliberately separated:

- **Market evidence** may contribute to Market Truth only when freshness, provenance, entitlement, and independence checks pass.
- **Venue data** is compared with Market Truth; it cannot manufacture independent truth.
- **News, filings, macro, and research context** may explain events but cannot loosen a trading control.

See [the free-first provider design](./docs/FREE_FIRST_STACK.md) and [threat model](./docs/THREAT_MODEL.md).

## Safety and honesty boundary

MarketBridge is a hackathon/pilot advisory architecture, not a certified exchange oracle, broker, custody system, or liquidation authority.

- The demo submits no trade and holds no wallet, custody, or exchange signing key.
- Synthetic inputs are always labelled; they never impersonate real providers.
- Counterfactual replay reports simulated additional exposure, not guaranteed savings or avoided loss.
- Market-data rights and provider readiness are reported conservatively.

## Team and context

Project contributors: [`@RajvardhanPatil07`](https://github.com/RajvardhanPatil07) and [`@ritz2607`](https://github.com/ritz2607). See [TEAM.md](./TEAM.md) for the attribution boundary.

The original Mochatrade challenge/company context is preserved in [Mochatrade.md](./Mochatrade.md).

Licensed under the [MIT License](./LICENSE).
