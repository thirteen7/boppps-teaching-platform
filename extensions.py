from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
import pymysql

# 注册 pymysql 驱动
pymysql.install_as_MySQLdb()

# 初始化插件实例（但不绑定 app，在 app.py 中绑定）
db = SQLAlchemy()
jwt = JWTManager()
cors = CORS()