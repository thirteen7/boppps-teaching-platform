import os
import uuid
import mimetypes
from datetime import UTC, datetime
from collections import defaultdict
from urllib.parse import quote

from flask import Blueprint, abort, request, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import false, func
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError
from werkzeug.utils import secure_filename
from extensions import db
from models import Course, LessonPlan, BOPPPSContent, Assessment, Question, Submission, User, Resource, QuestionBankItem, course_students
from utils import log_action, api_response
from config import Config
import json

teaching_bp = Blueprint('teaching', __name__)

def _db_get(model, record_id):
    return db.session.get(model, record_id)


def _db_get_or_404(model, record_id):
    record = db.session.get(model, record_id)
    if record is None:
        abort(404)
    return record


# BOPPPS 阶段默认模板
BOPPPS_TEMPLATES = {
    'bridge_in': "### 导入 (Bridge-in)\n\n* **吸引注意**: [描述如何吸引学生注意力]\n* **关联旧知**: [描述如何关联已有知识]\n* **引出主题**: [本节课的主题]",
    'objective': "### 学习目标 (Objective)\n\n* **知识目标**: [学生能掌握...]\n* **能力目标**: [学生能运用...]\n* **情感目标**: [学生能体会...]",
    'pre_assessment': "### 前测 (Pre-assessment)\n\n* **形式**: [提问/小测验/举手]\n* **内容**: [测试题目或问题]",
    'participatory': "### 参与式学习 (Participatory Learning)\n\n* **活动1**: [描述活动内容]\n* **互动方式**: [小组讨论/案例分析]\n* **教师行为**: [引导/点评]",
    'post_assessment': "### 后测 (Post-assessment)\n\n* **形式**: [习题/操作/总结]\n* **内容**: [对应学习目标的检测]",
    'summary': "### 总结 (Summary)\n\n* **回顾要点**: [本节课核心内容]\n* **预告下节**: [下节课内容剧透]"
}


def _get_current_user():
    current_user = get_jwt_identity()
    if isinstance(current_user, str):
        try:
            current_user = json.loads(current_user)
        except Exception:
            current_user = {}
    return current_user


def _is_student_in_course(user_id, course_id):
    user = _db_get(User, user_id)
    if not user:
        return False
    return any(c.id == course_id for c in user.enrolled_courses)


def _check_course_access_or_403(course, current_user):
    role = current_user.get('role')
    user_id = current_user.get('id')
    if role == 'teacher' and course.teacher_id != user_id:
        return api_response(msg='Permission denied: invalid course', code=403)
    if role == 'student' and not _is_student_in_course(user_id, course.id):
        return api_response(msg='Permission denied: invalid course', code=403)
    return None


def _can_manage_course(current_user, course):
    role = current_user.get('role')
    user_id = current_user.get('id')
    if role == 'admin':
        return True
    if role == 'teacher' and course.teacher_id == user_id:
        return True
    return False


def _check_chapter_access_or_403(chapter, current_user):
    course = _db_get_or_404(Course, chapter.course_id)
    permission_error = _check_course_access_or_403(course, current_user)
    if permission_error:
        return None, permission_error
    return course, None


def _ensure_upload_folder():
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)


def _generate_course_code():
    """
    统一课程代码策略:
    CRS + YYYYMMDD + 3位日内流水号
    例如: CRS20260421001
    """
    date_prefix = datetime.now().strftime("CRS%Y%m%d")
    for seq in range(1, 1000):
        candidate = f"{date_prefix}{seq:03d}"
        exists = Course.query.filter_by(code=candidate).first()
        if not exists:
            return candidate
    return f"{date_prefix}{uuid.uuid4().hex[:4].upper()}"


def _resource_payload(resource):
    file_meta = _infer_resource_file_meta(resource)
    course_name = None
    uploader_name = None
    chapter_title = None
    chapter_ref_id = resource.chapter_id

    if resource.course_id:
        course = _db_get(Course, resource.course_id)
        course_name = course.name if course else None

    if resource.uploader_id:
        uploader = _db_get(User, resource.uploader_id)
        uploader_name = uploader.name or uploader.username if uploader else None

    if chapter_ref_id:
        lesson_plan = _db_get(LessonPlan, chapter_ref_id)
        chapter_title = lesson_plan.title if lesson_plan else None

    return {
        'id': resource.id,
        'name': resource.name,
        'type': resource.type,
        'url': resource.url,
        'file_exists': bool(file_meta.get('file_path')) if resource.type == 'file' else True,
        'mime_type': file_meta.get('mime_type'),
        'file_ext': file_meta.get('file_ext'),
        'download_name': file_meta.get('download_name'),
        'can_preview': file_meta.get('can_preview', False),
        'preview_url': f"/api/teaching/resources/{resource.id}/content" if resource.type == 'file' else None,
        'download_url': f"/api/teaching/resources/{resource.id}/content?download=1" if resource.type == 'file' else None,
        'course_id': resource.course_id,
        'course_name': course_name,
        'knowledge_scope': 'chapter' if chapter_ref_id else 'course',
        'is_temporary': bool(chapter_ref_id),
        'chapter_id': chapter_ref_id,
        'chapter_title': chapter_title,
        'uploader_id': resource.uploader_id,
        'uploader_name': uploader_name,
        'created_at': resource.created_at.strftime('%Y-%m-%d %H:%M:%S')
    }


def _resource_file_path(resource):
    if not resource or not resource.url:
        return None
    if not resource.url.startswith('/static/uploads/resources/'):
        return None
    filename = os.path.basename(resource.url)
    file_path = os.path.join(Config.UPLOAD_FOLDER, filename)
    return file_path if os.path.exists(file_path) else None


def _looks_like_utf8_text(sample):
    if not sample:
        return False
    try:
        sample.decode('utf-8')
    except UnicodeDecodeError:
        return False
    return True


def _infer_resource_file_meta(resource):
    office_mime_map = {
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.pdf': 'application/pdf',
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.csv': 'text/csv',
        '.json': 'application/json',
    }
    file_path = _resource_file_path(resource)
    file_ext = os.path.splitext(file_path)[1].lower() if file_path else ''
    mime_type = office_mime_map.get(file_ext) if file_ext else None

    if not mime_type and file_ext:
        mime_type = mimetypes.guess_type(f"resource{file_ext}")[0]

    if not mime_type and file_path:
        try:
            with open(file_path, 'rb') as fh:
                sample = fh.read(2048)
        except OSError:
            sample = b''

        if sample.startswith(b'%PDF'):
            mime_type = 'application/pdf'
            file_ext = file_ext or '.pdf'
        elif _looks_like_utf8_text(sample):
            mime_type = 'text/plain'
            file_ext = file_ext or '.txt'
        else:
            mime_type = 'application/octet-stream'

    download_name = (resource.name or 'resource').strip() or 'resource'
    if file_ext and not os.path.splitext(download_name)[1]:
        download_name = f"{download_name}{file_ext}"

    previewable_mimes = {
        'application/pdf',
        'application/msword',
        'application/vnd.ms-excel',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }
    can_preview = bool(
        resource
        and resource.type == 'file'
        and mime_type
        and (
            mime_type.startswith('text/')
            or mime_type.startswith('image/')
            or mime_type in previewable_mimes
        )
    )

    return {
        'file_path': file_path,
        'file_ext': file_ext,
        'mime_type': mime_type,
        'download_name': download_name,
        'can_preview': can_preview,
    }


def _check_resource_access_or_403(resource, current_user):
    role = current_user.get('role')
    user_id = current_user.get('id')

    if role == 'admin':
        return None

    if resource.course_id:
        course = _db_get(Course, resource.course_id)
        if not course:
            return api_response(msg='Course not found', code=404)
        if role == 'teacher' and course.teacher_id != user_id:
            return api_response(msg='Permission denied: invalid resource', code=403)
        if role == 'student' and not _is_student_in_course(user_id, course.id):
            return api_response(msg='Permission denied: invalid resource', code=403)
        return None

    if role == 'teacher' and resource.uploader_id != user_id:
        return api_response(msg='Permission denied: invalid resource', code=403)
    if role == 'student':
        return api_response(msg='Permission denied: invalid resource', code=403)
    return None


def _extract_resource_input():
    content_type = request.content_type or ''
    if 'multipart/form-data' in content_type:
        return request.form, request.files.get('file')
    return request.get_json() or {}, None


def _question_bank_payload(item):
    creator = _db_get(User, item.created_by)
    course = _db_get(Course, item.course_id)
    chapter = _db_get(LessonPlan, item.chapter_id) if item.chapter_id else None
    linked_questions = Question.query.filter_by(question_bank_item_id=item.id).all()
    normalized_stem = _normalize_question_stem(item.stem)
    chapter_ids = [lp.id for lp in LessonPlan.query.filter_by(course_id=item.course_id).all()]
    course_questions = []
    if chapter_ids:
        assessment_ids = [a.id for a in Assessment.query.filter(Assessment.lesson_plan_id.in_(chapter_ids)).all()]
        if assessment_ids:
            course_questions = Question.query.filter(Question.assessment_id.in_(assessment_ids)).all()

    question_map = {q.id: q for q in linked_questions}
    if normalized_stem:
        for q in course_questions:
            if _normalize_question_stem(q.content) == normalized_stem:
                question_map[q.id] = q
    merged_questions = list(question_map.values())

    attempts = 0
    correct = 0
    for q in merged_questions:
        submissions = Submission.query.filter_by(assessment_id=q.assessment_id, status='active').all()
        for sub in submissions:
            answers = sub.answers or {}
            if str(q.id) in answers:
                attempts += 1
                if answers.get(str(q.id)) == q.answer:
                    correct += 1
    accuracy = round((correct / attempts) * 100, 2) if attempts > 0 else None

    return {
        'id': item.id,
        'course_id': item.course_id,
        'course_name': course.name if course else None,
        'chapter_id': item.chapter_id,
        'chapter_title': chapter.title if chapter else None,
        'source': item.source,
        'difficulty': item.difficulty,
        'history_attempts': attempts,
        'history_accuracy': accuracy,
        'tags': item.tags or [],
        'stem': item.stem,
        'options': item.options,
        'answer': item.answer,
        'explanation': item.explanation,
        'created_by': item.created_by,
        'creator_name': (creator.name or creator.username) if creator else None,
        'created_at': item.created_at.strftime('%Y-%m-%d %H:%M:%S'),
    }


def _resolve_resource_context(data, current_user):
    raw_course_id = data.get('course_id')
    raw_chapter_id = data.get('chapter_id')
    course_id = int(raw_course_id) if raw_course_id not in [None, '', 'null'] else None
    chapter_id = int(raw_chapter_id) if raw_chapter_id not in [None, '', 'null'] else None

    if not course_id:
        return None, None, api_response(msg='Resource library requires course_id', code=400)

    course = _db_get(Course, course_id)
    if not course:
        return None, None, api_response(msg='Course not found', code=404)

    if current_user.get('role') == 'teacher' and course.teacher_id != current_user.get('id'):
        return None, None, api_response(msg='Permission denied: invalid course', code=403)

    if chapter_id:
        chapter = _db_get(LessonPlan, chapter_id)
        if not chapter or chapter.course_id != course_id:
            return None, None, api_response(msg='Chapter not found in course', code=404)

    return course_id, chapter_id, None


def _build_knowledge_snippets(course_id, chapter_id, manual_snippets='', selected_resource_ids=None):
    course_resources = Resource.query.filter_by(course_id=course_id, chapter_id=None).order_by(Resource.created_at.desc()).all()
    chapter_resources = []
    if chapter_id:
        chapter_resources = Resource.query.filter_by(
            course_id=course_id,
            chapter_id=chapter_id
        ).order_by(Resource.created_at.desc()).all()

    if isinstance(selected_resource_ids, list) and selected_resource_ids:
        selected_ids = {int(x) for x in selected_resource_ids if str(x).isdigit()}
        course_resources = [item for item in course_resources if item.id in selected_ids]
        chapter_resources = [item for item in chapter_resources if item.id in selected_ids]

    parts = []
    if manual_snippets:
        parts.append(f"[MANUAL_NOTES]\n{manual_snippets}")

    if course_resources:
        course_lines = [f"- {item.name}: {item.url}" for item in course_resources]
        parts.append("[COURSE_KNOWLEDGE_BASE]\n" + "\n".join(course_lines))

    if chapter_resources:
        lesson_lines = [f"- {item.name}: {item.url}" for item in chapter_resources]
        parts.append("[CHAPTER_LINKED_FILES]\n" + "\n".join(lesson_lines))

    return "\n\n".join(parts), course_resources, chapter_resources


