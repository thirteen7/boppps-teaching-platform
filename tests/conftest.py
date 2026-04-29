import shutil
import sys
from pathlib import Path

import pytest
from werkzeug.security import generate_password_hash

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import create_app
from extensions import db
from models import User


TEST_RUNTIME_DIR = ROOT_DIR / "tests" / "_runtime"


@pytest.fixture()
def app():
    if TEST_RUNTIME_DIR.exists():
        shutil.rmtree(TEST_RUNTIME_DIR, ignore_errors=True)
    TEST_RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

    db_path = TEST_RUNTIME_DIR / "test.db"
    upload_dir = TEST_RUNTIME_DIR / "uploads"

    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}",
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "JWT_SECRET_KEY": "test-secret-key",
        "UPLOAD_FOLDER": str(upload_dir),
    })

    with app.app_context():
        db.create_all()
        db.session.add_all([
            User(username="admin", password=generate_password_hash("123"), role="admin", name="Admin"),
            User(username="teacher", password=generate_password_hash("123"), role="teacher", name="Teacher"),
            User(username="student", password=generate_password_hash("123"), role="student", name="Student"),
            User(username="student2", password=generate_password_hash("123"), role="student", name="Student Two"),
        ])
        db.session.commit()

    yield app

    with app.app_context():
        db.session.remove()
        db.drop_all()
    shutil.rmtree(TEST_RUNTIME_DIR, ignore_errors=True)


@pytest.fixture()
def client(app):
    return app.test_client()


def _login(client, username, password="123"):
    response = client.post("/api/auth/login", json={
        "username": username,
        "password": password,
    })
    assert response.status_code == 200, response.get_json()
    payload = response.get_json()
    return payload["data"]["token"]


@pytest.fixture()
def login(client):
    return lambda username, password="123": _login(client, username, password)


@pytest.fixture()
def auth_headers(login):
    def factory(username, password="123"):
        token = login(username, password)
        return {"Authorization": f"Bearer {token}"}

    return factory
