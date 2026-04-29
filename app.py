from flask import Flask
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from werkzeug.security import generate_password_hash

from config import Config
from extensions import cors, db, jwt
from models import User
from routes.admin import admin_bp
from routes.auth import auth_bp
from routes.teaching import teaching_bp


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
