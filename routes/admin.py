import json
from datetime import datetime, timedelta

from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity
from werkzeug.security import generate_password_hash

from extensions import db
from models import User, SystemLog, AIProviderConfig
from services.llm_service import LLMService
from utils import admin_required, api_response, log_action

admin_bp = Blueprint('admin', __name__)

DEFAULT_USERNAMES = {'admin', 'teacher', 'student'}


def _current_admin():
    current_admin = get_jwt_identity()
    if isinstance(current_admin, str):
        try:
            current_admin = json.loads(current_admin)
        except Exception:
            current_admin = {}
    return current_admin


def _log_level(action):
    text = (action or "").lower()
    if any(x in text for x in ["failed", "error", "denied", "forbidden", "删除", "打回", "重置密码"]):
        return "warning"
    if any(x in text for x in ["login", "登录", "created", "添加", "创建", "提交", "推送"]):
        return "info"
    return "normal"


@admin_bp.route('/users', methods=['GET'])
@admin_required()
def get_users():
    users = User.query.order_by(User.id.asc()).all()
    result = [
        {
            'id': user.id,
            'username': user.username,
            'role': user.role,
            'name': user.name,
            'major': user.major,
            'class_name': user.class_name,
            'created_at': user.created_at.strftime('%Y-%m-%d'),
        }
        for user in users
    ]
    return api_response(data=result)


@admin_bp.route('/users', methods=['POST'])
@admin_required()
def add_user():
    data = request.get_json()
    if User.query.filter_by(username=data['username']).first():
        return api_response(msg='Username already exists', code=400)
    role = data.get('role')
    major = (data.get('major') or '').strip() or None
    class_name = (data.get('class_name') or '').strip() or None
    if role == 'student':
        major = major or '人工智能'
        class_name = class_name or '人工智能1班'

    new_user = User(
        username=data['username'],
        password=generate_password_hash(data['password']),
        role=role,
        name=data.get('name', ''),
        major=major,
        class_name=class_name,
    )
    db.session.add(new_user)
    db.session.commit()

    current_admin = _current_admin()
    log_action(current_admin.get('id'), current_admin.get('username'), f'Added user: {new_user.username}')
    return api_response(msg='User created', code=201, data={'id': new_user.id})


@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
@admin_required()
def delete_user(user_id):
    current_admin = _current_admin()
    user = User.query.get_or_404(user_id)

    if user.username in DEFAULT_USERNAMES:
        return api_response(msg='Default users cannot be deleted', code=400)

    if user.id == current_admin.get('id'):
        return api_response(msg='You cannot delete the current admin user', code=400)

    user.enrolled_courses.clear()
    db.session.delete(user)
    db.session.commit()

    log_action(current_admin.get('id'), current_admin.get('username'), f'Deleted user: {user.username}')
    return api_response(msg='User deleted')


@admin_bp.route('/users/<int:user_id>/reset-password', methods=['POST'])
@admin_required()
def reset_user_password(user_id):
    current_admin = _current_admin()
    user = User.query.get_or_404(user_id)
    user.password = generate_password_hash('123')
    db.session.commit()
    log_action(current_admin.get('id'), current_admin.get('username'), f'Reset password for user: {user.username}')
    return api_response(msg='Password reset to 123')


@admin_bp.route('/logs', methods=['GET'])
@admin_required()
def get_logs():
    base_query = SystemLog.query

    keyword = (request.args.get('keyword') or '').strip()
    username = (request.args.get('username') or '').strip()
    action = (request.args.get('action') or '').strip()
    date_from = (request.args.get('date_from') or '').strip()
    date_to = (request.args.get('date_to') or '').strip()
    sort_by = (request.args.get('sort_by') or 'time').strip()
    order = (request.args.get('order') or 'desc').strip().lower()
    with_meta = request.args.get('with_meta') in ['1', 'true', 'yes']
    page = request.args.get('page', type=int) or 1
    raw_per_page = request.args.get('per_page', type=int)
    per_page = raw_per_page if raw_per_page is not None else (20 if with_meta else 100)

    query = base_query

    if username:
        query = query.filter(SystemLog.username.like(f'%{username}%'))
    if action:
        query = query.filter(SystemLog.action.like(f'%{action}%'))
    if keyword:
        query = query.filter(
            db.or_(
                SystemLog.username.like(f'%{keyword}%'),
                SystemLog.action.like(f'%{keyword}%'),
                SystemLog.ip_address.like(f'%{keyword}%')
            )
        )

    if date_from:
        try:
            start_dt = datetime.strptime(date_from, '%Y-%m-%d')
            query = query.filter(SystemLog.timestamp >= start_dt)
        except ValueError:
            pass
    if date_to:
        try:
            end_dt = datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)
            query = query.filter(SystemLog.timestamp < end_dt)
        except ValueError:
            pass

    sort_column = SystemLog.timestamp
    if sort_by == 'username':
        sort_column = SystemLog.username
    elif sort_by == 'action':
        sort_column = SystemLog.action

    if order == 'asc':
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    per_page = max(1, min(per_page, 200))
    page = max(1, page)
    total = query.count()
    logs = query.offset((page - 1) * per_page).limit(per_page).all()

    items = [
        {
            'id': log.id,
            'user_id': log.user_id,
            'username': log.username,
            'action': log.action,
            'ip': log.ip_address,
            'level': _log_level(log.action),
            'time': log.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
        }
        for log in logs
    ]
    if with_meta:
        now = datetime.utcnow()
        day_start = datetime(now.year, now.month, now.day)
        week_start = now - timedelta(days=7)
        active_users = db.session.query(SystemLog.username).filter(SystemLog.username.isnot(None)).distinct().count()
        return api_response(data={
            'items': items,
            'page': page,
            'per_page': per_page,
            'total': total,
            'total_pages': (total + per_page - 1) // per_page,
            'summary': {
                'today_count': base_query.filter(SystemLog.timestamp >= day_start).count(),
                'week_count': base_query.filter(SystemLog.timestamp >= week_start).count(),
                'active_users': active_users,
            }
        })
    return api_response(data=items)


