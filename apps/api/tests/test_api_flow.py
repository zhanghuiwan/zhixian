def test_complete_learning_and_reading_flow(client, auth_headers):
    books = client.get("/api/v1/wordbooks", headers=auth_headers)
    assert books.status_code == 200
    book_id = books.json()[0]["id"]
    assert client.post(f"/api/v1/wordbooks/{book_id}/select", headers=auth_headers).status_code == 200

    queue = client.get("/api/v1/study/queue", headers=auth_headers)
    assert queue.status_code == 200
    assert queue.json()["new_count"] == 2
    word_id = queue.json()["items"][0]["word"]["id"]

    review = client.post("/api/v1/study/reviews", headers=auth_headers, json={"word_id": word_id, "rating": "good"})
    assert review.status_code == 200
    assert review.json()["interval_days"] == 1

    added = client.post("/api/v1/vocabulary", headers=auth_headers, json={"word_id": word_id, "source_type": "article", "source_ref": "1"})
    assert added.status_code == 201
    vocabulary = client.get("/api/v1/vocabulary?q=tran", headers=auth_headers)
    assert vocabulary.status_code == 200
    assert len(vocabulary.json()) == 1

    articles = client.get("/api/v1/articles")
    article_id = articles.json()[0]["id"]
    detail = client.get(f"/api/v1/articles/{article_id}", headers=auth_headers)
    sentence_id = detail.json()["sentences"][0]["id"]
    bookmark = client.post(f"/api/v1/articles/sentences/{sentence_id}/bookmark", headers=auth_headers)
    assert bookmark.status_code == 200
    assert len(client.get("/api/v1/articles/bookmarks", headers=auth_headers).json()) == 1

    dashboard = client.get("/api/v1/dashboard", headers=auth_headers)
    assert dashboard.status_code == 200
    assert dashboard.json()["studied_today"] == 1
    assert dashboard.json()["vocabulary_count"] == 1


def test_user_data_is_isolated(client, auth_headers):
    book_id = client.get("/api/v1/wordbooks", headers=auth_headers).json()[0]["id"]
    client.post(f"/api/v1/wordbooks/{book_id}/select", headers=auth_headers)
    queue = client.get("/api/v1/study/queue", headers=auth_headers).json()
    client.post("/api/v1/vocabulary", headers=auth_headers, json={"word_id": queue["items"][0]["word"]["id"]})
    second = client.post("/api/v1/auth/register", json={"email": "second@example.com", "password": "Strong123!", "nickname": "Second"})
    second_headers = {"Authorization": f"Bearer {second.json()['access_token']}"}
    assert client.get("/api/v1/vocabulary", headers=second_headers).json() == []


def test_login_rejects_bad_password(client, auth_headers):
    response = client.post("/api/v1/auth/login", json={"email": "learner@example.com", "password": "wrong-password"})
    assert response.status_code == 401


