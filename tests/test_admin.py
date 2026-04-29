def test_admin_user_management_and_logs(client, auth_headers):
    headers = auth_headers("admin")

    create_response = client.post("/api/admin/users", json={
        "username": "teacher_new",
        "password": "123",
        "role": "teacher",
        "name": "Teacher New",
    }, headers=headers)
    assert create_response.status_code == 201

    users_response = client.get("/api/admin/users", headers=headers)
    assert users_response.status_code == 200
    usernames = [item["username"] for item in users_response.get_json()["data"]]
    assert "teacher_new" in usernames

    logs_response = client.get("/api/admin/logs", headers=headers)
    assert logs_response.status_code == 200
    actions = [item["action"] for item in logs_response.get_json()["data"]]
    assert any("teacher_new" in action for action in actions)


def test_admin_create_student_with_major_and_class(client, auth_headers):
    headers = auth_headers("admin")
    create_response = client.post("/api/admin/users", json={
        "username": "student_profile_test",
        "password": "123",
        "role": "student",
        "name": "Student Profile",
        "major": "人工智能",
        "class_name": "人工智能2班",
    }, headers=headers)
    assert create_response.status_code == 201

    users_response = client.get("/api/admin/users", headers=headers)
    assert users_response.status_code == 200
    created = [item for item in users_response.get_json()["data"] if item["username"] == "student_profile_test"][0]
    assert created["major"] == "人工智能"
    assert created["class_name"] == "人工智能2班"


def test_admin_reset_user_password(client, auth_headers):
    headers = auth_headers("admin")
    create_response = client.post("/api/admin/users", json={
        "username": "reset_target_user",
        "password": "old-pass-123",
        "role": "student",
        "name": "Reset Target",
        "major": "人工智能",
        "class_name": "人工智能3班",
    }, headers=headers)
    assert create_response.status_code == 201
    user_id = create_response.get_json()["data"]["id"]

    reset_response = client.post(f"/api/admin/users/{user_id}/reset-password", headers=headers)
    assert reset_response.status_code == 200

    login_response = client.post("/api/auth/login", json={
        "username": "reset_target_user",
        "password": "123",
    })
    assert login_response.status_code == 200


def test_admin_ai_provider_crud_and_test(client, auth_headers, monkeypatch):
    headers = auth_headers("admin")

    create_response = client.post("/api/admin/ai/providers", json={
        "provider_type": "ollama",
        "name": "Local Ollama",
        "base_url": "http://127.0.0.1:11434",
        "model": "qwen3:30b",
        "enabled": True,
        "is_default": True,
        "extra_json": {"temperature": 0.2},
    }, headers=headers)
    assert create_response.status_code == 201
    provider_id = create_response.get_json()["data"]["id"]

    list_response = client.get("/api/admin/ai/providers", headers=headers)
    assert list_response.status_code == 200
    assert any(item["id"] == provider_id for item in list_response.get_json()["data"])

    monkeypatch.setattr(
        "routes.admin.LLMService.test_provider_connection",
        lambda _provider: {"ok": True, "models": ["qwen3:30b"], "probe": {"ok": True}},
    )
    test_response = client.post(f"/api/admin/ai/providers/{provider_id}/test", headers=headers)
    assert test_response.status_code == 200
    assert test_response.get_json()["data"]["ok"] is True

    update_response = client.put(f"/api/admin/ai/providers/{provider_id}", json={
        "model": "qwen3:14b",
        "is_default": True,
    }, headers=headers)
    assert update_response.status_code == 200
    assert update_response.get_json()["data"]["model"] == "qwen3:14b"

    delete_response = client.delete(f"/api/admin/ai/providers/{provider_id}", headers=headers)
    assert delete_response.status_code == 200
