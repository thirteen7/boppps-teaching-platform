from app import create_app
from extensions import db
from models import User, SystemLog, Course, ClassGroup, LessonPlan, BOPPPSContent, Assessment, Question, Submission, AIProviderConfig, QuestionBankItem
from werkzeug.security import generate_password_hash  # 引入加密

app = create_app()

if __name__ == '__main__':
    with app.app_context():
        print(">>> ⚠️ 警告：正在删除所有旧数据表...")
        db.drop_all()
        print(">>> 🛠️ 正在创建新表...")
        db.create_all()

        print(">>> 👤正在初始化默认用户 (密码: 123)...")
        # 密码统一使用 123，但存入数据库时是加密的乱码
        pwd_hash = generate_password_hash('123')

        if not User.query.filter_by(username='admin').first():
            db.session.add(User(username='admin', password=pwd_hash, role='admin', name='系统管理员'))
            db.session.add(User(username='teacher', password=pwd_hash, role='teacher', name='王老师'))
            db.session.add(User(username='teacher2', password=pwd_hash, role='teacher', name='赵老师'))
            db.session.add(User(username='student', password=pwd_hash, role='student', name='李同学', major='人工智能', class_name='人工智能1班'))
            db.session.add(User(username='student2', password=pwd_hash, role='student', name='王同学', major='人工智能', class_name='人工智能1班'))
            db.session.add(User(username='student_ai2_01', password=pwd_hash, role='student', name='张同学', major='人工智能', class_name='人工智能2班'))
            db.session.add(User(username='student_ai2_02', password=pwd_hash, role='student', name='刘同学', major='人工智能', class_name='人工智能2班'))
            db.session.add(User(username='student_ai3_01', password=pwd_hash, role='student', name='陈同学', major='人工智能', class_name='人工智能3班'))
            db.session.add(User(username='student_ai3_02', password=pwd_hash, role='student', name='杨同学', major='人工智能', class_name='人工智能3班'))
            db.session.commit()

        print(">>> ✅ 数据库重置完毕！请运行 python app.py")
