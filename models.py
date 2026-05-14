# Database models (User, Course, etc.) will be defined in this module.

from datetime import UTC, datetime
from extensions import db


def utc_now():
    return datetime.now(UTC)

course_students = db.Table('course_students',
    db.Column('user_id', db.Integer, db.ForeignKey('users.id'), primary_key=True),
    db.Column('course_id', db.Integer, db.ForeignKey('courses.id'), primary_key=True)
)

# 1. 用户表
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False) # admin, teacher, student
    name = db.Column(db.String(50))
    major = db.Column(db.String(100), nullable=True)
    class_name = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)

    enrolled_courses = db.relationship('Course', secondary=course_students, lazy='subquery',
        backref=db.backref('students', lazy=True))

# 2. 系统日志表
class SystemLog(db.Model):
    __tablename__ = 'system_logs'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    username = db.Column(db.String(80))
    action = db.Column(db.String(200), nullable=False)
    ip_address = db.Column(db.String(50))
    timestamp = db.Column(db.DateTime, default=utc_now)


class AIProviderConfig(db.Model):
    __tablename__ = 'ai_provider_configs'
    id = db.Column(db.Integer, primary_key=True)
    provider_type = db.Column(db.String(30), nullable=False)  # ollama, openai_compatible
    name = db.Column(db.String(100), nullable=False)
    base_url = db.Column(db.String(255), nullable=False)
    api_key = db.Column(db.Text, nullable=True)
    model = db.Column(db.String(120), nullable=False)
    enabled = db.Column(db.Boolean, nullable=False, default=True)
    is_default = db.Column(db.Boolean, nullable=False, default=False)
    extra_json = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)

# 3. 课程表
class Course(db.Model):
    __tablename__ = 'courses'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(20), unique=True)
    objectives = db.Column(db.Text)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=utc_now)

    # Relationship to Lesson Plans
    lesson_plans = db.relationship('LessonPlan', backref='course', lazy=True)

# 4. 班级表
class ClassGroup(db.Model):
    __tablename__ = 'classes'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    major = db.Column(db.String(50))

# 5. 教案表 (LessonPlan)
class LessonPlan(db.Model):
    __tablename__ = 'lesson_plans'
    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)

    # Relationships
    boppps_contents = db.relationship('BOPPPSContent', backref='lesson_plan', lazy=True)
    assessments = db.relationship('Assessment', backref='lesson_plan', lazy=True)

# 6. BOPPPS 内容表 (BOPPPSContent)
class BOPPPSContent(db.Model):
    __tablename__ = 'boppps_contents'
    id = db.Column(db.Integer, primary_key=True)
    lesson_plan_id = db.Column(db.Integer, db.ForeignKey('lesson_plans.id'), nullable=False)
    # stage: bridge, outcome, pre_assessment, participatory, post_assessment, summary
    stage = db.Column(db.String(50), nullable=False)
    content = db.Column(db.Text) # Markdown or JSON content
    version = db.Column(db.Integer, default=1)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)

# 7. 测验表 (Assessment)
class Assessment(db.Model):
    __tablename__ = 'assessments'
    id = db.Column(db.Integer, primary_key=True)
    lesson_plan_id = db.Column(db.Integer, db.ForeignKey('lesson_plans.id'), nullable=False)
    type = db.Column(db.String(20), nullable=False) # pre_assessment, post_assessment
    title = db.Column(db.String(200))
    reveal_after_submit = db.Column(db.Boolean, nullable=False, default=False)
    is_pushed = db.Column(db.Boolean, nullable=False, default=False)
    pushed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)

    # Relationships
    questions = db.relationship('Question', backref='assessment', lazy=True)
    submissions = db.relationship('Submission', backref='assessment', lazy=True)

# 8. 题目表 (Question)
class Question(db.Model):
    __tablename__ = 'questions'
    id = db.Column(db.Integer, primary_key=True)
    assessment_id = db.Column(db.Integer, db.ForeignKey('assessments.id'), nullable=False)
    question_bank_item_id = db.Column(db.Integer, db.ForeignKey('question_bank_items.id'), nullable=True)
    content = db.Column(db.Text, nullable=False) # Question text
    q_type = db.Column(db.String(20), default='choice') # choice, text
    options = db.Column(db.JSON) # e.g. ["Option A", "Option B"]
    answer = db.Column(db.Text) # Correct answer
    explanation = db.Column(db.Text, nullable=True) # Teacher-facing explanation

# 9. 学生提交表 (Submission)
class Submission(db.Model):
    __tablename__ = 'submissions'
    id = db.Column(db.Integer, primary_key=True)
    assessment_id = db.Column(db.Integer, db.ForeignKey('assessments.id'), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    student = db.relationship('User', backref='submissions')
    answers = db.Column(db.JSON) # Student's answers
    score = db.Column(db.Float)
    status = db.Column(db.String(20), nullable=False, default='active')  # active, rejected
    reject_reason = db.Column(db.Text, nullable=True)
    submitted_at = db.Column(db.DateTime, default=utc_now)


class QuestionBankItem(db.Model):
    __tablename__ = 'question_bank_items'
    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    chapter_id = db.Column(db.Integer, db.ForeignKey('lesson_plans.id'), nullable=True)
    source = db.Column(db.String(20), nullable=False, default='manual')  # manual, ai
    difficulty = db.Column(db.Integer, nullable=False, default=3)  # 1-5
    tags = db.Column(db.JSON, nullable=True)
    stem = db.Column(db.Text, nullable=False)
    options = db.Column(db.JSON, nullable=False)
    answer = db.Column(db.Text, nullable=False)
    explanation = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    creator = db.relationship('User', backref='question_bank_items')
    created_at = db.Column(db.DateTime, default=utc_now)

# 5. 教学资源表
class Resource(db.Model):
    __tablename__ = 'resources'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(20))
    url = db.Column(db.String(255))
    uploader_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=True)
    chapter_id = db.Column(db.Integer, db.ForeignKey('lesson_plans.id'), nullable=True)
    # knowledge_scope: course (course-level permanent knowledge base)
    #                  chapter (chapter-level temporary supplemental material)
    knowledge_scope = db.Column(db.String(20), nullable=False, default='course')
    created_at = db.Column(db.DateTime, default=utc_now)
