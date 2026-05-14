import io

from sqlalchemy.exc import OperationalError

from extensions import db
from models import Assessment, BOPPPSContent, LessonPlan, QuestionBankItem, Resource


def test_course_join_and_student_management_flow(client, auth_headers):
    teacher_headers = auth_headers("teacher")
    student_headers = auth_headers("student")

    course_response = client.post("/api/teaching/courses", json={
        "name": "Machine Learning",
        "code": "ML101",
        "objectives": "Understand supervised learning basics",
    }, headers=teacher_headers)
    assert course_response.status_code == 201
    course_id = course_response.get_json()["data"]["id"]

    join_response = client.post("/api/teaching/courses/join", json={
        "course_id": course_id,
    }, headers=student_headers)
    assert join_response.status_code == 200

    students_response = client.get(f"/api/teaching/courses/{course_id}/students", headers=teacher_headers)
    assert students_response.status_code == 200
    usernames = [item["username"] for item in students_response.get_json()["data"]]
    assert "student" in usernames

    add_response = client.post(f"/api/teaching/courses/{course_id}/students", json={
        "student_id": 4,
    }, headers=teacher_headers)
    assert add_response.status_code == 200

    remove_response = client.delete(f"/api/teaching/courses/{course_id}/students/4", headers=teacher_headers)
    assert remove_response.status_code == 200


def test_lesson_plan_create_and_stage_update(client, auth_headers):
    teacher_headers = auth_headers("teacher")

    course_response = client.post("/api/teaching/courses", json={
        "name": "Data Mining",
        "code": "DM201",
        "objectives": "Build basic data mining intuition",
    }, headers=teacher_headers)
    course_id = course_response.get_json()["data"]["id"]

    plan_response = client.post("/api/teaching/lesson-plans", json={
        "course_id": course_id,
        "title": "Classification Basics",
    }, headers=teacher_headers)
    assert plan_response.status_code == 201
    plan_id = plan_response.get_json()["data"]["id"]

    stages_response = client.get(f"/api/teaching/lesson-plans/{plan_id}/stages", headers=teacher_headers)
    assert stages_response.status_code == 200
    stages = stages_response.get_json()["data"]
    assert "bridge_in" in stages
    assert "summary" in stages

    update_response = client.put(
        f"/api/teaching/lesson-plans/{plan_id}/stages/bridge_in",
        json={"content": "Updated bridge-in content"},
        headers=teacher_headers,
    )
    assert update_response.status_code == 200

    verify_response = client.get(f"/api/teaching/lesson-plans/{plan_id}/stages", headers=teacher_headers)
    assert verify_response.get_json()["data"]["bridge_in"] == "Updated bridge-in content"


def test_resource_creation_with_link_and_file(client, auth_headers):
    teacher_headers = auth_headers("teacher")

    course_response = client.post("/api/teaching/courses", json={
        "name": "Computer Vision",
        "code": "CV301",
        "objectives": "Learn image basics",
    }, headers=teacher_headers)
    course_id = course_response.get_json()["data"]["id"]

    link_response = client.post("/api/teaching/resources", data={
        "name": "Slides Link",
        "type": "link",
        "course_id": str(course_id),
        "url": "https://example.com/slides",
    }, headers=teacher_headers, content_type="multipart/form-data")
    assert link_response.status_code == 201

    file_response = client.post("/api/teaching/resources", data={
        "name": "Lesson Notes",
        "type": "file",
        "course_id": str(course_id),
        "file": (io.BytesIO(b"example notes"), "notes.txt"),
    }, headers=teacher_headers, content_type="multipart/form-data")
    assert file_response.status_code == 201

    resources_response = client.get("/api/teaching/resources", headers=teacher_headers)
    assert resources_response.status_code == 200
    names = [item["name"] for item in resources_response.get_json()["data"]]
    assert "Slides Link" in names
    assert "Lesson Notes" in names

    resource_id = next(item["id"] for item in resources_response.get_json()["data"] if item["name"] == "Slides Link")
    delete_resource_response = client.delete(f"/api/teaching/resources/{resource_id}", headers=teacher_headers)
    assert delete_resource_response.status_code == 200

    delete_course_response = client.delete(f"/api/teaching/courses/{course_id}", headers=teacher_headers)
    assert delete_course_response.status_code == 200


