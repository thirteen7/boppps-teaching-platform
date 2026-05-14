import os
from pathlib import Path

from flask import Flask, abort, send_from_directory
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from werkzeug.security import generate_password_hash

from config import Config
from extensions import cors, db, jwt
from models import User
from routes.admin import admin_bp
from routes.auth import auth_bp
from routes.teaching import teaching_bp


def _register_frontend_spa(app):
    """Serve the React production build when present (Docker / packaged deploy)."""
    build_dir = Path(app.config['BASE_DIR']).joinpath('frontend', 'build')
    index_html = build_dir.joinpath('index.html')
    if not index_html.is_file():
        return

    root_files = {
        'asset-manifest.json',
        'favicon.ico',
        'logo192.png',
        'logo512.png',
        'manifest.json',
        'robots.txt',
    }

    def _under_build(candidate: Path):
        resolved = candidate.resolve()
        root = build_dir.resolve()
        return resolved == root or root in resolved.parents

    @app.route('/')
    def _spa_root():
        return send_from_directory(build_dir, 'index.html')

    @app.get('/<path:path>')
    def _spa_deep_link(path: str):
        if path == 'api' or path.startswith('api/'):
            abort(404)
        try:
            if path in root_files:
                fp = build_dir.joinpath(Path(path))
                if fp.is_file() and _under_build(fp):
                    return send_from_directory(build_dir, fp.name)

            nested = build_dir.joinpath(Path(path)).resolve()
            if nested.is_file() and _under_build(nested):
                rel = nested.relative_to(build_dir.resolve())
                return send_from_directory(build_dir, str(rel).replace(os.sep, '/'))

            return send_from_directory(build_dir, 'index.html')
        except ValueError:
            return send_from_directory(build_dir, 'index.html')


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.from_object(Config)

    if test_config:
        app.config.update(test_config)

    db.init_app(app)
    jwt.init_app(app)
    cors.init_app(app)

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(teaching_bp, url_prefix='/api/teaching')

    from utils import APIException, api_response

    @app.errorhandler(APIException)
    def handle_api_exception(error):
        return api_response(msg=error.msg, code=error.code, data=error.data)

    @app.errorhandler(400)
    def bad_request(_error):
        return api_response(msg='Bad Request', code=400)

    @app.errorhandler(401)
    def unauthorized(_error):
        return api_response(msg='Unauthorized', code=401)

    @app.errorhandler(403)
    def forbidden(_error):
        return api_response(msg='Forbidden', code=403)

    @app.errorhandler(404)
    def not_found(_error):
        return api_response(msg='Not Found', code=404)

    @app.errorhandler(500)
    def internal_server_error(_error):
        return api_response(msg='Internal Server Error', code=500)

    @app.errorhandler(OperationalError)
    def handle_operational_error(_error):
        db.session.rollback()
        return api_response(msg='Database connection lost, please retry', code=503)

    @app.errorhandler(SQLAlchemyError)
    def handle_sqlalchemy_error(_error):
        db.session.rollback()
        return api_response(msg='Database operation failed', code=500)

    @app.teardown_appcontext
    def cleanup_session(_error=None):
        db.session.remove()

    _register_frontend_spa(app)

    return app


def ensure_default_users():
    default_users = [
        ('admin', 'admin', 'Admin'),
        ('teacher', 'teacher', 'Teacher'),
        ('student', 'student', 'Student'),
    ]

    changed = False
    for username, role, name in default_users:
        user = User.query.filter_by(username=username).first()
        if not user:
            db.session.add(
                User(
                    username=username,
                    password=generate_password_hash('123'),
                    role=role,
                    name=name,
                )
            )
            changed = True
            continue

        if user.password == '123':
            user.password = generate_password_hash('123')
            changed = True

        if not user.role:
            user.role = role
            changed = True

        if not user.name:
            user.name = name
            changed = True

    if changed:
        db.session.commit()


if __name__ == '__main__':
    app = create_app()

    with app.app_context():
        db.create_all()
        ensure_default_users()

    print('>>> Server running at http://127.0.0.1:5000')
    app.run(debug=True, port=5000)
