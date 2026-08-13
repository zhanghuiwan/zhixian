from datetime import datetime

from app.services.spaced_repetition import calculate_schedule


def test_again_resets_repetitions_and_schedules_soon():
    now = datetime(2026, 8, 12, 10, 0)
    result = calculate_schedule(rating="again", repetitions=3, interval_days=14, ease_factor=2.5, mastery_score=70, now=now)
    assert result.repetitions == 0
    assert result.interval_days == 0
    assert result.next_review_at > now
    assert result.next_review_at.date() == now.date()


def test_good_reviews_grow_interval():
    first = calculate_schedule(rating="good", repetitions=0, interval_days=0, ease_factor=2.5, mastery_score=0)
    second = calculate_schedule(rating="good", repetitions=first.repetitions, interval_days=first.interval_days, ease_factor=first.ease_factor, mastery_score=first.mastery_score)
    assert first.interval_days == 1
    assert second.interval_days == 6
    assert second.mastery_score > first.mastery_score