def test_resource_visibility_isolated_per_teacher(client, auth_headers):
    admin_headers = auth_headers("admin")
    teacher_headers = auth_headers("teacher")

    create_teacher_2 = client.post("/api/admin/users", json={
        "username": "teacher2",
        "password": "123",
        "role": "teacher",
        "name": "Teacher Two",
    }, headers=admin_headers)
    assert create_teacher_2.status_code == 201

    teacher2_headers = auth_headers("teacher2")

    course_1 = client.post("/api/teaching/courses", json={
        "name": "Teacher One Course",
        "code": "T1-101",
        "objectives": "T1 objectives",
    }, headers=teacher_headers)
    course_1_id = course_1.get_json()["data"]["id"]

    course_2 = client.post("/api/teaching/courses", json={
        "name": "Teacher Two Course",
        "code": "T2-101",
        "objectives": "T2 objectives",
    }, headers=teacher2_headers)
    course_2_id = course_2.get_json()["data"]["id"]

    res_1 = client.post("/api/teaching/resources", data={
        "name": "T1 Resource",
        "type": "link",
        "course_id": str(course_1_id),
        "url": "https://example.com/t1",
    }, headers=teacher_headers, content_type="multipart/form-data")
    assert res_1.status_code == 201

    res_2 = client.post("/api/teaching/resources", data={
        "name": "T2 Resource",
        "type": "link",
        "course_id": str(course_2_id),
        "url": "https://example.com/t2",
    }, headers=teacher2_headers, content_type="multipart/form-data")
    assert res_2.status_code == 201

    teacher_1_list = client.get("/api/teaching/resources", headers=teacher_headers)
    teacher_2_list = client.get("/api/teaching/resources", headers=teacher2_headers)
    assert teacher_1_list.status_code == 200
    assert teacher_2_list.status_code == 200

    teacher_1_names = [item["name"] for item in teacher_1_list.get_json()["data"]]
    teacher_2_names = [item["name"] for item in teacher_2_list.get_json()["data"]]
    assert "T1 Resource" in teacher_1_names
    assert "T2 Resource" not in teacher_1_names
    assert "T2 Resource" in teacher_2_names
    assert "T1 Resource" not in teacher_2_names


def test_course_and_chapter_level_knowledge_resources(client, auth_headers):
    teacher_headers = auth_headers("teacher")

    course_response = client.post("/api/teaching/courses", json={
        "name": "Algorithms",
        "code": "ALG101",
        "objectives": "Understand sorting and searching",
    }, headers=teacher_headers)
    course_id = course_response.get_json()["data"]["id"]

    plan_response = client.post("/api/teaching/lesson-plans", json={
        "course_id": course_id,
        "title": "Quick Sort",
    }, headers=teacher_headers)
    plan_id = plan_response.get_json()["data"]["id"]

    course_kb_response = client.post("/api/teaching/resources", data={
        "name": "Course Handbook",
        "type": "link",
        "course_id": str(course_id),
        "knowledge_scope": "course",
        "url": "https://example.com/course-kb",
    }, headers=teacher_headers, content_type="multipart/form-data")
    assert course_kb_response.status_code == 201
    assert course_kb_response.get_json()["data"]["knowledge_scope"] == "course"

    chapter_temp_response = client.post("/api/teaching/resources", data={
        "name": "Quick Sort Scratch Notes",
        "type": "link",
        "course_id": str(course_id),
        "url": "https://example.com/lesson-temp",
    }, headers=teacher_headers, content_type="multipart/form-data")
    assert chapter_temp_response.status_code == 201
    chapter_temp_payload = chapter_temp_response.get_json()["data"]
    assert chapter_temp_payload["knowledge_scope"] == "course"
    assert chapter_temp_payload["chapter_id"] is None

    bind_response = client.put(
        f"/api/teaching/chapters/{plan_id}/resources",
        json={"resource_ids": [chapter_temp_payload["id"]]},
        headers=teacher_headers,
    )
    assert bind_response.status_code == 200

    course_resources = client.get(f"/api/teaching/courses/{course_id}/resources", headers=teacher_headers)
    assert course_resources.status_code == 200
    resources = {item["name"]: item for item in course_resources.get_json()["data"]}
    assert resources["Course Handbook"]["knowledge_scope"] == "course"
    assert resources["Quick Sort Scratch Notes"]["knowledge_scope"] == "chapter"
    assert resources["Quick Sort Scratch Notes"]["chapter_id"] == plan_id

    chapter_resources = client.get(f"/api/teaching/chapters/{plan_id}/resources", headers=teacher_headers)
    assert chapter_resources.status_code == 200
    chapter_names = [item["name"] for item in chapter_resources.get_json()["data"]]
    assert "Quick Sort Scratch Notes" in chapter_names

