import argparse
import random

from app import create_app
from extensions import db
from models import Assessment, Course, LessonPlan, Submission, User


def split_groups(students):
    students = students[:]
    random.shuffle(students)
    total = len(students)
    high_n = int(round(total * 0.2))
    low_n = int(round(total * 0.2))
    medium_n = max(total - high_n - low_n, 0)
    high = students[:high_n]
    medium = students[high_n:high_n + medium_n]
    low = students[high_n + medium_n:]
    return high, medium, low


def gen_answers_for_questions(questions, correct_prob):
    answers = {}
    correct = 0
    for q in questions:
        opts = q.options if isinstance(q.options, list) and q.options else []
        if not opts:
            picked = q.answer
        else:
            if random.random() < correct_prob and q.answer in opts:
                picked = q.answer
            else:
                wrong = [o for o in opts if o != q.answer]
                picked = random.choice(wrong) if wrong else q.answer
        answers[str(q.id)] = picked
        if picked == q.answer:
            correct += 1
    score = (correct / len(questions)) * 100 if questions else 0
    return answers, score


def main():
    parser = argparse.ArgumentParser(description="Generate stratified submission data for pre/post assessments.")
    parser.add_argument("--course-keyword", default="数据结构")
    parser.add_argument("--class-name", default="人工智能1班")
    parser.add_argument("--major", default="人工智能")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    random.seed(args.seed)

    app = create_app()
    with app.app_context():
        course = Course.query.filter(Course.name.like(f"%{args.course_keyword}%")).first()
        if not course:
            print(f"ERROR: course not found by keyword={args.course_keyword}")
            return

        students = User.query.filter_by(role="student", class_name=args.class_name, major=args.major).all()
        if not students:
            print(f"ERROR: no students found in {args.major}/{args.class_name}")
            return

        for stu in students:
            if course not in stu.enrolled_courses:
                stu.enrolled_courses.append(course)

        chapter_ids = [lp.id for lp in LessonPlan.query.filter_by(course_id=course.id).all()]
        assessments = []
        if chapter_ids:
            assessments = Assessment.query.filter(
                Assessment.lesson_plan_id.in_(chapter_ids),
                Assessment.type.in_(["pre_assessment", "post_assessment"]),
            ).all()
        if not assessments:
            print("ERROR: no pre/post assessments found")
            return

        high, medium, low = split_groups(students)
        group_prob = {}
        for s in high:
            group_prob[s.id] = 0.85
        for s in medium:
            group_prob[s.id] = 0.55
        for s in low:
            group_prob[s.id] = 0.25

        total_deleted = 0
        total_created = 0
        for ass in assessments:
            questions = ass.questions or []
            if not questions:
                continue

            old_active = Submission.query.filter(
                Submission.assessment_id == ass.id,
                Submission.student_id.in_([s.id for s in students]),
                Submission.status == "active",
            ).all()
            for sub in old_active:
                db.session.delete(sub)
                total_deleted += 1
            db.session.flush()

            for stu in students:
                answers, score = gen_answers_for_questions(questions, group_prob.get(stu.id, 0.55))
                db.session.add(Submission(
                    assessment_id=ass.id,
                    student_id=stu.id,
                    answers=answers,
                    score=score,
                    status="active",
                ))
                total_created += 1

        db.session.commit()

        print(f"Course: {course.name}(id={course.id})")
        print(f"Students: {len(students)} | high={len(high)} medium={len(medium)} low={len(low)}")
        print(f"Rebuilt submissions: deleted={total_deleted}, created={total_created}")
        for ass in sorted(assessments, key=lambda x: x.id):
            subs = Submission.query.filter_by(assessment_id=ass.id, status="active").all()
            avg = sum(float(s.score or 0) for s in subs) / len(subs) if subs else 0
            print(f"assessment_id={ass.id} | {ass.type} | {ass.title} | count={len(subs)} | avg={round(avg, 2)}")


if __name__ == "__main__":
    main()