def test_personal_books_reviews_records_and_reading_progress(client, auth_headers):
    created = client.post(
        "/api/v1/library/personal",
        headers=auth_headers,
        json={"name": "旅行表达", "description": "出行时使用"},
    )
    assert created.status_code == 201
    book_id = created.json()["id"]
    added = client.post(
        f"/api/v1/library/personal/{book_id}/words",
        headers=auth_headers,
        json={"terms": ["wander", "tranquil", "missing-term"]},
    )
    assert added.json() == {"added": 2, "existing": 0, "missing": ["missing-term"]}
    assert client.post(
        f"/api/v1/library/personal/{book_id}/select", headers=auth_headers
    ).status_code == 200
    detail = client.get(
        f"/api/v1/library/personal/{book_id}", headers=auth_headers
    ).json()
    assert detail["book"]["is_selected"] is True
    assert detail["total"] == 2

    queue = client.get(
        f"/api/v1/study/queue?kind=personal&source_id={book_id}&mode=new",
        headers=auth_headers,
    ).json()
    item = queue["items"][0]
    payload = {
        "word_id": item["word"]["id"],
        "rating": "good",
        "source_kind": "personal",
        "source_id": book_id,
        "request_id": "same-request-1234",
    }
    first = client.post("/api/v1/study/reviews", headers=auth_headers, json=payload)
    second = client.post("/api/v1/study/reviews", headers=auth_headers, json=payload)
    assert first.status_code == 200
    assert second.json() == first.json()

    article_id = client.get("/api/v1/articles", headers=auth_headers).json()[0]["id"]
    article = client.get(f"/api/v1/articles/{article_id}", headers=auth_headers).json()
    sentence = article["sentences"][0]
    custom = client.post(
        "/api/v1/sentences",
        headers=auth_headers,
        json={
            "text": sentence["text"],
            "translation": sentence["translation"],
            "article_id": article_id,
        },
    )
    assert custom.status_code == 201
    progress = client.put(
        f"/api/v1/articles/{article_id}/progress",
        headers=auth_headers,
        json={"position": 1, "percent": 55, "completed": False},
    )
    assert progress.json()["percent"] == 55
    month = __import__("datetime").datetime.now().strftime("%Y-%m")
    records = client.get(f"/api/v1/records?month={month}", headers=auth_headers)
    assert records.status_code == 200
    today = next(day for day in records.json()["days"] if day["date"] == records.json()["today"])
    assert today["word_count"] == 1
    assert today["reading_count"] == 1


def test_sentence_collection_is_user_scoped(client, auth_headers):
    created = client.post(
        "/api/v1/sentences",
        headers=auth_headers,
        json={"text": "A sentence saved by the first learner."},
    ).json()
    second = client.post(
        "/api/v1/auth/register",
        json={"email": "sentences-second@example.com", "password": "Strong123!", "nickname": "Second"},
    )
    second_headers = {"Authorization": f"Bearer {second.json()['access_token']}"}
    assert client.patch(
        f"/api/v1/sentences/{created['id']}",
        headers=second_headers,
        json={"translation": "", "note": "越权", "tags": []},
    ).status_code == 404
    assert all(item["id"] != created["id"] for item in client.get(
        "/api/v1/sentences", headers=second_headers
    ).json()["items"])

    updated = client.patch(
        f"/api/v1/sentences/{created['id']}",
        headers=auth_headers,
        json={"note": "只更新笔记"},
    )
    assert updated.status_code == 200
    assert updated.json()["note"] == "只更新笔记"
    assert updated.json()["translation"] == ""


def test_registration_seeds_example_sentence_collection_once(client):
    from app.db.example_content import EXAMPLE_ARTICLES
    from app.db.session import SessionLocal
    from app.models import Article, ArticleSentence

    with SessionLocal() as db:
        for source in EXAMPLE_ARTICLES:
            article_data = {key: value for key, value in source.items() if key != "sentences"}
            article = Article(**article_data)
            db.add(article)
            db.flush()
            db.add_all([
                ArticleSentence(
                    article_id=article.id,
                    position=position,
                    text=text,
                    translation=translation,
                )
                for position, (text, translation) in enumerate(source["sentences"], 1)
            ])
        db.commit()

    registered = client.post(
        "/api/v1/auth/register",
        json={"email": "examples@example.com", "password": "Strong123!", "nickname": "Examples"},
    )
    assert registered.status_code == 201
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    examples = client.get("/api/v1/sentences?source=example", headers=headers).json()["items"]
    assert len(examples) == 4
    assert all(item["is_example"] for item in examples)

    logged_in = client.post(
        "/api/v1/auth/login",
        json={"email": "examples@example.com", "password": "Strong123!"},
    )
    assert logged_in.status_code == 200
    assert len(client.get("/api/v1/sentences?source=example", headers=headers).json()["items"]) == 4


