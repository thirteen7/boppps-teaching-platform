#!/bin/sh
set -e
cd /app
python <<'PY'
from app import create_app, ensure_default_users
from extensions import db

app = create_app()
with app.app_context():
    db.create_all()
    ensure_default_users()
PY
exec gunicorn --bind 0.0.0.0:5000 --workers 2 --timeout 120 'app:create_app()'
