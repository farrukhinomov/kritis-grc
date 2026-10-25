from http import HTTPStatus

import pytest
from django.db import OperationalError
from django.test import Client


def test_live_answers_without_touching_the_database(client: Client) -> None:
    # No `db` marker: pytest-django fails the test if the view queries the database.
    response = client.get("/health/live")

    assert response.status_code == HTTPStatus.OK
    assert response.json() == {"status": "ok"}


@pytest.mark.django_db
def test_ready_reports_ok_when_the_database_answers(client: Client) -> None:
    response = client.get("/health/ready")

    assert response.status_code == HTTPStatus.OK
    assert response.json() == {"status": "ok"}


@pytest.mark.django_db
def test_ready_reports_unavailable_without_leaking_details(
    client: Client, monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken_cursor(*args: object, **kwargs: object) -> None:
        raise OperationalError("connection refused to 10.0.0.5")

    monkeypatch.setattr("grc.core.health.connection.cursor", broken_cursor)

    response = client.get("/health/ready")

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.json() == {"status": "unavailable"}
    assert b"10.0.0.5" not in response.content


@pytest.mark.django_db
@pytest.mark.parametrize("path", ["/health/live", "/health/ready"])
def test_probes_answer_whatever_host_the_platform_sends(client: Client, path: str) -> None:
    # Platform probes call the container by IP, which is not an allowed host.
    response = client.get(path, headers={"Host": "10.1.2.3:8080"})

    assert response.status_code == HTTPStatus.OK
