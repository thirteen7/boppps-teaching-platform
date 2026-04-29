def test_register_login_change_password_flow(client):
    register_response = client.post("/api/auth/register", json={
        "username": "new_student",
        "password": "abc123",
        "name": "New Student",
    })
    assert register_response.status_code == 201

    login_response = client.post("/api/auth/login", json={
        "username": "new_student",
        "password": "abc123",
    })
    assert login_response.status_code == 200
    token = login_response.get_json()["data"]["token"]

    me_response = client.get("/api/auth/me", headers={
        "Authorization": f"Bearer {token}"
    })
    assert me_response.status_code == 200
    assert me_response.get_json()["data"]["username"] == "new_student"

    change_response = client.post("/api/auth/change-password", json={
        "old_password": "abc123",
        "new_password": "new-pass-456",
    }, headers={"Authorization": f"Bearer {token}"})
    assert change_response.status_code == 200

    relogin_response = client.post("/api/auth/login", json={
        "username": "new_student",
        "password": "new-pass-456",
    })
    assert relogin_response.status_code == 200