def test_stage_update_returns_503_on_operational_error(client, auth_headers, monkeypatch):
    teacher_headers = auth_headers("teacher")

    course_response = client.post("/api/teaching/courses", json={
        "name": "Database Systems",
        "code": "DB101",
        "objectives": "Understand relational databases",
    }, headers=teacher_headers)
    course_id = course_response.get_json()["data"]["id"]

    plan_response = client.post("/api/teaching/lesson-plans", json={
        "course_id": course_id,
        "title": "Transactions",
    }, headers=teacher_headers)
    plan_id = plan_response.get_json()["data"]["id"]

    def broken_commit():
        raise OperationalError("UPDATE boppps_contents", {}, Exception("lost connection"))

    monkeypatch.setattr("routes.teaching.db.session.commit", broken_commit)

    response = client.put(
        f"/api/teaching/lesson-plans/{plan_id}/stages/bridge_in",
        json={"content": "new content"},
        headers=teacher_headers,
    )

    assert response.status_code == 503
    payload = response.get_json()
    assert payload["msg"] == "Database connection lost, please retry"


def test_assessment_submission_and_analytics(client, auth_headers):
    teacher_headers = auth_headers("teacher")
    student_headers = auth_headers("student")

    course_response = client.post("/api/teaching/courses", json={
        "name": "NLP",
        "code": "NLP401",
        "objectives": "Understand text processing",
    }, headers=teacher_headers)
    course_id = course_response.get_json()["data"]["id"]

    plan_response = client.post("/api/teaching/lesson-plans", json={
        "course_id": course_id,
        "title": "Tokenization",
    }, headers=teacher_headers)
    plan_id = plan_response.get_json()["data"]["id"]

    join_response = client.post("/api/teaching/courses/join", json={
        "course_id": course_id,
    }, headers=student_headers)
    assert join_response.status_code == 200

    assessment_response = client.post("/api/teaching/assessments", json={
        "chapter_id": plan_id,
        "type": "post_assessment",
        "title": "Quick Quiz",
        "reveal_after_submit": True,
        "questions": [
            {
                "content": "What is tokenization?",
                "q_type": "choice",
                "options": ["Split text", "Train model"],
                "answer": "Split text",
            }
        ],
    }, headers=teacher_headers)
    assert assessment_response.status_code == 201
    assessment_id = assessment_response.get_json()["data"]["id"]

    push_response = client.patch(f"/api/teaching/assessments/{assessment_id}/push", headers=teacher_headers)
    assert push_response.status_code == 200

    assessment_detail = client.get(f"/api/teaching/assessments/{assessment_id}", headers=student_headers)
    question_id = assessment_detail.get_json()["data"]["questions"][0]["id"]

    submit_response = client.post(
        f"/api/teaching/assessments/{assessment_id}/submit",
        json={"answers": {str(question_id): "Split text"}},
        headers=student_headers,
    )
    assert submit_response.status_code == 200
    assert submit_response.get_json()["data"]["score"] == 100.0
    submission_id = submit_response.get_json()["data"]["submission_id"]

    second_submit = client.post(
        f"/api/teaching/assessments/{assessment_id}/submit",
        json={"answers": {str(question_id): "Split text"}},
        headers=student_headers,
    )
    assert second_submit.status_code == 400

    my_result = client.get(f"/api/teaching/assessments/{assessment_id}/my-result", headers=student_headers)
    assert my_result.status_code == 200
    result_data = my_result.get_json()["data"]
    assert result_data["score"] == 100.0
    assert len(result_data["question_results"]) == 1
    assert result_data["question_results"][0]["is_correct"] is True

    reject_response = client.patch(
        f"/api/teaching/submissions/{submission_id}/status",
        json={"status": "rejected", "reason": "请重新答题"},
        headers=teacher_headers,
    )
    assert reject_response.status_code == 200

    list_response = client.get(
        f"/api/teaching/assessments/{assessment_id}/submissions",
        headers=teacher_headers,
    )
    assert list_response.status_code == 200
    assert list_response.get_json()["data"][0]["status"] == "rejected"

    analytics_response = client.get(f"/api/teaching/lesson-plans/{plan_id}/analytics/basic", headers=teacher_headers)
    assert analytics_response.status_code == 200
    analytics = analytics_response.get_json()["data"]
    assert analytics == []

    resubmit_response = client.post(
        f"/api/teaching/assessments/{assessment_id}/submit",
        json={"answers": {str(question_id): "Split text"}},
        headers=student_headers,
    )
    assert resubmit_response.status_code == 200

    analytics_after_retry = client.get(f"/api/teaching/lesson-plans/{plan_id}/analytics/basic", headers=teacher_headers)
    assert analytics_after_retry.status_code == 200
    analytics_data = analytics_after_retry.get_json()["data"]
    assert analytics_data[0]["submission_count"] == 1
    assert analytics_data[0]["avg_score"] == 100.0


