from app import create_app, ensure_default_users
from extensions import db

app = create_app()

with app.app_context():
    db.create_all()
    ensure_default_users()
