"""Continue in the current book, independently of the daily learning target."""
from datetime import timedelta

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import User, UserWordProgress, Word, WordbookWord
from app.models.entities import utc_now


def complete_group(client, headers, items, session_id):
    response = client.post('/api/v1/study/sessions/complete', headers=headers, json={
        'session_id': session_id, 'mode': 'new',
        'source_kind': items[0]['source_kind'], 'source_id': items[0]['source_id'],
        'started_at': '2026-10-21T00:00:00Z', 'round_count': 1,
        'words': [{
            'word_id': i['word']['id'], 'mode': 'new',
            'source_kind': i['source_kind'], 'source_id': i['source_id'],
            'attempts': [{'score': 90, 'answer_kind': 'remembered', 'round_no': 1}],
        } for i in items],
    })
    assert response.status_code == 200


def second_user(client):
    account = client.post('/api/v1/auth/register', json={
        'email': 'other@example.com', 'password': 'Strong123!', 'nickname': 'Other',
    }).json()
    return {'Authorization': f"Bearer {account['access_token']}"}


def test_next_groups_exceed_daily_target_without_repeating_or_leaving_book(client, auth_headers):
    client.patch('/api/v1/users/me', headers=auth_headers, json={'daily_new_words': 1})
    with SessionLocal() as db:
        user = db.scalar(select(User))
        book_id = user.selected_wordbook_id
        extra = [Word(term=t, translation='示例', definitions=[]) for t in ['alpha', 'beta', 'gamma']]
        outside = Word(term='outside', translation='书外词', definitions=[])
        db.add_all([*extra, outside])
        db.flush()
        db.add_all([WordbookWord(wordbook_id=book_id, word_id=w.id, position=i+3) for i,w in enumerate(extra)])
        # Collecting a word may create a progress row without any actual rating.
        db.add(UserWordProgress(user_id=user.id, word_id=extra[0].id))
        db.commit()
        outside_id = outside.id
    client.post('/api/v1/vocabulary', headers=auth_headers, json={'word_id': outside_id})

    first = client.get('/api/v1/study/queue?mode=new&limit=2', headers=auth_headers).json()
    assert first['remaining_new_count'] == 5
    assert len(first['items']) == 1
    seen = {first['items'][0]['word']['id']}
    complete_group(client, auth_headers, first['items'], 'daily-target-first-group')
    capped = client.get('/api/v1/study/queue?mode=new', headers=auth_headers).json()
    assert capped['items'] == []
    assert capped['empty_reason'] == 'daily_goal_reached'
    assert capped['remaining_new_count'] == 4

    for index, remaining in enumerate([4, 2]):
        response = client.get('/api/v1/study/queue?next_group=true&limit=2', headers=auth_headers)
        assert response.status_code == 200
        group = response.json()
        assert group['remaining_new_count'] == remaining
        assert group['source_id'] == book_id
        assert len(group['items']) == 2
        ids = {i['word']['id'] for i in group['items']}
        assert not seen.intersection(ids)
        assert outside_id not in ids
        assert all(i['mode'] == 'new' for i in group['items'])
        seen.update(ids)
        complete_group(client, auth_headers, group['items'], f'continuation-group-{index}')

    exhausted = client.get('/api/v1/study/queue?next_group=true', headers=auth_headers).json()
    assert exhausted['items'] == []
    assert exhausted['remaining_new_count'] == 0
    assert exhausted['empty_reason'] == 'book_completed'
    assert len(seen) == 5
    other = client.get('/api/v1/study/queue?next_group=true', headers=second_user(client)).json()
    assert len(other['items']) == 5
    assert other['remaining_new_count'] == 5


def test_next_group_uses_selected_personal_book_and_checks_ownership(client, auth_headers):
    book = client.post('/api/v1/library/personal', headers=auth_headers, json={'name':'当前个人词书'}).json()
    client.post(f"/api/v1/library/personal/{book['id']}/words", headers=auth_headers, json={'terms':['wander']})
    client.post(f"/api/v1/library/personal/{book['id']}/select", headers=auth_headers)
    result = client.get('/api/v1/study/queue?next_group=true', headers=auth_headers).json()
    assert result['source_kind'] == 'personal'
    assert result['source_id'] == book['id']
    assert [i['word']['term'] for i in result['items']] == ['wander']
    system = client.get('/api/v1/wordbooks', headers=auth_headers).json()[0]
    scoped = client.get(f"/api/v1/study/queue?next_group=true&kind=system&source_id={system['id']}", headers=auth_headers).json()
    assert scoped['source_kind'] == 'system'
    assert len(scoped['items']) == 2
    assert client.get(f"/api/v1/study/queue?next_group=true&kind=personal&source_id={book['id']}", headers=second_user(client)).status_code == 404
    assert client.get('/api/v1/study/queue?next_group=true').status_code == 401
    assert client.get('/api/v1/study/queue?next_group=true&kind=system&source_id=999999', headers=auth_headers).status_code == 404


def test_continue_after_review_only_returns_unseen_words(client, auth_headers):
    first = client.get('/api/v1/study/queue?mode=new&limit=1', headers=auth_headers).json()
    complete_group(client, auth_headers, first['items'], 'review-then-new-group')
    with SessionLocal() as db:
        progress = db.scalar(select(UserWordProgress))
        progress.next_review_at = utc_now() - timedelta(days=1)
        db.commit()
    ordinary = client.get('/api/v1/study/queue?mode=review', headers=auth_headers).json()
    assert ordinary['items'][0]['mode'] == 'review'
    following = client.get('/api/v1/study/queue?mode=review&next_group=true', headers=auth_headers).json()
    assert len(following['items']) == 1
    assert following['items'][0]['mode'] == 'new'
    assert following['items'][0]['word']['id'] != first['items'][0]['word']['id']


def test_next_group_requires_a_current_book(client, auth_headers):
    with SessionLocal() as db:
        user = db.scalar(select(User))
        user.selected_wordbook_id = None
        user.selected_collection_id = None
        db.commit()
    response = client.get('/api/v1/study/queue?next_group=true', headers=auth_headers)
    assert response.status_code == 409
    assert response.json()['detail'] == '请先选择词书'