def test_assessment_result_visibility_toggle(client, auth_headers):
    teacher_headers = auth_headers("teacher")
    student_headers = auth_headers("student")

    course_response = client.post("/api/teaching/courses", json={
        "name": "Linear Algebra",
        "code": "MATH201",
        "objectives": "Understand vectors",
    }, headers=teacher_headers)
    course_id = course_response.get_json()["data"]["id"]

    join_response = client.post("/api/teaching/courses/join", json={
        "course_id": course_id,
    }, headers=student_headers)
    assert join_response.status_code == 200

    plan_response = client.post("/api/teaching/lesson-plans", json={
        "course_id": course_id,
        "title": "Vector Spaces",
    }, headers=teacher_headers)
    plan_id = plan_response.get_json()["data"]["id"]

    assessment_response = client.post("/api/teaching/assessments", json={
        "chapter_id": plan_id,
        "type": "pre_assessment",
        "title": "Hidden Answer Quiz",
        "reveal_after_submit": False,
        "questions": [
            {
                "content": "What is a vector?",
                "q_type": "choice",
                "options": ["Magnitude and direction", "Only scalar"],
                "answer": "Magnitude and direction",
            }
        ],
    }, headers=teacher_headers)
    assert assessment_response.status_code == 201
    assessment_id = assessment_response.get_json()["data"]["id"]

    push_response = client.patch(f"/api/teaching/assessments/{assessment_id}/push", headers=teacher_headers)
    assert push_response.status_code == 200

    detail_response = client.get(f"/api/teaching/assessments/{assessment_id}", headers=student_headers)
    question_id = detail_response.get_json()["data"]["questions"][0]["id"]

    submit_response = client.post(
        f"/api/teaching/assessments/{assessment_id}/submit",
        json={"answers": {str(question_id): "Magnitude and direction"}},
        headers=student_headers,
    )
    assert submit_response.status_code == 200

    result_response = client.get(f"/api/teaching/assessments/{assessment_id}/my-result", headers=student_headers)
    assert result_response.status_code == 200
    payload = result_response.get_json()["data"]
    assert payload["reveal_after_submit"] is False
    assert payload["question_results"] == []


