from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.schemas.workspace import DayRecord, MonthRecords
from app.services.learning_insights import local_today
from app.services.records import period_records

router = APIRouter(prefix="/records", tags=["学习日历"])


@router.get("", response_model=MonthRecords)
def month_records(month: str = Query(pattern=r"^\d{4}-\d{2}$"), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        start = date.fromisoformat(month + "-01")
        if not 2000 <= start.year <= 2100:
            raise ValueError()
        end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    except ValueError as exc:
        raise HTTPException(422, "月份无效") from exc
    return MonthRecords(month=month, timezone=user.timezone, today=local_today(user), days=period_records(db, user, start, end))


@router.get("/{day}", response_model=DayRecord)
def day_record(day: date, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not 2000 <= day.year <= 2100:
        raise HTTPException(422, "日期无效")
    return period_records(db, user, day, day + timedelta(days=1))[0]
