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