def _build_assessment_basis(chapter_id, assessment_type):
    assessments = Assessment.query.filter_by(
        lesson_plan_id=chapter_id,
        type=assessment_type
    ).order_by(Assessment.created_at.desc()).all()
    if not assessments:
        return ""

    lines = []
    for idx, ass in enumerate(assessments, start=1):
        lines.append(f"测验{idx}: {ass.title or '未命名测验'}")
        for q_idx, q in enumerate(ass.questions, start=1):
            lines.append(f"  题{q_idx}: {q.content}")
            if isinstance(q.options, list) and q.options:
                lines.append(f"    选项: {' | '.join([str(opt) for opt in q.options])}")
            if q.answer:
                lines.append(f"    标准答案: {q.answer}")
    return "\n".join(lines)


def _get_expected_assessment_question_count(chapter_id, assessment_type):
    latest = Assessment.query.filter_by(
        lesson_plan_id=chapter_id,
        type=assessment_type
    ).order_by(Assessment.created_at.desc()).first()
    if not latest:
        return 0
    return len(latest.questions or [])


def _stage_content_basis(chapter_id, stage):
    content = BOPPPSContent.query.filter_by(lesson_plan_id=chapter_id, stage=stage).first()
    if not content or not content.content:
        return ""
    text = str(content.content).strip()
    if len(text) > 2500:
        return text[:2500] + "\n...(已截断)"
    return text


def _build_assessment_result_basis(chapter_id, assessment_type):
    assessments = Assessment.query.filter_by(
        lesson_plan_id=chapter_id,
        type=assessment_type
    ).order_by(Assessment.created_at.desc()).all()
    if not assessments:
        return ""

    lines = []
    for idx, ass in enumerate(assessments, start=1):
        submissions = Submission.query.filter_by(assessment_id=ass.id, status='active').all()
        avg_score = round(sum(float(s.score or 0) for s in submissions) / len(submissions), 2) if submissions else None
        lines.append(f"{assessment_type}测验{idx}: {ass.title or '未命名测验'}")
        lines.append(f"  提交人数: {len(submissions)}")
        lines.append(f"  平均分: {avg_score if avg_score is not None else '暂无'}")

        question_rows = []
        for q in ass.questions:
            attempts = 0
            correct = 0
            for sub in submissions:
                answers = sub.answers or {}
                selected = answers.get(str(q.id))
                if selected is None or selected == '':
                    continue
                attempts += 1
                if selected == q.answer:
                    correct += 1
            accuracy = round((correct / attempts) * 100, 2) if attempts > 0 else None
            question_rows.append((q, accuracy))
        question_rows.sort(key=lambda item: item[1] if item[1] is not None else 999)

        for q, acc in question_rows[:3]:
            acc_text = f"{acc}%" if acc is not None else "暂无"
            lines.append(f"  低正确率题: {q.content} | 正确率: {acc_text}")
    return "\n".join(lines)


def _normalize_question_stem(stem):
    import re
    text = (stem or '').strip().lower()
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"[，。！？、,.!?;；:：\"'“”‘’（）()\\[\\]{}]", "", text)
    return text


def _build_assessment_detail_analytics(assessment):
    chapter = _db_get(LessonPlan, assessment.lesson_plan_id)
    course = _db_get(Course, chapter.course_id) if chapter else None
    submissions = Submission.query.filter_by(assessment_id=assessment.id, status='active').order_by(Submission.submitted_at.desc()).all()
    questions = assessment.questions or []

    question_stats = []
    question_accuracy_map = {}
    for q in questions:
        attempts = 0
        correct = 0
        wrong_options_count = defaultdict(int)
        for sub in submissions:
            answer_map = sub.answers or {}
            selected = answer_map.get(str(q.id))
            if selected is None or selected == '':
                continue
            attempts += 1
            if selected == q.answer:
                correct += 1
            else:
                wrong_options_count[str(selected)] += 1
        accuracy = round((correct / attempts) * 100, 2) if attempts > 0 else None
        question_accuracy_map[q.id] = accuracy
        qb_item = _db_get(QuestionBankItem, q.question_bank_item_id) if q.question_bank_item_id else None
        question_stats.append({
            'question_id': q.id,
            'content': q.content,
            'explanation': q.explanation,
            'attempts': attempts,
            'correct_count': correct,
            'wrong_count': max(attempts - correct, 0),
            'accuracy': accuracy,
            'difficulty': qb_item.difficulty if qb_item else None,
            'tags': qb_item.tags if qb_item and qb_item.tags else [],
            'wrong_options': dict(wrong_options_count),
        })

    student_stats = []
    for sub in submissions:
        student = _db_get(User, sub.student_id)
        answer_map = sub.answers or {}
        correct_count = 0
        for q in questions:
            if answer_map.get(str(q.id)) == q.answer:
                correct_count += 1
        student_stats.append({
            'submission_id': sub.id,
            'student_id': sub.student_id,
            'student_username': student.username if student else '-',
            'student_name': (student.name or student.username) if student else '-',
            'score': sub.score or 0,
            'correct_count': correct_count,
            'question_count': len(questions),
            'submitted_at': sub.submitted_at.strftime('%Y-%m-%d %H:%M:%S'),
        })
    student_stats.sort(key=lambda x: (-float(x.get('score', 0) or 0), x.get('submitted_at', '')))
    for idx, item in enumerate(student_stats, start=1):
        item['rank'] = idx

    distribution = {
        '0_59': 0,
        '60_69': 0,
        '70_79': 0,
        '80_89': 0,
        '90_100': 0,
    }
    for sub in submissions:
        score = float(sub.score or 0)
        if score < 60:
            distribution['0_59'] += 1
        elif score < 70:
            distribution['60_69'] += 1
        elif score < 80:
            distribution['70_79'] += 1
        elif score < 90:
            distribution['80_89'] += 1
        else:
            distribution['90_100'] += 1

    course_ranking = []
    if course:
        chapter_ids = [lp.id for lp in LessonPlan.query.filter_by(course_id=course.id).all()]
        course_assessment_ids = [a.id for a in Assessment.query.filter(Assessment.lesson_plan_id.in_(chapter_ids)).all()]
        if course_assessment_ids:
            for stu in course.students:
                stu_subs = Submission.query.filter(
                    Submission.assessment_id.in_(course_assessment_ids),
                    Submission.student_id == stu.id,
                    Submission.status == 'active'
                ).all()
                if not stu_subs:
                    continue
                avg_score = sum(float(s.score or 0) for s in stu_subs) / len(stu_subs)
                course_ranking.append({
                    'student_id': stu.id,
                    'student_username': stu.username,
                    'student_name': stu.name or stu.username,
                    'avg_score': round(avg_score, 2),
                    'submission_count': len(stu_subs),
                })
            course_ranking.sort(key=lambda x: (-x['avg_score'], -x['submission_count'], x['student_username']))
            for idx, item in enumerate(course_ranking, start=1):
                item['rank'] = idx

    submitted_students = len({sub.student_id for sub in submissions})
    total_students = len(course.students) if course else 0
    participation_rate = round((submitted_students / total_students) * 100, 2) if total_students > 0 else 0

    return {
        'assessment': {
            'id': assessment.id,
            'title': assessment.title,
            'type': assessment.type,
            'chapter_id': chapter.id if chapter else None,
            'chapter_title': chapter.title if chapter else None,
            'course_id': course.id if course else None,
            'course_name': course.name if course else None,
            'question_count': len(questions),
            'submission_count': len(submissions),
            'average_score': round(sum(float(s.score or 0) for s in submissions) / len(submissions), 2) if submissions else 0,
        },
        'participation': {
            'total_students': total_students,
            'submitted_students': submitted_students,
            'participation_rate': participation_rate,
        },
        'score_distribution': distribution,
        'question_stats': question_stats,
        'student_stats': student_stats,
        'course_ranking': course_ranking,
    }


def _delete_resource_file_if_needed(resource):
    if not resource or not resource.url:
        return

    if resource.url.startswith('/static/uploads/resources/'):
        filename = os.path.basename(resource.url)
        file_path = os.path.join(Config.UPLOAD_FOLDER, filename)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass


def _delete_assessment_related_data(assessment):
    if not assessment:
        return

    Submission.query.filter_by(assessment_id=assessment.id).delete(synchronize_session=False)
    Question.query.filter_by(assessment_id=assessment.id).delete(synchronize_session=False)
    db.session.flush()
    db.session.delete(assessment)
    db.session.flush()


def _delete_chapter_related_data(chapter):
    if not chapter:
        return {'resources': 0, 'assessments': 0}

    deleted_resources = 0
    deleted_assessments = 0

    chapter_resources = Resource.query.filter_by(course_id=chapter.course_id, chapter_id=chapter.id).all()
    for resource in chapter_resources:
        _delete_resource_file_if_needed(resource)
        db.session.delete(resource)
        deleted_resources += 1
    db.session.flush()

    assessments = Assessment.query.filter_by(lesson_plan_id=chapter.id).all()
    for assessment in assessments:
        _delete_assessment_related_data(assessment)
        deleted_assessments += 1

    BOPPPSContent.query.filter_by(lesson_plan_id=chapter.id).delete(synchronize_session=False)
    QuestionBankItem.query.filter_by(chapter_id=chapter.id).update({'chapter_id': None}, synchronize_session=False)
    db.session.flush()
    db.session.delete(chapter)
    db.session.flush()

    return {
        'resources': deleted_resources,
        'assessments': deleted_assessments,
    }


def _delete_course_related_data(course):
    for resource in Resource.query.filter_by(course_id=course.id).all():
        _delete_resource_file_if_needed(resource)
        db.session.delete(resource)
    db.session.flush()

    for lesson_plan in LessonPlan.query.filter_by(course_id=course.id).all():
        _delete_chapter_related_data(lesson_plan)

    QuestionBankItem.query.filter_by(course_id=course.id).delete(synchronize_session=False)
    db.session.flush()

    course.students.clear()
    db.session.flush()

@teaching_bp.route('/courses', methods=['POST'])
@jwt_required()
def create_course():
    current_user = _get_current_user()

    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='权限不足', code=403)

    data = request.get_json()
    if not data or not data.get('name'):
        return api_response(msg='课程名称不能为空', code=400)

    assigned_teacher_id = current_user.get('id')
    if current_user.get('role') == 'admin':
        assigned_teacher_id = data.get('teacher_id')
        if not assigned_teacher_id:
            return api_response(msg='管理员创建课程时必须指定授课老师', code=400)
    elif data.get('teacher_id') and int(data.get('teacher_id')) != current_user.get('id'):
        return api_response(msg='教师只能创建并负责自己的课程', code=403)

    teacher = _db_get(User, assigned_teacher_id)
    if not teacher or teacher.role != 'teacher':
        return api_response(msg='无效的授课老师', code=400)

    new_course = Course(
        name=data['name'],
        code=_generate_course_code(),
        objectives=data.get('objectives'),
        teacher_id=assigned_teacher_id
    )
    db.session.add(new_course)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        new_course.code = _generate_course_code()
        db.session.add(new_course)
        db.session.commit()

    log_action(current_user.get('id'), current_user.get('username'), f"创建课程: {new_course.name}")
    return api_response(msg='课程创建成功', data={'id': new_course.id, 'code': new_course.code}, code=201)


@teaching_bp.route('/courses', methods=['GET'])
@jwt_required()
def get_courses():
    current_user = _get_current_user()

    role = current_user.get('role')
    user_id = current_user.get('id')

    if role == 'teacher':
        courses = Course.query.filter_by(teacher_id=user_id).all()
    elif role == 'student':
        user = _db_get(User, user_id)
        courses = user.enrolled_courses
    else:
        courses = Course.query.all()

    updated = False
    for c in courses:
        if not c.code:
            c.code = _generate_course_code()
            updated = True
    if updated:
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            for c in courses:
                if not c.code:
                    c.code = _generate_course_code()
            db.session.commit()

    data = []
    for c in courses:
        teacher = _db_get(User, c.teacher_id) if c.teacher_id else None
        data.append({
            'id': c.id,
            'name': c.name,
            'code': c.code,
            'objectives': c.objectives,
            'teacher_id': c.teacher_id,
            'teacher_name': (teacher.name or teacher.username) if teacher else None,
            'can_manage': _can_manage_course(current_user, c),
        })
    return api_response(data=data)


