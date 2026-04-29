from flask import request, jsonify
from functools import wraps
from flask_jwt_extended import get_jwt_identity, jwt_required
from extensions import db
from models import SystemLog
import json

# 记录日志的辅助函数
def log_action(user_id, username, action):
    try:
        # 简单的防空判断
        if not user_id: return
        log = SystemLog(
            user_id=user_id,
            username=username,
            action=action,
            ip_address=request.remote_addr or '127.0.0.1'
        )
        db.session.add(log)
        db.session.commit()
    except Exception as e:
        print(f"日志记录失败: {e}")

# RBAC 核心：角色检查装饰器
# 使用方法: @role_required(['admin', 'teacher'])
def role_required(allowed_roles):
    def wrapper(fn):
        @wraps(fn)
        @jwt_required()
        def decorator(*args, **kwargs):
            current_user = get_jwt_identity()
            # 如果身份存为 JSON 字符串，则反序列化
            if isinstance(current_user, str):
                try:
                    current_user = json.loads(current_user)
                except Exception:
                    current_user = {}

            if isinstance(current_user, dict) and current_user.get('role') in allowed_roles:
                return fn(*args, **kwargs)
            else:
                return jsonify(msg=f"权限不足：需要 {allowed_roles} 角色"), 403
        return decorator
    return wrapper

# 快捷方式：仅管理员
def admin_required():
    return role_required(['admin'])

# === 统一响应格式 ===

def api_response(data=None, msg="Success", code=200):
   """
   统一 API 响应格式
   :param data: 返回的数据 payload
   :param msg: 状态描述信息
   :param code: HTTP 状态码（默认 200）
   :return: JSON Response
   """
   return jsonify({
       "code": code,
       "msg": msg,
       "data": data,
   }), code

# === 统一错误码 ===

class APIException(Exception):
    def __init__(self, msg="Internal Server Error", code=500, data=None):
        self.msg = msg
        self.code = code
        self.data = data
        super().__init__(self.msg)