def test_question_bank_generate_and_import_to_assessment(client, auth_headers, monkeypatch):
    teacher_headers = auth_headers("teacher")

    course_response = client.post("/api/teaching/courses", json={
        "name": "AI Course",
        "code": "AI501",
        "objectives": "Learn prompting",
    }, headers=teacher_headers)
    course_id = course_response.get_json()["data"]["id"]

    plan_response = client.post("/api/teaching/lesson-plans", json={
        "course_id": course_id,
        "title": "Prompting Basics",
    }, headers=teacher_headers)
    plan_id = plan_response.get_json()["data"]["id"]

    monkeypatch.setattr(
        "routes.teaching.LLMService.generate_choice_questions",
        lambda _ctx: {
            "questions": [
                {
                    "stem": "Which prompt is clearer?",
                    "options": ["Do task", "Summarize in 3 bullets"],
                    "answer": "Summarize in 3 bullets",
                    "difficulty": 3,
                    "tags": ["prompt"],
                }
            ]
        },
    )

    generate_response = client.post("/api/teaching/question-bank/generate", json={
        "course_id": course_id,
        "chapter_id": plan_id,
        "count": 1,
        "difficulty": 3,
        "tags": ["prompt"],
        "save_to_bank": True,
    }, headers=teacher_headers)
    assert generate_response.status_code == 200
    saved = generate_response.get_json()["data"]["saved_items"]
    assert len(saved) == 1
    bank_id = saved[0]["id"]

    assessment_response = client.post("/api/teaching/assessments", json={
        "chapter_id": plan_id,
        "type": "post_assessment",
        "title": "Import Quiz",
        "question_bank_ids": [bank_id],
    }, headers=teacher_headers)
    assert assessment_response.status_code == 201
    assessment_id = assessment_response.get_json()["data"]["id"]

    detail_response = client.get(f"/api/teaching/assessments/{assessment_id}", headers=teacher_headers)
    assert detail_response.status_code == 200
    assert len(detail_response.get_json()["data"]["questions"]) == 1


def test_assessment_edit_then_push_flow(client, auth_headers):
    teacher_headers = auth_headers("teacher")
    student_headers = auth_headers("student")

    course_response = client.post("/api/teaching/courses", json={
        "name": "Push Course",
        "code": "PUSH101",
        "objectives": "Push quiz",
    }, headers=teacher_headers)
    course_id = course_response.get_json()["data"]["id"]

    join_response = client.post("/api/teaching/courses/join", json={"course_id": course_id}, headers=student_headers)
    assert join_response.status_code == 200

    plan_response = client.post("/api/teaching/lesson-plans", json={
        "course_id": course_id,
        "title": "Push Chapter",
    }, headers=teacher_headers)
    plan_id = plan_response.get_json()["data"]["id"]

    create_response = client.post("/api/teaching/assessments", json={
        "chapter_id": plan_id,
        "title": "Draft Quiz",
        "type": "pre_assessment",
        "questions": [{
            "content": "1+1=?",
            "q_type": "choice",
            "options": ["1", "2"],
            "answer": "2",
        }],
    }, headers=teacher_headers)
    assert create_response.status_code == 201
    assessment_id = create_response.get_json()["data"]["id"]

    student_get_before_push = client.get(f"/api/teaching/assessments/{assessment_id}", headers=student_headers)
    assert student_get_before_push.status_code == 403

    update_response = client.put(f"/api/teaching/assessments/{assessment_id}", json={
        "title": "Draft Quiz Updated",
        "type": "pre_assessment",
        "questions": [{
            "content": "2+2=?",
            "q_type": "choice",
            "options": ["3", "4"],
            "answer": "4",
        }],
    }, headers=teacher_headers)
    assert update_response.status_code == 200

    push_response = client.patch(f"/api/teaching/assessments/{assessment_id}/push", headers=teacher_headers)
    assert push_response.status_code == 200

    student_get_after_push = client.get(f"/api/teaching/assessments/{assessment_id}", headers=student_headers)
    assert student_get_after_push.status_code == 200
    assert student_get_after_push.get_json()["data"]["title"] == "Draft Quiz Updated"