@teaching_bp.route('/courses/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_course(id):
    current_user = _get_current_user()
    course = _db_get_or_404(Course, id)

    if current_user.get('role') == 'teacher' and course.teacher_id != current_user.get('id'):
        return api_response(msg='Permission denied: invalid course', code=403)
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    course_name = course.name
    try:
        _delete_course_related_data(course)
        db.session.delete(course)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return api_response(msg=f'Course delete failed: {str(e)}', code=500)

    log_action(current_user.get('id'), current_user.get('username'), f"删除课程: {course_name}")
    return api_response(msg='Course deleted')


@teaching_bp.route('/courses/join', methods=['POST'])
@jwt_required()
def join_course():
    current_user = _get_current_user()

    if current_user.get('role') != 'student':
        return api_response(msg='仅学生可自主加入课程', code=403)

    data = request.get_json() or {}
    course_code = (data.get('course_code') or '').strip()
    course_id = data.get('course_id')

    course = None
    if course_code:
        course = Course.query.filter(func.lower(Course.code) == course_code.lower()).first()
    elif course_id:
        course = _db_get(Course, course_id)
    else:
        return api_response(msg='请提供课程代码', code=400)

    if not course:
        return api_response(msg='课程不存在', code=404)

    user = _db_get(User, current_user.get('id'))
    if course in user.enrolled_courses:
        return api_response(msg='您已经加入了该课程', code=400)

    user.enrolled_courses.append(course)
    db.session.commit()

    log_action(user.id, user.username, f"加入课程: {course.name}")
    return api_response(msg='成功加入课程')


@teaching_bp.route('/courses/<int:id>/students', methods=['GET', 'POST'])
@jwt_required()
def manage_course_students(id):
    current_user = _get_current_user()

    course = _db_get_or_404(Course, id)

    if not _can_manage_course(current_user, course):
        return api_response(msg='无权管理该课程的学生', code=403)

    if request.method == 'GET':
        students = course.students
        data = [{
            'id': s.id,
            'username': s.username,
            'name': s.name
        } for s in students]
        return api_response(data=data)

    if request.method == 'POST':
        data = request.get_json()
        student_id = data.get('student_id')
        student = _db_get(User, student_id)

        if not student or student.role != 'student':
            return api_response(msg='无效的学生ID', code=400)

        if student in course.students:
            return api_response(msg='该学生已在课程中', code=400)

        course.students.append(student)
        db.session.commit()
        log_action(current_user.get('id'), current_user.get('username'), f"将学生 {student.username} 加入课程 {course.name}")
        return api_response(msg='学生添加成功')


@teaching_bp.route('/courses/<int:course_id>/students/<int:student_id>', methods=['DELETE'])
@jwt_required()
def remove_course_student(course_id, student_id):
    current_user = _get_current_user()

    course = _db_get_or_404(Course, course_id)

    if not _can_manage_course(current_user, course):
        return api_response(msg='无权管理该课程的学生', code=403)

    student = _db_get(User, student_id)
    if student in course.students:
        course.students.remove(student)
        db.session.commit()
        log_action(current_user.get('id'), current_user.get('username'), f"将学生 {student.username} 移出课程 {course.name}")

    return api_response(msg='学生移出成功')


@teaching_bp.route('/search-students', methods=['GET'])
@jwt_required()
def search_students():
    current_user = _get_current_user()

    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='权限不足', code=403)

    keyword = request.args.get('keyword', '')
    major = (request.args.get('major') or '').strip()
    class_name = (request.args.get('class_name') or '').strip()
    query = User.query.filter_by(role='student')
    
    if keyword:
        query = query.filter(db.or_(User.username.like(f'%{keyword}%'), User.name.like(f'%{keyword}%')))
    if major:
        query = query.filter(User.major == major)
    if class_name:
        query = query.filter(User.class_name == class_name)

    students = query.limit(20).all()
    data = [{
        'id': s.id,
        'username': s.username,
        'name': s.name,
        'major': s.major,
        'class_name': s.class_name,
    } for s in students]

    return api_response(data=data)


@teaching_bp.route('/courses/<int:id>/lesson-plans', methods=['GET'])
@teaching_bp.route('/courses/<int:id>/chapters', methods=['GET'])
@jwt_required()
def get_course_lesson_plans(id):
    current_user = _get_current_user()

    course = _db_get_or_404(Course, id)
    permission_error = _check_course_access_or_403(course, current_user)
    if permission_error:
        return permission_error
    if current_user.get('role') == 'student':
        return api_response(msg='Students cannot view lesson plans', code=403)

    plans = LessonPlan.query.filter_by(course_id=id).order_by(LessonPlan.created_at.desc()).all()
    data = [{
        'id': lp.id,
        'chapter_id': lp.id,
        'title': lp.title,
        'chapter_title': lp.title,
        'created_at': lp.created_at.strftime('%Y-%m-%d %H:%M')
    } for lp in plans]
    return api_response(data=data)


#
# 4.2 Lesson Plans (教案)
#

@teaching_bp.route('/lesson-plans', methods=['POST'])
@teaching_bp.route('/chapters', methods=['POST'])
@jwt_required()
def create_lesson_plan():
    current_user = _get_current_user()

    data = request.get_json()
    # 验证必填字段
    title = data.get('title')
    course_id = data.get('course_id')

    if not title or not title.strip():
        return api_response(msg='Title is required', code=400)

    # 验证课程是否存在
    course = _db_get(Course, course_id)
    if not course:
        return api_response(msg='Course not found', code=404)

    # 权限检查：如果是老师，只能给自己的课创建教案；如果是管理员，可以给任意课程创建
    if current_user.get('role') == 'teacher':
        if course.teacher_id != current_user.get('id'):
             return api_response(msg='Permission denied: Can only add lesson plans to your own courses', code=403)
    elif current_user.get('role') == 'student':
         return api_response(msg='Permission denied: Students cannot create lesson plans', code=403)

    new_lp = LessonPlan(
        course_id=course_id,
        title=title.strip()
    )
    db.session.add(new_lp)
    db.session.commit()

    # 初始化 BOPPPS 六个阶段的空记录
    stages = ['bridge_in', 'objective', 'pre_assessment', 'participatory', 'post_assessment', 'summary']
    for stage in stages:
        content = BOPPPSContent(
            lesson_plan_id=new_lp.id,
            stage=stage,
            content=BOPPPS_TEMPLATES.get(stage, "")
        )
        db.session.add(content)
    db.session.commit()

    log_action(current_user.get('id'), current_user.get('username'), f"创建教案: {new_lp.title}")
    return api_response(msg='Chapter created', data={'id': new_lp.id, 'chapter_id': new_lp.id}, code=201)

@teaching_bp.route('/lesson-plans/<int:id>', methods=['GET'])
@teaching_bp.route('/chapters/<int:id>', methods=['GET'])
@jwt_required()
def get_lesson_plan(id):
    current_user = _get_current_user()
    lp = _db_get_or_404(LessonPlan, id)
    course = _db_get_or_404(Course, lp.course_id)
    permission_error = _check_course_access_or_403(course, current_user)
    if permission_error:
        return permission_error
    if current_user.get('role') == 'student':
        return api_response(msg='Students cannot view lesson plans', code=403)
    data = {
        'id': lp.id,
        'chapter_id': lp.id,
        'course_id': lp.course_id,
        'title': lp.title,
        'chapter_title': lp.title,
        'created_at': lp.created_at,
        'course_name': lp.course.name
    }
    return api_response(data=data)


