from marketbridge.context import sec


def test_sec_default_user_agent_declares_application_and_contact(monkeypatch):
    monkeypatch.delenv("MARKETBRIDGE_SEC_USER_AGENT", raising=False)

    user_agent = sec._user_agent()

    assert user_agent == "MarketBridge market-intelligence support@marketbridge.example"
    assert "set MARKETBRIDGE_SEC_USER_AGENT" not in user_agent


def test_sec_user_agent_respects_configured_identity(monkeypatch):
    monkeypatch.setenv("MARKETBRIDGE_SEC_USER_AGENT", "Acme Markets sec-contact@example.com")

    assert sec._user_agent() == "Acme Markets sec-contact@example.com"
