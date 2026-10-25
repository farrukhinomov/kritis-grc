from fastapi import APIRouter

router = APIRouter(tags=["health"])

# `async` on purpose: probes then run on the event loop and never queue behind scoring
# requests in the thread pool.


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
async def ready() -> dict[str, str]:
    # No dependencies to check: the service holds no state and opens no connections.
    return {"status": "ok"}