@teaching_bp.route('/lesson-plans/<int:id>', methods=['DELETE'])
@teaching_bp.route('/chapters/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_lesson_plan(id):
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    chapter = _db_get_or_404(LessonPlan, id)
    course = _db_get_or_404(Course, chapter.course_id)
    if not _can_manage_course(current_user, course):
        return api_response(msg='Permission denied: invalid chapter', code=403)

    chapter_title = chapter.title
    result = _delete_chapter_related_data(chapter)
    db.session.commit()

    log_action(
        current_user.get('id'),
        current_user.get('username'),
        f"删除章节: 课程 {course.name} 章节 {chapter_title}，删除测验 {result['assessments']} 个，删除资源 {result['resources']} 个"
    )
    return api_response(msg='Chapter deleted', data={'id': id, **result})

#
# 4.3 BOPPPS Generation & Saving
#

from services.llm_service import LLMService

def format_boppps_json_to_markdown(stage, data):
    """
    将 LLM 返回的 JSON 结构转换为易读的 Markdown 格式
    """
    if not isinstance(data, dict):
        return str(data)

    outputs = data.get('outputs', data) # 兼容有些模型可能直接返回 outputs 内容
    if not outputs:
        return str(data)
    if not isinstance(outputs, dict):
        parsed_outputs = None
        if isinstance(outputs, str):
            try:
                parsed_outputs = json.loads(outputs)
            except Exception:
                parsed_outputs = None
        if isinstance(parsed_outputs, dict):
            outputs = parsed_outputs
        else:
            return str(outputs)

    md = ""
    need_more_info = bool(data.get('need_more_info')) if isinstance(data, dict) else False
    missing_info = data.get('missing_info', []) if isinstance(data, dict) else []

    if need_more_info:
        md += "### ⚠️ 生成信息不足\n\n"
        md += "当前模型判断缺少必要上下文，暂未生成完整内容。\n\n"
        if isinstance(missing_info, list) and missing_info:
            md += "**缺失项**:\n" + "\n".join([f"- {str(x)}" for x in missing_info if str(x).strip()]) + "\n\n"

    def _extract_question_stem(item):
        if not isinstance(item, dict):
            return str(item or "").strip()
        for key in ["stem", "question", "statement", "content", "title", "prompt"]:
            value = item.get(key)
            if value is not None and str(value).strip():
                return str(value).strip()
        return ""

    def _extract_activity_text(item):
        if not isinstance(item, dict):
            return str(item or "").strip()
        title = ""
        desc = ""
        for key in ["title", "name", "activity", "task", "step"]:
            value = item.get(key)
            if value is not None and str(value).strip():
                title = str(value).strip()
                break
        for key in ["description", "detail", "instruction", "goal", "content"]:
            value = item.get(key)
            if value is not None and str(value).strip():
                desc = str(value).strip()
                break
        if title and desc:
            return f"{title}: {desc}"
        if title:
            return title
        if desc:
            return desc
        return ""

    # === Bridge-in (导入) ===
    if stage == 'bridge_in':
        md += f"### 导入环节: {outputs.get('hook_title', '未命名')}\n\n"
        md += f"**导入类型**: {outputs.get('hook_type', '未定义')}\n"
        md += f"**预计时长**: {outputs.get('duration_minutes', 0)} 分钟\n\n"

        md += f"#### 🎙️ 教师口播 (Script)\n> {outputs.get('hook_script', '无内容')}\n\n"

        md += f"**🔗 过渡语**: \n{outputs.get('transition_to_objectives', '')}\n\n"

        if outputs.get('teacher_actions'):
            md += "**👨‍🏫 教师活动**:\n" + "\n".join([f"- {x}" for x in outputs.get('teacher_actions', [])]) + "\n\n"

        if outputs.get('student_actions'):
            md += "**👨‍🎓 学生活动**:\n" + "\n".join([f"- {x}" for x in outputs.get('student_actions', [])]) + "\n\n"

        if outputs.get('materials_needed'):
             md += "**📦 所需材料**:\n" + "\n".join([f"- {x}" for x in outputs['materials_needed']]) + "\n\n"

        if outputs.get('citations'):
             md += "**📚 参考资料**:\n"
             for c in outputs.get('citations', []):
                 quote = c.get('quote', '')
                 src = c.get('source_id', '')
                 if quote or src:
                    md += f"- *{src}*: \"{quote}\"\n"

    # === Objective (目标) ===
    elif stage == 'objective':
        md += "### 🎯 学习目标 (Learning Objectives)\n\n"
        objectives = outputs.get('objectives', [])
        if not isinstance(objectives, list):
            objectives = [objectives] if objectives else []
        for obj in objectives:
             if isinstance(obj, dict):
                 obj_id = obj.get('id') or '目标'
                 statement = obj.get('statement') or obj.get('objective') or obj.get('description') or ''
                 domain = obj.get('domain') or obj.get('dimension') or '-'
                 measurable_verb = obj.get('measurable_verb') or obj.get('verb') or '-'
                 success_criteria = obj.get('success_criteria') or obj.get('standard') or '-'
                 condition = obj.get('condition')

                 if not statement or str(statement).strip().lower() in ['none', 'null']:
                     statement = f"围绕“{measurable_verb if measurable_verb != '-' else '达成学习目标'}”完成可测学习任务"

                 md += f"#### 🎯 {obj_id}: {statement}\n"
                 detail_parts = []
                 if measurable_verb and measurable_verb != '-':
                     detail_parts.append(f"建议课堂行为聚焦在“{measurable_verb}”")
                 if condition:
                     detail_parts.append(f"可在“{condition}”情境下组织练习")
                 if success_criteria and success_criteria != '-':
                     detail_parts.append(f"可用“{success_criteria}”判断学习完成度")
                 if domain and domain != '-':
                     detail_parts.append(f"该目标更偏向{domain}层面的提升")
                 if detail_parts:
                     md += f"- {'；'.join(detail_parts)}。\n"
                 if obj.get('mapped_key_points'):
                     mapped = obj.get('mapped_key_points')
                     if isinstance(mapped, list):
                         md += f"- *对应重点*: {', '.join(mapped)}\n"
                     else:
                         md += f"- *对应重点*: {mapped}\n"
                 md += "\n"
             else:
                 md += f"- {obj}\n"

        checks = outputs.get('alignment_checks', {})
        if isinstance(checks, dict) and checks:
            md += f"---\n**⚡ 质量校验**:\n"
            md += f"- 重点覆盖度: {checks.get('coverage_key_points', 'N/A')}\n"
            md += f"- 可测性: {checks.get('measurability', 'N/A')}\n"
            notes = checks.get('notes')
            if isinstance(notes, list) and notes:
                md += f"- 建议: {'; '.join(notes)}\n"
            elif notes:
                md += f"- 建议: {notes}\n"

    elif stage == 'pre_assessment':
        md += "### 📝 前测 (Pre-assessment)\n\n"
        outputs_questions = outputs.get('questions', [])
        if outputs_questions:
            md += "**📌 题目列表**:\n"
            for idx, q in enumerate(outputs_questions, start=1):
                if isinstance(q, dict):
                    stem = _extract_question_stem(q) or "（题干缺失，请重新生成）"
                    md += f"{idx}. {stem}\n"
                    opts = q.get('options', [])
                    for opt in opts:
                        if isinstance(opt, dict):
                            opt_text = opt.get('text') or opt.get('value') or opt.get('content') or ''
                            md += f"   - {opt_text}\n"
                        else:
                            md += f"   - {opt}\n"
                    md += f"   - 标准答案: {q.get('answer', '')}\n"
                    mapped = q.get('mapped_objective_ids')
                    if mapped:
                        if isinstance(mapped, list):
                            md += f"   - 对应目标: {', '.join([str(x) for x in mapped])}\n"
                        else:
                            md += f"   - 对应目标: {mapped}\n"
                    if q.get('diagnostic_purpose'):
                        md += f"   - 诊断用途: {q.get('diagnostic_purpose')}\n"
                else:
                    md += f"{idx}. {q}\n"
            md += "\n"
        md += f"**⏱️ 建议时长**: {outputs.get('timing_minutes', 8)} 分钟\n"
        md += f"**🔍 评估焦点**: {outputs.get('evaluation_focus', '')}\n"

    elif stage == 'participatory':
        md += "### 🤝 参与式学习 (Participatory)\n\n"
        activities = outputs.get('activities', [])
        if activities:
            md += "**📋 活动步骤**:\n"
            for idx, act in enumerate(activities, start=1):
                act_text = _extract_activity_text(act)
                md += f"{idx}. {act_text or '（活动内容缺失，请重新生成）'}\n"
            md += "\n"
        if outputs.get('teacher_actions'):
            md += "**👨‍🏫 教师动作**:\n" + "\n".join([f"- {x}" for x in outputs.get('teacher_actions', [])]) + "\n\n"
        if outputs.get('student_actions'):
            md += "**👨‍🎓 学生活动**:\n" + "\n".join([f"- {x}" for x in outputs.get('student_actions', [])]) + "\n\n"
        if outputs.get('artifacts'):
            md += "**🧩 产出物**:\n" + "\n".join([f"- {x}" for x in outputs.get('artifacts', [])]) + "\n\n"

    elif stage == 'post_assessment':
        md += "### ✅ 后测 (Post-assessment)\n\n"
        outputs_questions = outputs.get('questions', [])
        if outputs_questions:
            md += "**📌 题目列表**:\n"
            for idx, q in enumerate(outputs_questions, start=1):
                if isinstance(q, dict):
                    stem = _extract_question_stem(q) or "（题干缺失，请重新生成）"
                    md += f"{idx}. {stem}\n"
                    opts = q.get('options', [])
                    for opt in opts:
                        if isinstance(opt, dict):
                            opt_text = opt.get('text') or opt.get('value') or opt.get('content') or ''
                            md += f"   - {opt_text}\n"
                        else:
                            md += f"   - {opt}\n"
                    md += f"   - 标准答案: {q.get('answer', '')}\n"
                    mapped = q.get('mapped_objective_ids')
                    if mapped:
                        if isinstance(mapped, list):
                            md += f"   - 对应目标: {', '.join([str(x) for x in mapped])}\n"
                        else:
                            md += f"   - 对应目标: {mapped}\n"
                    if q.get('mastery_signal'):
                        md += f"   - 达标信号: {q.get('mastery_signal')}\n"
                else:
                    md += f"{idx}. {q}\n"
            md += "\n"
        rubric = outputs.get('rubric')
        if rubric:
            md += f"**📏 评分规则**: {rubric}\n"
        md += f"**⏱️ 建议时长**: {outputs.get('timing_minutes', 10)} 分钟\n"

    # === Summary (总结) ===
    elif stage == 'summary':
        md += "### 📚 课堂总结 (Summary)\n\n"
        kts = outputs.get('key_takeaways', [])
        if kts:
            md += "**🧠 核心要点 (Takeaways)**:\n" + "\n".join([f"- {x}" for x in kts]) + "\n\n"

        # fix: handle next_steps if it's a list or string
        ns = outputs.get('next_steps', '')
        if isinstance(ns, list):
            ns = "; ".join(ns)
        md += f"**📅 下步建议**: {ns}\n\n"

        errs = outputs.get('common_errors_and_fixes', [])
        if errs:
            md += "**⚠️ 常见误区与修正**:\n"
            for e in errs:
                if isinstance(e, dict):
                    err_text = (
                        e.get('error')
                        or e.get('common_error')
                        or e.get('mistake')
                        or e.get('issue')
                        or e.get('problem')
                        or ''
                    )
                    fix_text = (
                        e.get('fix')
                        or e.get('correction')
                        or e.get('advice')
                        or e.get('solution')
                        or ''
                    )
                    err_text = str(err_text).strip()
                    fix_text = str(fix_text).strip()
                    if err_text.lower() in ['none', 'null', '']:
                        err_text = '易错点需结合本节核心概念进行辨析'
                    if fix_text.lower() in ['none', 'null', '']:
                        fix_text = '建议通过“概念对比 + 例题讲解 + 当堂变式练习”进行修正。'
                    md += f"- **误区**: {err_text}\n  **修正**: {fix_text}\n"
                else:
                    text = str(e or '').strip()
                    if text and text.lower() not in ['none', 'null']:
                        md += f"- {text}\n"

        mqs = outputs.get('minute_paper_questions', [])
        if mqs:
            md += "\n**📝 一分钟纸笔问题 (Minute Paper)**:\n" + "\n".join([f"- {x}" for x in mqs])

        reflection = outputs.get('assessment_result_reflection')
        if reflection:
            md += "\n\n**📊 测评结果反思**:\n"
            if isinstance(reflection, list):
                md += "\n".join([f"- {x}" for x in reflection if x]) + "\n"
            elif isinstance(reflection, dict):
                for k, v in reflection.items():
                    md += f"- **{k}**: {v}\n"
            else:
                md += f"- {reflection}\n"

    else:
        # Fallback
        content_str = json.dumps(outputs, ensure_ascii=False, indent=2)
        md = f"```json\n{content_str}\n```"

    return md


@teaching_bp.route('/lesson-plans/<int:id>/generate-custom', methods=['POST'])
@teaching_bp.route('/chapters/<int:id>/generate-custom', methods=['POST'])
@jwt_required()
def generate_custom_boppps(id):
    current_user = _get_current_user()
    data = request.get_json()
    stage = data.get('stage')

    lp = _db_get_or_404(LessonPlan, id)
    course = lp.course
    selected_resource_ids = data.get('selected_resource_ids') if isinstance(data.get('selected_resource_ids'), list) else []
    combined_snippets, course_resources, chapter_resources = _build_knowledge_snippets(
        course_id=course.id,
        chapter_id=lp.id,
        manual_snippets=data.get('rag_snippets', ''),
        selected_resource_ids=selected_resource_ids
    )
    pre_quiz_basis = _build_assessment_basis(lp.id, 'pre_assessment')
    post_quiz_basis = _build_assessment_basis(lp.id, 'post_assessment')
    pre_expected_count = _get_expected_assessment_question_count(lp.id, 'pre_assessment')
    post_expected_count = _get_expected_assessment_question_count(lp.id, 'post_assessment')
    bridge_in_basis = _stage_content_basis(lp.id, 'bridge_in')
    objective_basis = _stage_content_basis(lp.id, 'objective')
    participatory_basis = _stage_content_basis(lp.id, 'participatory')
    pre_result_basis = _build_assessment_result_basis(lp.id, 'pre_assessment')
    post_result_basis = _build_assessment_result_basis(lp.id, 'post_assessment')

    # 构造上下文 Context (优先使用前端传来的自定义配置)
    context = {
        "course_name": course.name,
        "topic": lp.title,
        "objectives": course.objectives,
        "audience": "高校学生",

        # 用户自定义部分，如果为空则回退到默认
        "key_points": data.get('focus_points') or data.get('key_points') or course.objectives or "根据主题推断",
        "difficult_points": data.get('focus_points') or data.get('difficult_points') or "根据主题推断",
        "class_minutes": data.get('class_minutes', 45),
        "rag_snippets": combined_snippets,
        "course_kb_count": len(course_resources),
        "lesson_temp_count": len(chapter_resources),
        "chapter_temp_count": len(chapter_resources),
        "pre_assessment_quiz_basis": pre_quiz_basis,
        "post_assessment_quiz_basis": post_quiz_basis,
        "pre_assessment_expected_count": pre_expected_count,
        "post_assessment_expected_count": post_expected_count,
        "bridge_in_stage_content": bridge_in_basis,
        "objective_stage_content": objective_basis,
        "participatory_stage_content": participatory_basis,
        "pre_assessment_result_basis": pre_result_basis,
        "post_assessment_result_basis": post_result_basis,

        # 风格与偏好
        "hook_preference": data.get('hook_preference'),
        "tone": data.get('tone'),

        "model": getattr(Config, 'OLLAMA_MODEL', "qwen3:30b")
    }

    # 调用 LLM 服务
    try:
        generated_data = LLMService.generate(stage, context)

        # 检查是否包含错误信息
        if isinstance(generated_data, dict) and "error" in generated_data:
             msg = generated_data.get("error")
             raw = generated_data.get("raw", "")
             validation_errors = generated_data.get("validation_errors", [])
             print(f"LLM Error: {msg}")
             log_action(
                 current_user.get('id'),
                 current_user.get('username'),
                 f"AI生成教案失败: 课程 {course.name} 章节 {lp.title} 阶段 {stage}，原因: {msg}"
             )
             return api_response(
                 msg=f'LLM Generate Error: {msg}',
                 data={
                     'content': f"生成出错: {msg}\n\nRaw Output:\n{raw}",
                     'valid': False,
                     'retry_used': False,
                     'validation_errors': validation_errors,
                 },
                 code=200
             )

        # === 核心修改：将 JSON 转换为 Markdown ===
        content_str = format_boppps_json_to_markdown(stage, generated_data)
        meta = generated_data.get('_meta', {}) if isinstance(generated_data, dict) else {}

    except Exception as e:
        print(f"Server Error during generation: {str(e)}")
        log_action(
            current_user.get('id'),
            current_user.get('username'),
            f"AI生成教案失败: 课程 {course.name} 章节 {lp.title} 阶段 {stage}，异常: {str(e)}"
        )
        return api_response(msg=f'LLM Generation Failed: {str(e)}', code=500)

    log_action(
        current_user.get('id'),
        current_user.get('username'),
        f"AI生成教案: 课程 {course.name} 章节 {lp.title} 阶段 {stage}"
    )
    # 返回给前端 (不保存)
    return api_response(
        msg='Content generated',
        data={
            'content': content_str,
            'valid': bool(meta.get('valid', True)),
            'retry_used': bool(meta.get('retry_used', False)),
            'validation_errors': [],
            'provider': meta.get('provider', {}),
        }
    )

@teaching_bp.route('/lesson-plans/<int:id>/stages/<stage>', methods=['PUT'])
@teaching_bp.route('/chapters/<int:id>/stages/<stage>', methods=['PUT'])
@jwt_required()
def update_boppps_stage(id, stage):
    data = request.get_json(silent=True) or {}
    new_content = data.get('content')

    if new_content is None:
        return api_response(msg='Missing content', code=400)

    try:
        boppps = BOPPPSContent.query.filter_by(lesson_plan_id=id, stage=stage).first()
        if not boppps:
            return api_response(msg='Stage not found', code=404)

        boppps.content = new_content
        db.session.commit()
        return api_response(msg='Stage updated')
    except OperationalError:
        db.session.rollback()
        return api_response(msg='Database connection lost, please retry', code=503)
    except SQLAlchemyError:
        db.session.rollback()
        return api_response(msg='Stage update failed', code=500)

@teaching_bp.route('/lesson-plans/<int:id>/stages', methods=['GET'])
@teaching_bp.route('/chapters/<int:id>/stages', methods=['GET'])
@jwt_required()
def get_boppps_stages(id):
    current_user = _get_current_user()
    chapter = _db_get_or_404(LessonPlan, id)
    _course, permission_error = _check_chapter_access_or_403(chapter, current_user)
    if permission_error:
        return permission_error
    if current_user.get('role') == 'student':
        return api_response(msg='Students cannot view lesson plans', code=403)

    stages = BOPPPSContent.query.filter_by(lesson_plan_id=id).all()
    result = {s.stage: s.content for s in stages}
    return api_response(data=result)

#
# 4.4 Assessments & Taking (测验与作答)
#

@teaching_bp.route('/lesson-plans/<int:id>/assessments', methods=['GET'])
@teaching_bp.route('/chapters/<int:id>/assessments', methods=['GET'])
@jwt_required()
def list_chapter_assessments(id):
    current_user = _get_current_user()
    chapter = _db_get_or_404(LessonPlan, id)
    _course, permission_error = _check_chapter_access_or_403(chapter, current_user)
    if permission_error:
        return permission_error

    role = current_user.get('role')
    user_id = current_user.get('id')
    query = Assessment.query.filter_by(lesson_plan_id=chapter.id)
    if role == 'student':
        query = query.filter_by(is_pushed=True)
    assessments = query.order_by(Assessment.created_at.desc()).all()
    data = []
    for assessment in assessments:
        payload = {
            'id': assessment.id,
            'title': assessment.title,
            'type': assessment.type,
            'reveal_after_submit': bool(assessment.reveal_after_submit),
            'is_pushed': bool(assessment.is_pushed),
            'pushed_at': assessment.pushed_at.strftime('%Y-%m-%d %H:%M:%S') if assessment.pushed_at else None,
            'question_count': len(assessment.questions),
            'created_at': assessment.created_at.strftime('%Y-%m-%d %H:%M:%S'),
        }
        if role == 'student':
            active_submission = Submission.query.filter_by(
                assessment_id=assessment.id,
                student_id=user_id,
                status='active'
            ).order_by(Submission.submitted_at.desc()).first()
            payload['has_active_submission'] = bool(active_submission)
            payload['my_submission'] = ({
                'id': active_submission.id,
                'score': active_submission.score,
                'submitted_at': active_submission.submitted_at.strftime('%Y-%m-%d %H:%M:%S'),
            } if active_submission else None)
        data.append(payload)
    return api_response(data=data)


@teaching_bp.route('/search-teachers', methods=['GET'])
@jwt_required()
def search_teachers():
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='权限不足', code=403)

    keyword = request.args.get('keyword', '')
    query = User.query.filter_by(role='teacher')
    if keyword:
        query = query.filter(db.or_(User.username.like(f'%{keyword}%'), User.name.like(f'%{keyword}%')))
    teachers = query.limit(30).all()
    data = [{
        'id': t.id,
        'username': t.username,
        'name': t.name,
    } for t in teachers]
    return api_response(data=data)