def test_delete_assessment_keeps_question_bank_items(client, auth_headers):
    teacher_headers = auth_headers("teacher")

    course_response = client.post("/api/teaching/courses", json={
        "name": "Delete Quiz Course",
        "objectives": "Keep bank items",
    }, headers=teacher_headers)
    course_id = course_response.get_json()["data"]["id"]

    plan_response = client.post("/api/teaching/chapters", json={
        "course_id": course_id,
        "title": "Delete Quiz Chapter",
    }, headers=teacher_headers)
    plan_id = plan_response.get_json()["data"]["id"]

    qb_create = client.post("/api/teaching/question-bank", json={
        "course_id": course_id,
        "chapter_id": plan_id,
        "stem": "哪一个是队列特征？",
        "options": ["先进先出", "后进先出"],
        "answer": "先进先出",
        "difficulty": 2,
        "tags": ["队列"],
    }, headers=teacher_headers)
    assert qb_create.status_code == 201
    qb_id = qb_create.get_json()["data"]["id"]

    assessment_response = client.post("/api/teaching/assessments", json={
        "chapter_id": plan_id,
        "title": "Delete Me Quiz",
        "type": "post_assessment",
        "question_bank_ids": [qb_id],
    }, headers=teacher_headers)
    assert assessment_response.status_code == 201
    assessment_id = assessment_response.get_json()["data"]["id"]

    delete_response = client.delete(f"/api/teaching/assessments/{assessment_id}", headers=teacher_headers)
    assert delete_response.status_code == 200

    with client.application.app_context():
        assert db.session.get(Assessment, assessment_id) is None
        qb_item = db.session.get(QuestionBankItem, qb_id)
        assert qb_item is not None
        assert qb_item.stem == "哪一个是队列特征？"


def test_delete_chapter_removes_resources_and_assessments_but_preserves_bank_items(client, auth_headers):
    teacher_headers = auth_headers("teacher")

    course_response = client.post("/api/teaching/courses", json={
        "name": "Delete Chapter Course",
        "objectives": "Cascade delete chapter assets",
    }, headers=teacher_headers)
    course_id = course_response.get_json()["data"]["id"]

    plan_response = client.post("/api/teaching/chapters", json={
        "course_id": course_id,
        "title": "Delete Chapter",
    }, headers=teacher_headers)
    plan_id = plan_response.get_json()["data"]["id"]

    resource_response = client.post("/api/teaching/resources", data={
        "name": "Temporary Notes",
        "type": "file",
        "course_id": str(course_id),
        "file": (io.BytesIO(b"temporary chapter notes"), "chapter-notes.txt"),
    }, headers=teacher_headers, content_type="multipart/form-data")
    assert resource_response.status_code == 201
    resource_id = resource_response.get_json()["data"]["id"]

    bind_response = client.put(
        f"/api/teaching/chapters/{plan_id}/resources",
        json={"resource_ids": [resource_id]},
        headers=teacher_headers,
    )
    assert bind_response.status_code == 200

    qb_create = client.post("/api/teaching/question-bank", json={
        "course_id": course_id,
        "chapter_id": plan_id,
        "stem": "章节题库题",
        "options": ["A", "B"],
        "answer": "A",
        "difficulty": 3,
    }, headers=teacher_headers)
    assert qb_create.status_code == 201
    qb_id = qb_create.get_json()["data"]["id"]

    assessment_response = client.post("/api/teaching/assessments", json={
        "chapter_id": plan_id,
        "title": "Chapter Quiz",
        "type": "pre_assessment",
        "questions": [{
            "content": "章节测验题",
            "q_type": "choice",
            "options": ["A", "B"],
            "answer": "A",
        }],
    }, headers=teacher_headers)
    assert assessment_response.status_code == 201
    assessment_id = assessment_response.get_json()["data"]["id"]

    delete_response = client.delete(f"/api/teaching/chapters/{plan_id}", headers=teacher_headers)
    assert delete_response.status_code == 200
    payload = delete_response.get_json()["data"]
    assert payload["resources"] == 1
    assert payload["assessments"] == 1

    with client.application.app_context():
        assert db.session.get(LessonPlan, plan_id) is None
        assert db.session.get(Assessment, assessment_id) is None
        assert db.session.get(Resource, resource_id) is None
        assert BOPPPSContent.query.filter_by(lesson_plan_id=plan_id).count() == 0
        qb_item = db.session.get(QuestionBankItem, qb_id)
        assert qb_item is not None
        assert qb_item.chapter_id is None


