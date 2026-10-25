import pytest
from fastapi.testclient import TestClient

from risk_engine.main import create_app
from risk_engine.settings import Environment, Settings


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app(Settings(app_env=Environment.TEST)))
