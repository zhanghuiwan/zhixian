from dataclasses import dataclass
from datetime import UTC, datetime, timedelta


@dataclass(frozen=True)
class ReviewSchedule:
    repetitions: int
    interval_days: int
    ease_factor: float
    mastery_score: int
    status: str
    next_review_at: datetime


RATING_QUALITY = {"again": 0, "hard": 2, "good": 4, "easy": 5}
MASTERY_DELTA = {"again": -18, "hard": 3, "good": 12, "easy": 20}


def calculate_schedule(
    *,
    rating: str,
    repetitions: int,
    interval_days: int,
    ease_factor: float,
    mastery_score: int,
    now: datetime | None = None,
) -> ReviewSchedule:
    """Return a deterministic, SM-2 inspired next-review schedule."""
    if rating not in RATING_QUALITY:
        raise ValueError(f"Unsupported rating: {rating}")

    now = now or datetime.now(UTC).replace(tzinfo=None)
    quality = RATING_QUALITY[rating]
    next_mastery = max(0, min(100, mastery_score + MASTERY_DELTA[rating]))

    if quality < 3:
        next_repetitions = 0
        next_interval = 0 if rating == "again" else 1
    else:
        next_repetitions = repetitions + 1
        if next_repetitions == 1:
            next_interval = 1 if rating == "good" else 2
        elif next_repetitions == 2:
            next_interval = 6 if rating == "good" else 8
        else:
            multiplier = ease_factor + (0.25 if rating == "easy" else 0)
            next_interval = max(1, round(max(1, interval_days) * multiplier))

    next_ease = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    next_ease = max(1.3, min(3.0, next_ease))
    status = "mastered" if next_mastery >= 80 and next_repetitions >= 3 else "learning"

    delay = timedelta(minutes=10) if rating == "again" else timedelta(days=next_interval)
    return ReviewSchedule(
        repetitions=next_repetitions,
        interval_days=next_interval,
        ease_factor=round(next_ease, 2),
        mastery_score=next_mastery,
        status=status,
        next_review_at=now + delay,
    )