def test_custom_words_are_owned_labeled_and_available_for_study(
    client, auth_headers
):
    created = client.post(
        "/api/v1/vocabulary/custom-words",
        headers=auth_headers,
        json={
            "term": "moonbow",
            "phonetic": "/ˈmuːnboʊ/",
            "part_of_speech": "n.",
            "translation": "月虹",
            "definitions": [{"part_of_speech": "n.", "meaning": "月光形成的彩虹"}],
            "example": "A moonbow appeared above the waterfall.",
            "example_translation": "瀑布上方出现了一道月虹。",
        },
    )
    assert created.status_code == 201
    payload = created.json()
    assert payload["word"]["dictionary_source"] == "custom"
    assert payload["ownership_created"] is True

    lookup = client.get(
        "/api/v1/words/lookup?term=moonbow", headers=auth_headers
    )
    assert lookup.status_code == 200
    assert lookup.json()["dictionary_source"] == "custom"
    assert [
        word["term"]
        for word in client.get(
            "/api/v1/vocabulary/custom-words", headers=auth_headers
        ).json()
    ] == ["moonbow"]
    custom_vocabulary = client.get(
        "/api/v1/vocabulary?dictionary_source=custom", headers=auth_headers
    ).json()
    assert [item["word"]["term"] for item in custom_vocabulary] == ["moonbow"]

    collection_id = payload["collection_id"]
    client.post(
        f"/api/v1/library/personal/{collection_id}/select",
        headers=auth_headers,
    )
    queue = client.get(
        f"/api/v1/study/queue?kind=personal&source_id={collection_id}&mode=new",
        headers=auth_headers,
    ).json()
    assert queue["items"][0]["word"]["term"] == "moonbow"
    assert queue["items"][0]["word"]["dictionary_source"] == "custom"

    second = client.post(
        "/api/v1/auth/register",
        json={
            "email": "custom-word-second@example.com",
            "password": "Strong123!",
            "nickname": "Second",
        },
    )
    second_headers = {"Authorization": f"Bearer {second.json()['access_token']}"}
    assert client.get(
        "/api/v1/words/lookup?term=moonbow", headers=second_headers
    ).status_code == 404
    assert client.get(
        "/api/v1/vocabulary/custom-words", headers=second_headers
    ).json() == []
    assert client.post(
        "/api/v1/vocabulary",
        headers=second_headers,
        json={"word_id": payload["word"]["id"]},
    ).status_code == 404

    second_add = client.post(
        "/api/v1/vocabulary/custom-words",
        headers=second_headers,
        json={
            "term": "moonbow",
            "translation": "月虹",
            "definitions": [{"part_of_speech": "n.", "meaning": "月光形成的彩虹"}],
        },
    )
    assert second_add.status_code == 201
    assert second_add.json()["created"] is False
    assert second_add.json()["ownership_created"] is True
    assert client.get(
        "/api/v1/words/lookup?term=moonbow", headers=second_headers
    ).status_code == 200


def test_imported_article_is_private_and_idempotent(client, auth_headers):
    invalid = client.post(
        "/api/v1/articles/import-text",
        headers=auth_headers,
        json={"content": "这是一段没有英文正文的测试内容。"},
    )
    assert invalid.status_code == 422

    content = (
        "A long path crossed the quiet forest. "
        "Birds moved between the trees. The lake waited beyond them."
    )
    first = client.post(
        "/api/v1/articles/import-text",
        headers=auth_headers,
        json={"title": "A Quiet Path", "content": content},
    )
    repeated = client.post(
        "/api/v1/articles/import-text",
        headers=auth_headers,
        json={"title": "A Quiet Path", "content": content},
    )
    assert first.status_code == 201
    assert repeated.status_code == 201
    assert first.json()["id"] == repeated.json()["id"]
    article_id = first.json()["id"]
    detail = client.get(
        f"/api/v1/articles/{article_id}", headers=auth_headers
    ).json()
    assert detail["source_type"] == "user_import"
    assert len(detail["sentences"]) == 3

    second = client.post(
        "/api/v1/auth/register",
        json={
            "email": "article-import-second@example.com",
            "password": "Strong123!",
            "nickname": "Second",
        },
    )
    second_headers = {"Authorization": f"Bearer {second.json()['access_token']}"}
    assert client.get(
        f"/api/v1/articles/{article_id}", headers=second_headers
    ).status_code == 404