@teaching_bp.route('/courses/<int:id>/teacher', methods=['GET', 'PUT'])
@jwt_required()
def manage_course_teacher(id):
    current_user = _get_current_user()
    course = _db_get_or_404(Course, id)

    if not _can_manage_course(current_user, course):
        return api_response(msg='无权分配该课程老师', code=403)

    if request.method == 'GET':
        teacher = _db_get(User, course.teacher_id) if course.teacher_id else None
        return api_response(data={
            'course_id': course.id,
            'teacher_id': teacher.id if teacher else None,
            'teacher_username': teacher.username if teacher else None,
            'teacher_name': (teacher.name or teacher.username) if teacher else None,
        })

    data = request.get_json(silent=True) or {}
    teacher_id = data.get('teacher_id')
    teacher = _db_get(User, teacher_id)
    if not teacher or teacher.role != 'teacher':
        return api_response(msg='无效的老师ID', code=400)

    course.teacher_id = teacher.id
    db.session.commit()
    log_action(current_user.get('id'), current_user.get('username'), f"课程 {course.name} 分配老师为 {teacher.username}")
    return api_response(msg='课程老师分配成功', data={
        'course_id': course.id,
        'teacher_id': teacher.id,
        'teacher_username': teacher.username,
        'teacher_name': teacher.name or teacher.username,
    })


@teaching_bp.route('/assessments', methods=['POST'])
@jwt_required()
def create_assessment():
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    data = request.get_json()
    lesson_plan_id = data.get('chapter_id') or data.get('lesson_plan_id')
    chapter = _db_get_or_404(LessonPlan, lesson_plan_id)
    course = _db_get_or_404(Course, chapter.course_id)
    permission_error = _check_course_access_or_403(course, current_user)
    if permission_error:
        return permission_error

    title = (data.get('title') or '').strip()
    if not title:
        return api_response(msg='Title is required', code=400)
    manual_questions = data.get('questions') or []
    question_bank_ids = data.get('question_bank_ids') or []
    if not isinstance(manual_questions, list):
        return api_response(msg='questions must be an array', code=400)
    if not isinstance(question_bank_ids, list):
        return api_response(msg='question_bank_ids must be an array', code=400)
    if len(manual_questions) + len(question_bank_ids) == 0:
        return api_response(msg='Questions are required', code=400)

    new_assessment = Assessment(
        lesson_plan_id=lesson_plan_id,
        type=data.get('type') or 'post_assessment',
        title=title,
        reveal_after_submit=bool(data.get('reveal_after_submit', False))
    )
    db.session.add(new_assessment)
    db.session.flush()

    imported_bank_items = []
    if question_bank_ids:
        imported_bank_items = QuestionBankItem.query.filter(QuestionBankItem.id.in_(question_bank_ids)).all()
        if len(imported_bank_items) != len(set(question_bank_ids)):
            db.session.rollback()
            return api_response(msg='Some question bank ids are invalid', code=400)
        for item in imported_bank_items:
            if item.course_id != course.id:
                db.session.rollback()
                return api_response(msg='Question bank item does not belong to this course', code=400)

    for q in manual_questions:
        content = (q.get('content') or '').strip()
        if not content:
            db.session.rollback()
            return api_response(msg='Question content is required', code=400)

        q_type = q.get('q_type', 'choice')
        options = q.get('options') or []
        answer = q.get('answer')
        explanation = (q.get('explanation') or '').strip() or None
        if q_type == 'choice':
            if not isinstance(options, list) or len(options) < 2:
                db.session.rollback()
                return api_response(msg='Choice question requires at least two options', code=400)
            if answer not in options:
                db.session.rollback()
                return api_response(msg='Answer must be one of options', code=400)

        new_q = Question(
            assessment_id=new_assessment.id,
            content=content,
            q_type=q_type,
            options=options,
            answer=answer,
            explanation=explanation,
            question_bank_item_id=None,
        )
        db.session.add(new_q)

    for item in imported_bank_items:
        db.session.add(
            Question(
                assessment_id=new_assessment.id,
                content=item.stem,
                q_type='choice',
                options=item.options,
                answer=item.answer,
                explanation=item.explanation,
                question_bank_item_id=item.id,
            )
        )

    db.session.commit()
    log_action(
        current_user.get('id'),
        current_user.get('username'),
        f"创建测验: 课程 {course.name} 章节 {chapter.title} 标题 {new_assessment.title}，题目数 {len(manual_questions) + len(imported_bank_items)}"
    )
    return api_response(msg='Assessment created', data={'id': new_assessment.id}, code=201)


@teaching_bp.route('/assessments/<int:id>', methods=['PUT'])
@jwt_required()
def update_assessment(id):
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    assessment = _db_get_or_404(Assessment, id)
    chapter = _db_get_or_404(LessonPlan, assessment.lesson_plan_id)
    course = _db_get_or_404(Course, chapter.course_id)
    permission_error = _check_course_access_or_403(course, current_user)
    if permission_error:
        return permission_error

    invalidated_count = 0
    if assessment.is_pushed:
        active_submissions = Submission.query.filter_by(assessment_id=assessment.id, status='active').all()
        for sub in active_submissions:
            sub.status = 'rejected'
            sub.reject_reason = '测验题目已更新，请重新作答'
        invalidated_count = len(active_submissions)

    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    if not title:
        return api_response(msg='Title is required', code=400)
    manual_questions = data.get('questions') or []
    question_bank_ids = data.get('question_bank_ids') or []
    if not isinstance(manual_questions, list) or not isinstance(question_bank_ids, list):
        return api_response(msg='questions/question_bank_ids must be arrays', code=400)
    if len(manual_questions) + len(question_bank_ids) == 0:
        return api_response(msg='Questions are required', code=400)

    imported_bank_items = []
    if question_bank_ids:
        imported_bank_items = QuestionBankItem.query.filter(QuestionBankItem.id.in_(question_bank_ids)).all()
        if len(imported_bank_items) != len(set(question_bank_ids)):
            return api_response(msg='Some question bank ids are invalid', code=400)
        for item in imported_bank_items:
            if item.course_id != course.id:
                return api_response(msg='Question bank item does not belong to this course', code=400)

    parsed_questions = []
    for q in manual_questions:
        content = (q.get('content') or '').strip()
        q_type = q.get('q_type', 'choice')
        options = q.get('options') or []
        answer = q.get('answer')
        explanation = (q.get('explanation') or '').strip() or None
        if not content:
            return api_response(msg='Question content is required', code=400)
        if q_type == 'choice':
            if not isinstance(options, list) or len(options) < 2:
                return api_response(msg='Choice question requires at least two options', code=400)
            if answer not in options:
                return api_response(msg='Answer must be one of options', code=400)
        parsed_questions.append((content, q_type, options, answer, explanation))

    Question.query.filter_by(assessment_id=assessment.id).delete(synchronize_session=False)
    assessment.title = title
    assessment.type = data.get('type') or assessment.type
    assessment.reveal_after_submit = bool(data.get('reveal_after_submit', assessment.reveal_after_submit))
    db.session.flush()

    for content, q_type, options, answer, explanation in parsed_questions:
        db.session.add(
            Question(
                assessment_id=assessment.id,
                content=content,
                q_type=q_type,
                options=options,
                answer=answer,
                explanation=explanation,
                question_bank_item_id=None,
            )
        )
    for item in imported_bank_items:
        db.session.add(
            Question(
                assessment_id=assessment.id,
                content=item.stem,
                q_type='choice',
                options=item.options,
                answer=item.answer,
                explanation=item.explanation,
                question_bank_item_id=item.id,
            )
        )
    db.session.commit()
    log_action(
        current_user.get('id'),
        current_user.get('username'),
        f"编辑测验: 课程 {course.name} 章节 {chapter.title} 标题 {assessment.title}，题目数 {len(parsed_questions) + len(imported_bank_items)}，打回提交 {invalidated_count}"
    )
    return api_response(msg='Assessment updated', data={'id': assessment.id, 'invalidated_submissions': invalidated_count})


