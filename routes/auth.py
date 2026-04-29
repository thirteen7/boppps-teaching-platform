from flask import Blueprint, request
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from models import User
from extensions import db
from utils import log_action, api_response
import json

auth_bp = Blueprint('auth', __name__)


# 1. 用户注册 (开放给学生注册)
@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    name = data.get('name')

    if User.query.filter_by(username=username).first():
        return api_response(msg='用户名已存在', code=400)

    # 默认注册为学生
    new_user = User(
        username=username,
        password=generate_password_hash(password),  # 加密存储
        role='student',
        name=name
    )
    db.session.add(new_user)
    db.session.commit()

    log_action(new_user.id, new_user.username, "用户自主注册")
    return api_response(msg='注册成功，请登录', code=201)


# 2. 用户登录
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    user = User.query.filter_by(username=username).first()

    # 验证哈希密码
    if user and check_password_hash(user.password, password):
        identity = {'id': user.id, 'username': user.username, 'role': user.role, 'name': user.name}
        # store identity as a JSON string inside the token
        access_token = create_access_token(identity=json.dumps(identity))
        log_action(user.id, user.username, "用户登录")

        return api_response(msg='Login successful', data={
            'token': access_token,
            'role': user.role,
            'username': user.username,
            'name': user.name
        })
    else:
        return api_response(msg='用户名或密码错误', code=401)


# 3. 修改密码
@auth_bp.route('/change-password', methods=['POST'])
@jwt_required()
def change_password():
    current_user_identity = get_jwt_identity()
    # token stored identity as json string, convert back safely
    if isinstance(current_user_identity, str):
        try:
            current_user_identity = json.loads(current_user_identity)
        except Exception:
            current_user_identity = {}

    user_id = current_user_identity.get('id')
    data = request.get_json()

    old_password = data.get('old_password')
    new_password = data.get('new_password')

    user = User.query.get(user_id)

    if not user or not check_password_hash(user.password, old_password):
        return api_response(msg='原密码错误', code=400)

    user.password = generate_password_hash(new_password)
    db.session.commit()

    log_action(user.id, user.username, "修改密码")
    return api_response(msg='密码修改成功')


# 3. 获取当前用户信息
@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_me():
    current_user = get_jwt_identity()
    if isinstance(current_user, str):
        try:
            current_user = json.loads(current_user)
        except Exception:
            current_user = {}

    return api_response(data=current_user)