def _provider_to_dict(item):
    return {
        'id': item.id,
        'provider_type': item.provider_type,
        'name': item.name,
        'base_url': item.base_url,
        'api_key_masked': ('*' * 8 + item.api_key[-4:]) if item.api_key else '',
        'model': item.model,
        'enabled': bool(item.enabled),
        'is_default': bool(item.is_default),
        'extra_json': item.extra_json or {},
        'created_at': item.created_at.strftime('%Y-%m-%d %H:%M:%S'),
        'updated_at': item.updated_at.strftime('%Y-%m-%d %H:%M:%S'),
    }


@admin_bp.route('/ai/providers', methods=['GET'])
@admin_required()
def list_ai_providers():
    items = AIProviderConfig.query.order_by(AIProviderConfig.id.asc()).all()
    return api_response(data=[_provider_to_dict(item) for item in items])


@admin_bp.route('/ai/providers', methods=['POST'])
@admin_required()
def create_ai_provider():
    data = request.get_json(silent=True) or {}
    provider_type = (data.get('provider_type') or '').strip()
    name = (data.get('name') or '').strip()
    base_url = (data.get('base_url') or '').strip().rstrip('/')
    model = (data.get('model') or '').strip()

    if provider_type not in ['ollama', 'openai_compatible']:
        return api_response(msg='Invalid provider_type', code=400)
    if not name or not base_url or not model:
        return api_response(msg='name/base_url/model are required', code=400)

    item = AIProviderConfig(
        provider_type=provider_type,
        name=name,
        base_url=base_url,
        api_key=(data.get('api_key') or '').strip() or None,
        model=model,
        enabled=bool(data.get('enabled', True)),
        is_default=bool(data.get('is_default', False)),
        extra_json=data.get('extra_json') if isinstance(data.get('extra_json'), dict) else {},
    )

    if item.is_default:
        AIProviderConfig.query.update({'is_default': False}, synchronize_session=False)
    db.session.add(item)
    db.session.commit()

    current_admin = _current_admin()
    log_action(current_admin.get('id'), current_admin.get('username'), f'Created AI provider: {item.name}')
    return api_response(msg='AI provider created', code=201, data=_provider_to_dict(item))


@admin_bp.route('/ai/providers/<int:provider_id>', methods=['PUT'])
@admin_required()
def update_ai_provider(provider_id):
    current_admin = _current_admin()
    item = AIProviderConfig.query.get_or_404(provider_id)
    data = request.get_json(silent=True) or {}

    provider_type = data.get('provider_type')
    if provider_type is not None:
        if provider_type not in ['ollama', 'openai_compatible']:
            return api_response(msg='Invalid provider_type', code=400)
        item.provider_type = provider_type
    if data.get('name') is not None:
        item.name = (data.get('name') or '').strip() or item.name
    if data.get('base_url') is not None:
        item.base_url = (data.get('base_url') or '').strip().rstrip('/') or item.base_url
    if data.get('model') is not None:
        item.model = (data.get('model') or '').strip() or item.model
    if data.get('api_key') is not None:
        item.api_key = (data.get('api_key') or '').strip() or None
    if data.get('enabled') is not None:
        item.enabled = bool(data.get('enabled'))
    if data.get('extra_json') is not None and isinstance(data.get('extra_json'), dict):
        item.extra_json = data.get('extra_json')
    if data.get('is_default') is not None:
        if bool(data.get('is_default')):
            AIProviderConfig.query.update({'is_default': False}, synchronize_session=False)
            item.is_default = True
        else:
            item.is_default = False

    db.session.commit()
    log_action(current_admin.get('id'), current_admin.get('username'), f'Updated AI provider: {item.name}')
    return api_response(msg='AI provider updated', data=_provider_to_dict(item))


@admin_bp.route('/ai/providers/<int:provider_id>', methods=['DELETE'])
@admin_required()
def delete_ai_provider(provider_id):
    current_admin = _current_admin()
    item = AIProviderConfig.query.get_or_404(provider_id)
    provider_name = item.name
    db.session.delete(item)
    db.session.commit()
    log_action(current_admin.get('id'), current_admin.get('username'), f'Deleted AI provider: {provider_name}')
    return api_response(msg='AI provider deleted')


@admin_bp.route('/ai/providers/<int:provider_id>/test', methods=['POST'])
@admin_required()
def test_ai_provider(provider_id):
    current_admin = _current_admin()
    item = AIProviderConfig.query.get_or_404(provider_id)
    provider = {
        'provider_type': item.provider_type,
        'base_url': item.base_url,
        'api_key': item.api_key or '',
        'model': item.model,
        'extra_json': item.extra_json or {},
    }
    try:
        result = LLMService.test_provider_connection(provider)
    except Exception as err:
        log_action(current_admin.get('id'), current_admin.get('username'), f'Test AI provider failed: {item.name}, {err}')
        return api_response(msg=f'AI provider test failed: {err}', code=500)
    if not result.get('ok'):
        log_action(current_admin.get('id'), current_admin.get('username'), f'Test AI provider failed: {item.name}')
        return api_response(msg='AI provider test failed', code=400, data=result)
    log_action(current_admin.get('id'), current_admin.get('username'), f'Test AI provider success: {item.name}')
    return api_response(msg='AI provider test success', data=result)
