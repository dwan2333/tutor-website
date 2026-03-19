import asyncio
import logging
from typing import Callable, TypeVar, Awaitable

logger = logging.getLogger(__name__)

T = TypeVar("T")


async def with_retry(
    fn: Callable[[], Awaitable[T]],
    max_attempts: int = 3,
    base_delay: float = 0.1,
) -> T:
    """
    Retry an async DB operation with exponential backoff.
    Handles SQLite lock contention gracefully.
    """
    for attempt in range(1, max_attempts + 1):
        try:
            return await fn()
        except Exception as e:
            if "database is locked" in str(e).lower() and attempt < max_attempts:
                delay = base_delay * (2 ** (attempt - 1))
                logger.warning(
                    "DB locked (attempt %d/%d), retrying in %.2fs...",
                    attempt, max_attempts, delay,
                )
                await asyncio.sleep(delay)
            else:
                raise
