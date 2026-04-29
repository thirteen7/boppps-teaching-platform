from sqlalchemy.exc import OperationalError

from app import create_app, ensure_default_users
from extensions import db


def main():
    app = create_app()
    with app.app_context():
        db.create_all()
        ensure_default_users()


if __name__ == "__main__":
    try:
        main()
    except OperationalError as exc:
        raise SystemExit(f"Database init failed: {exc}") from exc