@teaching_bp.route('/assessments/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_assessment(id):
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    assessment = _db_get_or_404(Assessment, id)
    chapter = _db_get_or_404(LessonPlan, assessment.lesson_plan_id)
    course = _db_get_or_404(Course, chapter.course_id)
    if not _can_manage_course(current_user, course):
        return api_response(msg='Permission denied: invalid assessment', code=403)

    assessment_title = assessment.title
    _delete_assessment_related_data(assessment)
    db.session.commit()

    log_action(
        current_user.get('id'),
        current_user.get('username'),
        f"删除测验: 课程 {course.name} 章节 {chapter.title} 标题 {assessment_title}"
    )
    return api_response(msg='Assessment deleted', data={'id': id})


@teaching_bp.route('/assessments/<int:id>/push', methods=['PATCH'])
@jwt_required()
def push_assessment(id):
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    assessment = _db_get_or_404(Assessment, id)
    chapter = _db_get_or_404(LessonPlan, assessment.lesson_plan_id)
    course = _db_get_or_404(Course, chapter.course_id)
    permission_error = _check_course_access_or_403(course, current_user)
    if permission_error:
        return permission_error

    if assessment.is_pushed:
        return api_response(msg='Assessment already pushed', data={'id': assessment.id, 'is_pushed': True})

    assessment.is_pushed = True
    assessment.pushed_at = datetime.now(UTC)
    db.session.commit()
    log_action(
        current_user.get('id'),
        current_user.get('username'),
        f"推送测验: 课程 {course.name} 章节 {chapter.title} 标题 {assessment.title}"
    )
    return api_response(msg='Assessment pushed', data={'id': assessment.id, 'is_pushed': True, 'pushed_at': assessment.pushed_at.strftime('%Y-%m-%d %H:%M:%S')})


@teaching_bp.route('/students/pending-assessments', methods=['GET'])
@jwt_required()
def list_student_pending_assessments():
    current_user = _get_current_user()
    if current_user.get('role') != 'student':
        return api_response(msg='Only students can view pending assessments', code=403)
    student_id = current_user.get('id')
    user = _db_get(User, student_id)
    enrolled_ids = [c.id for c in user.enrolled_courses] if user else []
    if not enrolled_ids:
        return api_response(data=[])

    chapters = LessonPlan.query.filter(LessonPlan.course_id.in_(enrolled_ids)).all()
    chapter_ids = [c.id for c in chapters]
    if not chapter_ids:
        return api_response(data=[])

    assessments = Assessment.query.filter(
        Assessment.lesson_plan_id.in_(chapter_ids),
        Assessment.is_pushed == True
    ).order_by(Assessment.pushed_at.desc(), Assessment.created_at.desc()).all()

    pending = []
    for ass in assessments:
        submitted = Submission.query.filter_by(
            assessment_id=ass.id,
            student_id=student_id,
            status='active'
        ).first()
        if submitted:
            continue
        chapter = _db_get(LessonPlan, ass.lesson_plan_id)
        course = _db_get(Course, chapter.course_id) if chapter else None
        pending.append({
            'assessment_id': ass.id,
            'title': ass.title,
            'type': ass.type,
            'course_id': course.id if course else None,
            'course_name': course.name if course else None,
            'chapter_id': chapter.id if chapter else None,
            'chapter_title': chapter.title if chapter else None,
            'pushed_at': ass.pushed_at.strftime('%Y-%m-%d %H:%M:%S') if ass.pushed_at else None,
        })
    return api_response(data=pending)


@teaching_bp.route('/courses/<int:id>/student-assessments', methods=['GET'])
@jwt_required()
def list_student_course_assessments(id):
    current_user = _get_current_user()
    if current_user.get('role') != 'student':
        return api_response(msg='Only students can view this endpoint', code=403)

    course = _db_get_or_404(Course, id)
    permission_error = _check_course_access_or_403(course, current_user)
    if permission_error:
        return permission_error

    chapter_ids = [lp.id for lp in LessonPlan.query.filter_by(course_id=course.id).all()]
    if not chapter_ids:
        return api_response(data=[])

    assessments = Assessment.query.filter(
        Assessment.lesson_plan_id.in_(chapter_ids),
        Assessment.is_pushed == True
    ).order_by(Assessment.pushed_at.desc(), Assessment.created_at.desc()).all()

    data = []
    for assessment in assessments:
        chapter = _db_get(LessonPlan, assessment.lesson_plan_id)
        active_submission = Submission.query.filter_by(
            assessment_id=assessment.id,
            student_id=current_user.get('id'),
            status='active'
        ).order_by(Submission.submitted_at.desc()).first()
        data.append({
            'id': assessment.id,
            'title': assessment.title,
            'type': assessment.type,
            'chapter_id': chapter.id if chapter else None,
            'chapter_title': chapter.title if chapter else None,
            'question_count': len(assessment.questions),
            'is_pushed': bool(assessment.is_pushed),
            'pushed_at': assessment.pushed_at.strftime('%Y-%m-%d %H:%M:%S') if assessment.pushed_at else None,
            'has_active_submission': bool(active_submission),
            'my_submission': ({
                'id': active_submission.id,
                'score': active_submission.score,
                'submitted_at': active_submission.submitted_at.strftime('%Y-%m-%d %H:%M:%S'),
            } if active_submission else None),
        })

    return api_response(data=data)

@teaching_bp.route('/assessments/<int:id>', methods=['GET'])
@jwt_required()
def get_assessment(id):
    current_user = _get_current_user()
    assessment = _db_get_or_404(Assessment, id)
    chapter = _db_get_or_404(LessonPlan, assessment.lesson_plan_id)
    _course, permission_error = _check_chapter_access_or_403(chapter, current_user)
    if permission_error:
        return permission_error
    if current_user.get('role') == 'student' and not assessment.is_pushed:
        return api_response(msg='Assessment is not pushed to students yet', code=403)

    include_answer = current_user.get('role') in ['admin', 'teacher']
    questions = []
    for q in assessment.questions:
        payload = {
            'id': q.id,
            'content': q.content,
            'q_type': q.q_type,
            'options': q.options,
            'explanation': q.explanation,
        }
        if include_answer:
            payload['answer'] = q.answer
            payload['question_bank_item_id'] = q.question_bank_item_id
        questions.append(payload)

    data = {
        'id': assessment.id,
        'title': assessment.title,
        'type': assessment.type,
        'reveal_after_submit': bool(assessment.reveal_after_submit),
        'is_pushed': bool(assessment.is_pushed),
        'pushed_at': assessment.pushed_at.strftime('%Y-%m-%d %H:%M:%S') if assessment.pushed_at else None,
        'questions': questions
    }
    return api_response(data=data)

@teaching_bp.route('/assessments/<int:id>/submit', methods=['POST'])
@jwt_required()
def submit_assessment(id):
    current_user = _get_current_user()
    if current_user.get('role') != 'student':
        return api_response(msg='Only students can submit assessments', code=403)

    assessment = _db_get_or_404(Assessment, id)
    if not assessment.is_pushed:
        return api_response(msg='Assessment is not pushed to students yet', code=400)
    chapter = _db_get_or_404(LessonPlan, assessment.lesson_plan_id)
    _course, permission_error = _check_chapter_access_or_403(chapter, current_user)
    if permission_error:
        return permission_error

    existed_active = Submission.query.filter_by(
        assessment_id=id,
        student_id=current_user.get('id'),
        status='active'
    ).first()
    if existed_active:
        return api_response(msg='Assessment already submitted. Ask teacher to reject before retry.', code=400)

    data = request.get_json(silent=True) or {}
    answers = data.get('answers') or {}
    if not isinstance(answers, dict):
        return api_response(msg='answers must be an object', code=400)

    total_questions = len(assessment.questions)
    correct_count = 0

    for q in assessment.questions:
        user_answer = answers.get(str(q.id))
        if user_answer == q.answer:
            correct_count += 1

    score = (correct_count / total_questions) * 100 if total_questions > 0 else 0

    submission = Submission(
        assessment_id=id,
        student_id=current_user.get('id'),
        answers=answers,
        score=score,
        status='active'
    )
    db.session.add(submission)
    db.session.commit()
    log_action(
        current_user.get('id'),
        current_user.get('username'),
        f"提交测验: 章节 {chapter.title} 标题 {assessment.title}，得分 {round(score, 2)}"
    )

    return api_response(msg='Submitted', data={'score': score, 'submission_id': submission.id})


@teaching_bp.route('/assessments/<int:id>/my-result', methods=['GET'])
@jwt_required()
def get_my_assessment_result(id):
    current_user = _get_current_user()
    if current_user.get('role') != 'student':
        return api_response(msg='Only students can view own result', code=403)

    assessment = _db_get_or_404(Assessment, id)
    chapter = _db_get_or_404(LessonPlan, assessment.lesson_plan_id)
    _course, permission_error = _check_chapter_access_or_403(chapter, current_user)
    if permission_error:
        return permission_error

    submission = Submission.query.filter_by(
        assessment_id=id,
        student_id=current_user.get('id'),
        status='active'
    ).order_by(Submission.submitted_at.desc()).first()
    if not submission:
        return api_response(msg='No active submission found', code=404)

    data = {
        'assessment_id': assessment.id,
        'title': assessment.title,
        'score': submission.score,
        'submission_id': submission.id,
        'submitted_at': submission.submitted_at.strftime('%Y-%m-%d %H:%M:%S'),
        'reveal_after_submit': bool(assessment.reveal_after_submit),
        'question_results': [],
        'message': None
    }
    if not assessment.reveal_after_submit:
        data['message'] = 'Teacher has not enabled detail review for this assessment'
        return api_response(data=data)

    answer_map = submission.answers or {}
    question_results = []
    for q in assessment.questions:
        my_answer = answer_map.get(str(q.id))
        question_results.append({
            'question_id': q.id,
            'content': q.content,
            'q_type': q.q_type,
            'options': q.options,
            'explanation': q.explanation,
            'my_answer': my_answer,
            'correct_answer': q.answer,
            'is_correct': my_answer == q.answer
        })
    data['question_results'] = question_results
    return api_response(data=data)


@teaching_bp.route('/assessments/<int:id>/submissions', methods=['GET'])
@jwt_required()
def list_assessment_submissions(id):
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    assessment = _db_get_or_404(Assessment, id)
    chapter = _db_get_or_404(LessonPlan, assessment.lesson_plan_id)
    _course, permission_error = _check_chapter_access_or_403(chapter, current_user)
    if permission_error:
        return permission_error

    submissions = Submission.query.filter_by(assessment_id=id).order_by(Submission.submitted_at.desc()).all()
    data = []
    for sub in submissions:
        student = _db_get(User, sub.student_id)
        data.append({
            'id': sub.id,
            'student_id': sub.student_id,
            'student_username': student.username if student else '-',
            'student_name': (student.name or student.username) if student else '-',
            'student_major': student.major if student else None,
            'student_class_name': student.class_name if student else None,
            'score': sub.score,
            'status': sub.status,
            'reject_reason': sub.reject_reason,
            'submitted_at': sub.submitted_at.strftime('%Y-%m-%d %H:%M:%S'),
        })
    return api_response(data=data)


@teaching_bp.route('/submissions/<int:id>/status', methods=['PATCH'])
@jwt_required()
def update_submission_status(id):
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    submission = _db_get_or_404(Submission, id)
    assessment = _db_get_or_404(Assessment, submission.assessment_id)
    chapter = _db_get_or_404(LessonPlan, assessment.lesson_plan_id)
    _course, permission_error = _check_chapter_access_or_403(chapter, current_user)
    if permission_error:
        return permission_error

    data = request.get_json(silent=True) or {}
    status = data.get('status')
    if status != 'rejected':
        return api_response(msg="Only 'rejected' status update is supported", code=400)

    if submission.status == 'rejected':
        return api_response(msg='Submission already rejected', data={'id': submission.id})

    submission.status = 'rejected'
    submission.reject_reason = (data.get('reason') or '').strip() or None
    db.session.commit()
    return api_response(msg='Submission status updated', data={'id': submission.id, 'status': submission.status})


@teaching_bp.route('/question-bank', methods=['GET'])
@jwt_required()
def list_question_bank():
    current_user = _get_current_user()
    role = current_user.get('role')
    user_id = current_user.get('id')

    query = QuestionBankItem.query
    course_id = request.args.get('course_id', type=int)
    chapter_id = request.args.get('chapter_id', type=int)
    difficulty = request.args.get('difficulty', type=int)
    tag = (request.args.get('tag') or '').strip()

    if role == 'teacher':
        teacher_course_ids = [c.id for c in Course.query.filter_by(teacher_id=user_id).all()]
        query = query.filter(QuestionBankItem.course_id.in_(teacher_course_ids) if teacher_course_ids else false())
    elif role == 'student':
        user = _db_get(User, user_id)
        enrolled_ids = [c.id for c in user.enrolled_courses] if user else []
        query = query.filter(QuestionBankItem.course_id.in_(enrolled_ids) if enrolled_ids else false())

    if course_id:
        query = query.filter_by(course_id=course_id)
    if chapter_id:
        query = query.filter_by(chapter_id=chapter_id)
    if difficulty:
        query = query.filter_by(difficulty=difficulty)

    items = query.order_by(QuestionBankItem.created_at.desc()).all()
    payload = [_question_bank_payload(item) for item in items]
    if tag:
        payload = [item for item in payload if tag in (item.get('tags') or [])]
    return api_response(data=payload)


@teaching_bp.route('/question-bank', methods=['POST'])
@jwt_required()
def create_question_bank_item():
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    data = request.get_json(silent=True) or {}
    course_id = data.get('course_id')
    chapter_id = data.get('chapter_id')
    stem = (data.get('stem') or '').strip()
    options = data.get('options') if isinstance(data.get('options'), list) else []
    options = [str(x).strip() for x in options if str(x).strip()]
    answer = (data.get('answer') or '').strip()
    explanation = (data.get('explanation') or '').strip() or None
    tags = data.get('tags') if isinstance(data.get('tags'), list) else []
    tags = [str(t).strip() for t in tags if str(t).strip()]
    difficulty = int(data.get('difficulty') or 3)
    difficulty = max(1, min(5, difficulty))

    if not course_id or not stem or len(options) < 2 or answer not in options:
        return api_response(msg='Invalid question payload', code=400)

    course = _db_get_or_404(Course, course_id)
    if current_user.get('role') == 'teacher' and course.teacher_id != current_user.get('id'):
        return api_response(msg='Permission denied: invalid course', code=403)

    if chapter_id:
        chapter = _db_get_or_404(LessonPlan, chapter_id)
        if chapter.course_id != course.id:
            return api_response(msg='Chapter does not belong to course', code=400)

    item = QuestionBankItem(
        course_id=course.id,
        chapter_id=chapter_id,
        source=(data.get('source') or 'manual').strip() or 'manual',
        difficulty=difficulty,
        tags=tags,
        stem=stem,
        options=options,
        answer=answer,
        explanation=explanation,
        created_by=current_user.get('id'),
    )
    db.session.add(item)
    db.session.commit()
    return api_response(msg='Question bank item created', data=_question_bank_payload(item), code=201)


@teaching_bp.route('/question-bank/<int:id>', methods=['PUT'])
@jwt_required()
def update_question_bank_item(id):
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    item = _db_get_or_404(QuestionBankItem, id)
    course = _db_get_or_404(Course, item.course_id)
    if current_user.get('role') == 'teacher' and course.teacher_id != current_user.get('id'):
        return api_response(msg='Permission denied: invalid question', code=403)

    data = request.get_json(silent=True) or {}
    stem = (data.get('stem') or '').strip()
    options = data.get('options') if isinstance(data.get('options'), list) else []
    options = [str(x).strip() for x in options if str(x).strip()]
    answer = (data.get('answer') or '').strip()
    explanation = (data.get('explanation') or '').strip() or None
    tags = data.get('tags') if isinstance(data.get('tags'), list) else []
    tags = [str(t).strip() for t in tags if str(t).strip()]
    difficulty = int(data.get('difficulty') or item.difficulty or 3)
    difficulty = max(1, min(5, difficulty))

    if not stem or len(options) < 2 or answer not in options:
        return api_response(msg='Invalid question payload', code=400)

    item.stem = stem
    item.options = options
    item.answer = answer
    item.explanation = explanation
    item.tags = tags
    item.difficulty = difficulty
    db.session.commit()
    return api_response(msg='Question bank item updated', data=_question_bank_payload(item))


@teaching_bp.route('/question-bank/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_question_bank_item(id):
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    item = _db_get_or_404(QuestionBankItem, id)
    course = _db_get_or_404(Course, item.course_id)
    if current_user.get('role') == 'teacher' and course.teacher_id != current_user.get('id'):
        return api_response(msg='Permission denied: invalid question', code=403)

    linked_questions = Question.query.filter_by(question_bank_item_id=item.id).count()
    db.session.delete(item)
    db.session.commit()
    return api_response(msg='Question bank item deleted', data={'id': id, 'linked_questions': linked_questions})


@teaching_bp.route('/question-bank/generate', methods=['POST'])
@jwt_required()
def generate_question_bank_items():
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    data = request.get_json(silent=True) or {}
    course_id = data.get('course_id')
    chapter_id = data.get('chapter_id')
    count = int(data.get('count') or 5)
    difficulty = int(data.get('difficulty') or 3)
    tags = data.get('tags') if isinstance(data.get('tags'), list) else []
    tags = [str(t).strip() for t in tags if str(t).strip()]
    save_to_bank = bool(data.get('save_to_bank', True))
    count = max(1, min(20, count))
    difficulty = max(1, min(5, difficulty))

    course = _db_get_or_404(Course, course_id)
    if current_user.get('role') == 'teacher' and course.teacher_id != current_user.get('id'):
        return api_response(msg='Permission denied: invalid course', code=403)
    chapter = None
    if chapter_id:
        chapter = _db_get_or_404(LessonPlan, chapter_id)
        if chapter.course_id != course.id:
            return api_response(msg='Chapter does not belong to course', code=400)

    combined_snippets, _course_resources, _chapter_resources = _build_knowledge_snippets(
        course_id=course.id,
        chapter_id=chapter.id if chapter else None,
        manual_snippets=data.get('rag_snippets', '')
    )
    gen_result = LLMService.generate_choice_questions({
        'course_name': course.name,
        'topic': chapter.title if chapter else data.get('topic') or course.name,
        'audience': '高校学生',
        'class_minutes': 45,
        'key_points': data.get('key_points') or course.objectives or '',
        'difficult_points': data.get('difficult_points') or '',
        'objectives': course.objectives or '',
        'rag_snippets': combined_snippets,
        'count': count,
        'difficulty': difficulty,
        'tags': tags,
    })
    if gen_result.get('error'):
        log_action(
            current_user.get('id'),
            current_user.get('username'),
            f"AI生成题库失败: 课程 {course.name}，原因: {gen_result.get('error')}"
        )
        return api_response(msg=f"Question generation failed: {gen_result.get('error')}", code=400, data=gen_result)

    questions = gen_result.get('questions', [])
    existing_items = QuestionBankItem.query.filter_by(
        course_id=course.id,
        chapter_id=chapter.id if chapter else None
    ).all()

    def normalize_stem(stem):
        import re
        text = (stem or '').strip().lower()
        text = re.sub(r"\s+", "", text)
        text = re.sub(r"[，。！？、,.!?;；:：\"'“”‘’（）()\\[\\]{}]", "", text)
        return text

    seen = {normalize_stem(item.stem) for item in existing_items if item.stem}
    deduped_questions = []
    for q in questions:
        key = normalize_stem(q.get('stem'))
        if not key or key in seen:
            continue
        seen.add(key)
        deduped_questions.append(q)
    questions = deduped_questions

    saved_items = []
    if save_to_bank:
        for q in questions:
            item = QuestionBankItem(
                course_id=course.id,
                chapter_id=chapter.id if chapter else None,
                source='ai',
                difficulty=q.get('difficulty', difficulty),
                tags=q.get('tags', tags),
                stem=q.get('stem'),
                options=q.get('options'),
                answer=q.get('answer'),
                explanation=(q.get('explanation') or '').strip() or None,
                created_by=current_user.get('id'),
            )
            db.session.add(item)
            saved_items.append(item)
        db.session.commit()
    log_action(
        current_user.get('id'),
        current_user.get('username'),
        f"AI生成题目: 课程 {course.name}，生成 {len(questions)} 题，保存到题库 {len(saved_items)} 题"
    )
    return api_response(
        msg='Questions generated',
        data={
            'questions': questions,
            'deduped_count': len(deduped_questions),
            'saved_items': [_question_bank_payload(item) for item in saved_items],
        }
    )


@teaching_bp.route('/assessments/<int:id>/import-questions', methods=['POST'])
@jwt_required()
def import_questions_to_assessment(id):
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    assessment = _db_get_or_404(Assessment, id)
    chapter = _db_get_or_404(LessonPlan, assessment.lesson_plan_id)
    course = _db_get_or_404(Course, chapter.course_id)
    if current_user.get('role') == 'teacher' and course.teacher_id != current_user.get('id'):
        return api_response(msg='Permission denied: invalid assessment', code=403)

    data = request.get_json(silent=True) or {}
    qb_ids = data.get('question_bank_ids') or []
    if not isinstance(qb_ids, list) or not qb_ids:
        return api_response(msg='question_bank_ids is required', code=400)

    items = QuestionBankItem.query.filter(QuestionBankItem.id.in_(qb_ids)).all()
    if len(items) != len(set(qb_ids)):
        return api_response(msg='Some question bank ids are invalid', code=400)

    for item in items:
        if item.course_id != course.id:
            return api_response(msg='Question bank item does not belong to this course', code=400)
        db.session.add(
            Question(
                assessment_id=assessment.id,
                content=item.stem,
                q_type='choice',
                options=item.options,
                answer=item.answer,
                explanation=item.explanation,
                question_bank_item_id=item.id,
            )
        )
    db.session.commit()
    log_action(
        current_user.get('id'),
        current_user.get('username'),
        f"导入题库到测验: 课程 {course.name} 测验 {assessment.title}，导入 {len(items)} 题"
    )
    return api_response(msg='Questions imported', data={'count': len(items)})

@teaching_bp.route('/lesson-plans/<int:id>/analytics/basic', methods=['GET'])
@teaching_bp.route('/chapters/<int:id>/analytics/basic', methods=['GET'])
@jwt_required()
def get_analytics(id):
    current_user = _get_current_user()
    chapter = _db_get_or_404(LessonPlan, id)
    _course, permission_error = _check_chapter_access_or_403(chapter, current_user)
    if permission_error:
        return permission_error

    assessments = Assessment.query.filter_by(lesson_plan_id=id).all()

    data = []
    for assess in assessments:
        submissions = Submission.query.filter_by(assessment_id=assess.id, status='active').all()
        if not submissions:
            continue

        avg_score = sum(s.score for s in submissions) / len(submissions)
        data.append({
            'assessment_id': assess.id,
            'title': assess.title,
            'avg_score': avg_score,
            'submission_count': len(submissions),
            'reveal_after_submit': bool(assess.reveal_after_submit),
        })

    return api_response(data=data)


@teaching_bp.route('/assessments/<int:id>/analytics/detail', methods=['GET'])
@jwt_required()
def get_assessment_detail_analytics(id):
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    assessment = _db_get_or_404(Assessment, id)
    chapter = _db_get_or_404(LessonPlan, assessment.lesson_plan_id)
    _course, permission_error = _check_chapter_access_or_403(chapter, current_user)
    if permission_error:
        return permission_error

    return api_response(data=_build_assessment_detail_analytics(assessment))


@teaching_bp.route('/assessments/<int:id>/analytics/ai', methods=['GET'])
@jwt_required()
def get_assessment_ai_analytics(id):
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    assessment = _db_get_or_404(Assessment, id)
    chapter = _db_get_or_404(LessonPlan, assessment.lesson_plan_id)
    _course, permission_error = _check_chapter_access_or_403(chapter, current_user)
    if permission_error:
        return permission_error

    detail = _build_assessment_detail_analytics(assessment)
    focus_student_ids = request.args.get('focus_student_ids', '')
    focus_question_ids = request.args.get('focus_question_ids', '')
    focus_student_id_set = {int(x) for x in focus_student_ids.split(',') if x.strip().isdigit()}
    focus_question_id_set = {int(x) for x in focus_question_ids.split(',') if x.strip().isdigit()}
    hard_questions = sorted(
        detail.get('question_stats', []),
        key=lambda x: (x.get('accuracy') if x.get('accuracy') is not None else 999)
    )[:3]
    hard_question_lines = []
    for item in hard_questions:
        acc = item.get('accuracy')
        acc_text = f"{acc}%" if acc is not None else "-"
        hard_question_lines.append(f"- Q{item.get('question_id')}: 正确率 {acc_text} | 题干: {item.get('content')}")

    focus_students = [s for s in detail.get('student_stats', []) if s.get('student_id') in focus_student_id_set]
    focus_questions = [q for q in detail.get('question_stats', []) if q.get('question_id') in focus_question_id_set]

    prompt = (
        "你是教学数据分析助手。请根据测验统计，输出严格 JSON，按“全局->细节”组织：\n"
        "{\n"
        '  "global_summary": {"conclusion":"", "overall_risk":"低/中/高", "teaching_priority":[""]},\n'
        '  "question_insights": [{"question_id":0,"reason":"","teaching_advice":"","in_class_explanation":""}],\n'
        '  "student_insights": [{"student_id":0,"student_name":"","risk_level":"低/中/高","coaching_advice":""}],\n'
        '  "teaching_suggestions": ["", ""],\n'
        '  "follow_up_actions": [""]\n'
        "}\n"
        "统计数据：\n"
        f"测验标题: {detail.get('assessment', {}).get('title')}\n"
        f"平均分: {detail.get('assessment', {}).get('average_score')}\n"
        f"参与率: {detail.get('participation', {}).get('participation_rate')}%\n"
        "低正确率题目：\n"
        + ("\n".join(hard_question_lines) if hard_question_lines else "- 无")
        + "\n重点关注学生：\n"
        + (json.dumps(focus_students, ensure_ascii=False) if focus_students else "[]")
        + "\n重点关注题目：\n"
        + (json.dumps(focus_questions, ensure_ascii=False) if focus_questions else "[]")
    )

    ai_payload = None
    provider = None
    try:
        provider = LLMService.get_active_provider()
        raw = LLMService._call_provider_text(
            provider,
            "你是严谨的教学分析助手，只返回 JSON。",
            prompt,
            timeout=90,
        )
        if not raw.get('error'):
            parsed = LLMService._try_parse_json(raw.get('text', ''))
            if isinstance(parsed, dict):
                ai_payload = parsed
    except Exception:
        ai_payload = None

    if not isinstance(ai_payload, dict):
        fallback_difficulties = []
        for item in hard_questions:
            fallback_difficulties.append({
                'question_id': item.get('question_id'),
                'reason': f"该题正确率较低（{item.get('accuracy') if item.get('accuracy') is not None else '-'}%）",
                'teaching_advice': '先讲清概念边界，再给一个反例和一个标准例题进行对比。',
            })
        ai_payload = {
            'global_summary': {
                'conclusion': '当前测验存在集中薄弱点，建议围绕低正确率题目进行针对性讲解。',
                'overall_risk': '中',
                'teaching_priority': ['先处理低正确率题目', '再做分层讲解与跟练'],
            },
            'question_insights': [{
                'question_id': item.get('question_id'),
                'reason': f"该题正确率较低（{item.get('accuracy') if item.get('accuracy') is not None else '-'}%）",
                'teaching_advice': '先讲清概念边界，再给一个反例和一个标准例题进行对比。',
                'in_class_explanation': item.get('explanation') or '可按“概念定义-典型误区-变式练习”三步讲解。',
            } for item in hard_questions],
            'student_insights': [{
                'student_id': s.get('student_id'),
                'student_name': s.get('student_name'),
                'risk_level': '高' if float(s.get('score', 0) or 0) < 60 else ('中' if float(s.get('score', 0) or 0) < 80 else '低'),
                'coaching_advice': '建议课后进行1对1错题复盘，并安排2道同构题巩固。'
            } for s in (focus_students[:8] if focus_students else sorted(detail.get('student_stats', []), key=lambda x: float(x.get('score', 0) or 0))[:5])],
            'teaching_suggestions': [
                '先用 3-5 分钟回顾易错概念，再做同构变式练习。',
                '对错误率高的选项给出错误原因，帮助学生形成辨析能力。',
                '按分层分组补救：低分组先保基础，中高分组做迁移题。',
            ],
            'follow_up_actions': ['下一次小测前先做5分钟诊断题', '对重点关注学生进行课后跟踪'],
        }
        log_action(
            current_user.get('id'),
            current_user.get('username'),
            f"AI教学分析降级: 测验 {assessment.title} 使用回退分析结果"
        )
    else:
        log_action(
            current_user.get('id'),
            current_user.get('username'),
            f"AI教学分析: 测验 {assessment.title} 生成成功"
        )

    # 兜底标准化：避免模型返回缺字段或空数组导致前端空白。
    if not isinstance(ai_payload.get('global_summary'), dict):
        ai_payload['global_summary'] = {
            'conclusion': '本次测验已完成分析，请结合题目与学生表现安排针对性讲解。',
            'overall_risk': '中',
            'teaching_priority': [],
        }
    if not isinstance(ai_payload.get('question_insights'), list):
        ai_payload['question_insights'] = []
    if not isinstance(ai_payload.get('student_insights'), list):
        ai_payload['student_insights'] = []
    if not isinstance(ai_payload.get('teaching_suggestions'), list):
        ai_payload['teaching_suggestions'] = []
    if not isinstance(ai_payload.get('follow_up_actions'), list):
        ai_payload['follow_up_actions'] = []

    if not ai_payload.get('question_insights'):
        ai_payload['question_insights'] = [{
            'question_id': item.get('question_id'),
            'reason': f"该题正确率较低（{item.get('accuracy') if item.get('accuracy') is not None else '-'}%）",
            'teaching_advice': '建议课堂中先做概念澄清，再用同构题进行即时检验。',
            'in_class_explanation': item.get('explanation') or '建议按“概念-误区-变式”进行讲解。',
        } for item in hard_questions]

    if not ai_payload.get('student_insights'):
        fallback_students = focus_students[:8] if focus_students else sorted(
            detail.get('student_stats', []),
            key=lambda x: float(x.get('score', 0) or 0)
        )[:5]
        ai_payload['student_insights'] = [{
            'student_id': s.get('student_id'),
            'student_name': s.get('student_name') or s.get('student_username') or '-',
            'risk_level': '高' if float(s.get('score', 0) or 0) < 60 else ('中' if float(s.get('score', 0) or 0) < 80 else '低'),
            'coaching_advice': '建议先做错题复盘，再安排2道同构练习，下一次课前进行口头抽查。',
        } for s in fallback_students]

    if not ai_payload.get('teaching_suggestions'):
        ai_payload['teaching_suggestions'] = [
            '围绕低正确率题目进行 5-8 分钟针对性讲解。',
            '用“先独立作答-后同伴互评”的方式巩固易错知识点。',
        ]

    return api_response(data={
        'analysis': ai_payload,
        'based_on': {
            'assessment_id': detail.get('assessment', {}).get('id'),
            'average_score': detail.get('assessment', {}).get('average_score'),
            'participation_rate': detail.get('participation', {}).get('participation_rate'),
            'low_accuracy_questions': hard_questions,
            'focus_students': focus_students,
            'focus_questions': focus_questions,
        },
        'provider': provider,
    })


@teaching_bp.route('/resources', methods=['GET'])
@jwt_required()
def get_resources():
    current_user = _get_current_user()
    role = current_user.get('role')
    user_id = current_user.get('id')

    query = Resource.query
    course_id = request.args.get('course_id', type=int)
    chapter_id = request.args.get('chapter_id', type=int)

    if role == 'teacher':
        query = query.filter(Resource.uploader_id == user_id)
    elif role == 'student':
        user = _db_get(User, user_id)
        enrolled_ids = [c.id for c in user.enrolled_courses] if user else []
        query = query.filter(Resource.course_id.in_(enrolled_ids) if enrolled_ids else false())

    if course_id:
        query = query.filter_by(course_id=course_id)
    if chapter_id:
        query = query.filter_by(chapter_id=chapter_id)

    resources = query.order_by(Resource.created_at.desc()).all()
    return api_response(data=[_resource_payload(item) for item in resources])


@teaching_bp.route('/courses/<int:course_id>/resources', methods=['GET'])
@jwt_required()
def get_course_resources(course_id):
    current_user = _get_current_user()
    course = _db_get_or_404(Course, course_id)
    role = current_user.get('role')
    user_id = current_user.get('id')

    if role == 'teacher' and course.teacher_id != user_id:
        return api_response(msg='Permission denied: invalid course', code=403)
    if role == 'student':
        user = _db_get(User, user_id)
        enrolled_ids = [c.id for c in user.enrolled_courses] if user else []
        if course.id not in enrolled_ids:
            return api_response(msg='Permission denied: invalid course', code=403)

    # 课程知识库按课程共享：管理员/教师在同一课程下可共同使用资源。
    query = Resource.query.filter_by(course_id=course.id)

    chapter_id = request.args.get('chapter_id', type=int)
    if chapter_id:
        query = query.filter_by(chapter_id=chapter_id)

    resources = query.order_by(Resource.created_at.desc()).all()
    return api_response(data=[_resource_payload(item) for item in resources])


@teaching_bp.route('/chapters/<int:chapter_id>/resources', methods=['GET'])
@jwt_required()
def get_chapter_resources(chapter_id):
    current_user = _get_current_user()
    chapter = _db_get_or_404(LessonPlan, chapter_id)
    course = _db_get_or_404(Course, chapter.course_id)
    role = current_user.get('role')
    user_id = current_user.get('id')

    if role == 'teacher' and course.teacher_id != user_id:
        return api_response(msg='Permission denied: invalid chapter', code=403)
    if role == 'student':
        user = _db_get(User, user_id)
        enrolled_ids = [c.id for c in user.enrolled_courses] if user else []
        if course.id not in enrolled_ids:
            return api_response(msg='Permission denied: invalid chapter', code=403)

    # 章节资源同样按课程共享，不按上传者隔离。
    query = Resource.query.filter_by(course_id=course.id, chapter_id=chapter.id)

    resources = query.order_by(Resource.created_at.desc()).all()
    return api_response(data=[_resource_payload(item) for item in resources])


@teaching_bp.route('/chapters/<int:chapter_id>/resources', methods=['PUT'])
@jwt_required()
def set_chapter_resources(chapter_id):
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    chapter = _db_get_or_404(LessonPlan, chapter_id)
    course = _db_get_or_404(Course, chapter.course_id)
    if current_user.get('role') == 'teacher' and course.teacher_id != current_user.get('id'):
        return api_response(msg='Permission denied: invalid chapter', code=403)

    data = request.get_json(silent=True) or {}
    raw_ids = data.get('resource_ids') or []
    try:
        resource_ids = [int(item) for item in raw_ids]
    except (TypeError, ValueError):
        return api_response(msg='resource_ids must be an integer array', code=400)

    # Remove current chapter associations first.
    Resource.query.filter_by(chapter_id=chapter.id).update({'chapter_id': None}, synchronize_session=False)

    if resource_ids:
        resources = Resource.query.filter(
            Resource.id.in_(resource_ids),
            Resource.course_id == course.id
        ).all()
        if len(resources) != len(set(resource_ids)):
            db.session.rollback()
            return api_response(msg='Some resources are invalid for this course', code=400)

        for resource in resources:
            resource.chapter_id = chapter.id

    db.session.commit()
    return api_response(msg='Chapter resources updated')


@teaching_bp.route('/resources', methods=['POST'])
@jwt_required()
def create_resource():
    current_user = _get_current_user()
    if current_user.get('role') not in ['admin', 'teacher']:
        return api_response(msg='Permission denied', code=403)

    data, upload_file = _extract_resource_input()

    name = (data.get('name') or '').strip()
    resource_type = (data.get('type') or '').strip() or 'link'
    url = (data.get('url') or '').strip()

    if not name:
        return api_response(msg='Resource name is required', code=400)

    course_id, chapter_id, error_response = _resolve_resource_context(data, current_user)
    if error_response:
        return error_response

    saved_url = url
    if upload_file and upload_file.filename:
        _ensure_upload_folder()
        original_name = secure_filename(upload_file.filename)
        ext = os.path.splitext(original_name)[1]
        saved_name = f"{uuid.uuid4().hex}{ext}"
        save_path = os.path.join(Config.UPLOAD_FOLDER, saved_name)
        upload_file.save(save_path)
        saved_url = f"/static/uploads/resources/{saved_name}"
        if resource_type == 'link':
            resource_type = 'file'

    if not saved_url:
        return api_response(msg='File or URL is required', code=400)

    resource = Resource(
        name=name,
        type=resource_type,
        url=saved_url,
        uploader_id=current_user.get('id'),
        course_id=course_id,
        knowledge_scope='course',
        chapter_id=None
    )
    db.session.add(resource)
    db.session.commit()

    log_action(current_user.get('id'), current_user.get('username'), f"上传教学资源: {resource.name}")
    return api_response(msg='Resource created', data=_resource_payload(resource), code=201)


@teaching_bp.route('/resources/<int:id>/content', methods=['GET'])
def get_resource_content(id):
    resource = _db_get_or_404(Resource, id)

    if resource.type != 'file':
        return api_response(msg='Only file resources support content access', code=400)

    file_meta = _infer_resource_file_meta(resource)
    file_path = file_meta.get('file_path')
    if not file_path:
        return api_response(msg='Resource file not found', code=404)

    download = request.args.get('download', default=0, type=int) == 1
    download_name = file_meta.get('download_name') or 'resource'
    response = send_file(
        file_path,
        mimetype=file_meta.get('mime_type') or 'application/octet-stream',
        as_attachment=download,
        download_name=download_name,
        conditional=True,
        etag=True,
        max_age=0,
    )
    disposition = 'attachment' if download else 'inline'
    response.headers['Content-Disposition'] = f"{disposition}; filename*=UTF-8''{quote(download_name)}"
    return response


@teaching_bp.route('/resources/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_resource(id):
    current_user = _get_current_user()
    resource = _db_get_or_404(Resource, id)

    if current_user.get('role') == 'teacher':
        is_owner = resource.uploader_id == current_user.get('id')
        if not is_owner:
            return api_response(msg='Permission denied', code=403)
    elif current_user.get('role') != 'admin':
        return api_response(msg='Permission denied', code=403)

    resource_name = resource.name
    _delete_resource_file_if_needed(resource)
    db.session.delete(resource)
    db.session.commit()

    log_action(current_user.get('id'), current_user.get('username'), f"删除教学资源: {resource_name}")
    return api_response(msg='Resource deleted')