def test_generate_custom_uses_stage_assessment_basis(client, auth_headers, monkeypatch):
    teacher_headers = auth_headers("teacher")

    course_response = client.post("/api/teaching/courses", json={
        "name": "Basis Course",
        "code": "BASIS101",
        "objectives": "Use assessment basis",
    }, headers=teacher_headers)
    course_id = course_response.get_json()["data"]["id"]

    plan_response = client.post("/api/teaching/lesson-plans", json={
        "course_id": course_id,
        "title": "Basis Chapter",
    }, headers=teacher_headers)
    plan_id = plan_response.get_json()["data"]["id"]

    create_response = client.post("/api/teaching/assessments", json={
        "chapter_id": plan_id,
        "title": "前测A",
        "type": "pre_assessment",
        "questions": [{
            "content": "什么是函数？",
            "q_type": "choice",
            "options": ["映射关系", "随机关系"],
            "answer": "映射关系",
        }],
    }, headers=teacher_headers)
    assert create_response.status_code == 201

    captured = {"context": None}

    def fake_generate(stage, context):
        captured["context"] = context
        return {
            "stage": stage,
            "need_more_info": False,
            "missing_info": [],
            "outputs": {
                "questions": [],
                "timing_minutes": 8,
                "evaluation_focus": "基础诊断",
                "citations": [],
            },
            "_meta": {"valid": True, "retry_used": False, "provider": {}},
        }

    monkeypatch.setattr("routes.teaching.LLMService.generate", fake_generate)
    gen_response = client.post(
        f"/api/teaching/chapters/{plan_id}/generate-custom",
        json={"stage": "pre_assessment"},
        headers=teacher_headers,
    )
    assert gen_response.status_code == 200
    assert captured["context"] is not None
    assert "前测A" in (captured["context"].get("pre_assessment_quiz_basis") or "")
    assert "什么是函数" in (captured["context"].get("pre_assessment_quiz_basis") or "")


def test_student_cannot_view_lesson_plan_content(client, auth_headers):
    teacher_headers = auth_headers("teacher")
    student_headers = auth_headers("student")

    course_response = client.post("/api/teaching/courses", json={
        "name": "No Lesson View Course",
        "code": "NLV101",
        "objectives": "Keep lesson plans teacher-only",
    }, headers=teacher_headers)
    course_id = course_response.get_json()["data"]["id"]

    join_response = client.post("/api/teaching/courses/join", json={"course_id": course_id}, headers=student_headers)
    assert join_response.status_code == 200

    plan_response = client.post("/api/teaching/lesson-plans", json={
        "course_id": course_id,
        "title": "Teacher Chapter",
    }, headers=teacher_headers)
    plan_id = plan_response.get_json()["data"]["id"]

    list_response = client.get(f"/api/teaching/courses/{course_id}/chapters", headers=student_headers)
    assert list_response.status_code == 403

    detail_response = client.get(f"/api/teaching/chapters/{plan_id}", headers=student_headers)
    assert detail_response.status_code == 403

    stages_response = client.get(f"/api/teaching/chapters/{plan_id}/stages", headers=student_headers)
    assert stages_response.status_code == 403


