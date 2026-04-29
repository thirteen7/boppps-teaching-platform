import os


# Configuration values (DB URI, secrets, etc.) will live here.

class Config:
    # 数据库配置
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'SQLALCHEMY_DATABASE_URI',
        'mysql+pymysql://koppps:rootroot@localhost:3306/koppps?charset=utf8mb4',
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        # Verify pooled connection liveness before each checkout.
        'pool_pre_ping': True,
        # Recycle connections periodically to stay below MySQL idle timeout.
        'pool_recycle': 1800,
        'pool_timeout': 30,
        'pool_size': 10,
        'max_overflow': 20,
    }

    # JWT 密钥
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'super-secret-key')

    # LLM 配置
    OLLAMA_MODEL = os.getenv('OLLAMA_MODEL', 'qwen3:30b')

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads', 'resources')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024
