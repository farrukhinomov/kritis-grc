from django.test import Client


def test_api_responses_are_never_cacheable(client: Client) -> None:
    response = client.get("/api/v1/does-not-exist")

    assert response["Cache-Control"] == "private, no-store"


def test_public_schema_is_not_forced_to_no_store(client: Client) -> None:
    response = client.get("/api/v1/schema")

    assert response.status_code == 200
    assert "no-store" not in response.get("Cache-Control", "")


def test_non_api_paths_are_left_alone(client: Client) -> None:
    response = client.get("/health/live")

    assert "no-store" not in response.get("Cache-Control", "")


def test_paths_that_only_resemble_public_ones_stay_uncacheable(client: Client) -> None:
    for path in ("/api/v1/schemaX", "/api/uikit", "/api/v1/schema/../x"):
        response = client.get(path)

        assert response["Cache-Control"] == "private, no-store", path