def test_question_bank_update_delete_and_assessment_detail_analytics(client, auth_headers):
    teacher_headers = auth_headers("teacher")
    student_headers = auth_headers("student")

    course_response = client.post("/api/teaching/courses", json={
        "name": "Analytics Course",
        "code": "ANA101",
        "objectives": "Measure learning",
    }, headers=teacher_headers)
    course_id = course_response.get_json()["data"]["id"]

    join_response = client.post("/api/teaching/courses/join", json={"course_id": course_id}, headers=student_headers)
    assert join_response.status_code == 200

    plan_response = client.post("/api/teaching/lesson-plans", json={
        "course_id": course_id,
        "title": "Analytics Chapter",
    }, headers=teacher_headers)
    plan_id = plan_response.get_json()["data"]["id"]

    qb_create = client.post("/api/teaching/question-bank", json={
        "course_id": course_id,
        "chapter_id": plan_id,
        "stem": "CPU 全称是什么？",
        "options": ["中央处理器", "图形处理器"],
        "answer": "中央处理器",
        "difficulty": 2,
        "tags": ["概念"],
    }, headers=teacher_headers)
    assert qb_create.status_code == 201
    qb_id = qb_create.get_json()["data"]["id"]

    qb_update = client.put(f"/api/teaching/question-bank/{qb_id}", json={
        "stem": "CPU 的英文全称是什么？",
        "options": ["Central Processing Unit", "Computer Personal Unit"],
        "answer": "Central Processing Unit",
        "difficulty": 3,
        "tags": ["概念", "基础"],
    }, headers=teacher_headers)
    assert qb_update.status_code == 200
    assert qb_update.get_json()["data"]["difficulty"] == 3

    assessment_response = client.post("/api/teaching/assessments", json={
        "chapter_id": plan_id,
        "title": "Detail Analytics Quiz",
        "type": "post_assessment",
        "question_bank_ids": [qb_id],
    }, headers=teacher_headers)
    assert assessment_response.status_code == 201
    assessment_id = assessment_response.get_json()["data"]["id"]

    push_response = client.patch(f"/api/teaching/assessments/{assessment_id}/push", headers=teacher_headers)
    assert push_response.status_code == 200

    student_course_assessments = client.get(f"/api/teaching/courses/{course_id}/student-assessments", headers=student_headers)
    assert student_course_assessments.status_code == 200
    assert len(student_course_assessments.get_json()["data"]) == 1

    assessment_detail = client.get(f"/api/teaching/assessments/{assessment_id}", headers=student_headers)
    qid = assessment_detail.get_json()["data"]["questions"][0]["id"]
    submit_response = client.post(
        f"/api/teaching/assessments/{assessment_id}/submit",
        json={"answers": {str(qid): "Central Processing Unit"}},
        headers=student_headers,
    )
    assert submit_response.status_code == 200

    detail_analytics = client.get(f"/api/teaching/assessments/{assessment_id}/analytics/detail", headers=teacher_headers)
    assert detail_analytics.status_code == 200
    payload = detail_analytics.get_json()["data"]
    assert payload["assessment"]["submission_count"] == 1
    assert len(payload["question_stats"]) == 1
    assert len(payload["student_stats"]) == 1

    ai_analytics = client.get(f"/api/teaching/assessments/{assessment_id}/analytics/ai", headers=teacher_headers)
    assert ai_analytics.status_code == 200
    assert "analysis" in ai_analytics.get_json()["data"]

    qb_delete = client.delete(f"/api/teaching/question-bank/{qb_id}", headers=teacher_headers)
    assert qb_delete.status_code == 200


def test_admin_create_course_assign_teacher_and_teacher_manage_students(client, auth_headers):
    admin_headers = auth_headers("admin")
    teacher_headers = auth_headers("teacher")
    student_headers = auth_headers("student")

    create_by_admin = client.post("/api/teaching/courses", json={
        "name": "Admin Assigned Course",
        "code": "AAC101",
        "objectives": "Assigned by admin",
        "teacher_id": 2,
    }, headers=admin_headers)
    assert create_by_admin.status_code == 201
    course_id = create_by_admin.get_json()["data"]["id"]

    join_resp = client.post("/api/teaching/courses/join", json={"course_id": course_id}, headers=student_headers)
    assert join_resp.status_code == 200

    add_resp = client.post(f"/api/teaching/courses/{course_id}/students", json={"student_id": 4}, headers=teacher_headers)
    assert add_resp.status_code == 200

    search_teachers = client.get("/api/teaching/search-teachers?keyword=teacher", headers=admin_headers)
    assert search_teachers.status_code == 200
    assert len(search_teachers.get_json()["data"]) >= 1

    assign_teacher = client.put(f"/api/teaching/courses/{course_id}/teacher", json={"teacher_id": 2}, headers=admin_headers)
    assert assign_teacher.status_code == 200

    teacher_info = client.get(f"/api/teaching/courses/{course_id}/teacher", headers=admin_headers)
    assert teacher_info.status_code == 200
    assert teacher_info.get_json()["data"]["teacher_id"] == 2
