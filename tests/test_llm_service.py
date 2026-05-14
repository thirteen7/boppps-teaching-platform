from services.llm_service import LLMService


def test_generate_choice_questions_dedup_and_quality(monkeypatch):
    monkeypatch.setattr(
        LLMService,
        "get_active_provider",
        classmethod(lambda cls: {"provider_type": "ollama", "base_url": "http://127.0.0.1:11434", "model": "qwen3:30b", "api_key": "", "extra_json": {}}),
    )

    monkeypatch.setattr(
        LLMService,
        "_call_provider_text",
        classmethod(
            lambda cls, _provider, _system, _prompt, timeout=180: {
                "text": """{
                    "questions": [
                        {"stem":"2+2=?","options":["1","2","3","4"],"answer":"4","difficulty":2,"tags":["计算"]},
                        {"stem":" 2 + 2 = ? ","options":["1","2","3","4"],"answer":"4","difficulty":2,"tags":["计算"]},
                        {"stem":"下列哪个是可测目标？","options":["理解知识","正确率>=80%完成任务"],"answer":"正确率>=80%完成任务","difficulty":3,"tags":["目标"]}
                    ]
                }"""
            }
        ),
    )

    result = LLMService.generate_choice_questions(
        {
            "course_name": "测试课程",
            "topic": "测试主题",
            "count": 3,
            "difficulty": 3,
            "tags": ["测试"],
            "rag_snippets": "",
        }
    )

    assert "error" not in result
    questions = result["questions"]
    assert len(questions) == 2
    assert all("stem" in q and "options" in q and "answer" in q for q in questions)


def test_generate_summary_accepts_common_error_alias(monkeypatch):
    monkeypatch.setattr(
        LLMService,
        "get_active_provider",
        classmethod(lambda cls: {"provider_type": "ollama", "base_url": "http://127.0.0.1:11434", "model": "qwen3:30b", "api_key": "", "extra_json": {}}),
    )

    payload = """{
        "stage": "summary",
        "need_more_info": false,
        "missing_info": [],
        "outputs": {
            "key_takeaways": ["a"],
            "common_errors_and_fixes": [
                {"common_error": "混淆概念", "fix": "做对比练习"}
            ],
            "minute_paper_questions": ["q1"],
            "assessment_result_reflection": {"current_status": "ok", "problem": "p", "improvement": "i"},
            "next_steps": ["n1"]
        }
    }"""

    monkeypatch.setattr(
        LLMService,
        "_call_provider_text",
        classmethod(lambda cls, _provider, _system, _prompt, timeout=180: {"text": payload}),
    )

    result = LLMService.generate("summary", {"topic": "线性表"})

    assert "error" not in result
    summary_errors = result["outputs"]["common_errors_and_fixes"]
    assert summary_errors[0]["error"] == "混淆概念"


def test_generate_distinguishes_invalid_structure_from_invalid_json(monkeypatch):
    monkeypatch.setattr(
        LLMService,
        "get_active_provider",
        classmethod(lambda cls: {"provider_type": "ollama", "base_url": "http://127.0.0.1:11434", "model": "qwen3:30b", "api_key": "", "extra_json": {}}),
    )

    responses = iter([
        {"text": """{"stage":"summary","need_more_info":false,"missing_info":[],"outputs":{"key_takeaways":["a"]}}"""},
        {"text": """{"stage":"summary","need_more_info":false,"missing_info":[],"outputs":{"key_takeaways":["a"]}}"""},
    ])

    monkeypatch.setattr(
        LLMService,
        "_call_provider_text",
        classmethod(lambda cls, _provider, _system, _prompt, timeout=180: next(responses)),
    )

    result = LLMService.generate("summary", {"topic": "线性表"})

    assert result["error"] == "Invalid structured output from LLM"
    assert "Missing outputs.common_errors_and_fixes" in result["validation_errors"]


def test_generate_post_assessment_accepts_choices_and_letter_answer(monkeypatch):
    monkeypatch.setattr(
        LLMService,
        "get_active_provider",
        classmethod(lambda cls: {"provider_type": "ollama", "base_url": "http://127.0.0.1:11434", "model": "qwen3:30b", "api_key": "", "extra_json": {}}),
    )

    payload = """{
        "stage": "post_assessment",
        "need_more_info": false,
        "missing_info": [],
        "outputs": {
            "questions": [
                {
                    "question": "队列的典型特性是？",
                    "choices": ["先进先出（FIFO）", "后进先出（LIFO）"],
                    "answer": "A"
                }
            ],
            "rubric": {"correctness": "对", "completeness": "全", "transferability": "可迁移"},
            "timing_minutes": 10
        }
    }"""

    monkeypatch.setattr(
        LLMService,
        "_call_provider_text",
        classmethod(lambda cls, _provider, _system, _prompt, timeout=180: {"text": payload}),
    )

    result = LLMService.generate("post_assessment", {"topic": "队列"})

    assert "error" not in result
    question = result["outputs"]["questions"][0]
    assert question["options"] == ["先进先出（FIFO）", "后进先出（LIFO）"]
    assert question["answer"] == "先进先出（FIFO）"


def test_generate_participatory_accepts_tasks_alias(monkeypatch):
    monkeypatch.setattr(
        LLMService,
        "get_active_provider",
        classmethod(lambda cls: {"provider_type": "ollama", "base_url": "http://127.0.0.1:11434", "model": "qwen3:30b", "api_key": "", "extra_json": {}}),
    )

    payload = """{
        "stage": "participatory",
        "need_more_info": false,
        "missing_info": [],
        "outputs": {
            "tasks": ["小组讨论队列应用场景"],
            "teacher_actions": "发布任务并巡视",
            "student_actions": "讨论并汇报",
            "products": "讨论结论卡片"
        }
    }"""

    monkeypatch.setattr(
        LLMService,
        "_call_provider_text",
        classmethod(lambda cls, _provider, _system, _prompt, timeout=180: {"text": payload}),
    )

    result = LLMService.generate("participatory", {"topic": "队列"})

    assert "error" not in result
    assert result["outputs"]["activities"] == ["小组讨论队列应用场景"]
    assert result["outputs"]["teacher_actions"] == ["发布任务并巡视"]
    assert result["outputs"]["artifacts"] == ["讨论结论卡片"]


def test_generate_accepts_need_more_info_payload(monkeypatch):
    monkeypatch.setattr(
        LLMService,
        "get_active_provider",
        classmethod(lambda cls: {"provider_type": "ollama", "base_url": "http://127.0.0.1:11434", "model": "qwen3:30b", "api_key": "", "extra_json": {}}),
    )

    payload = """{
        "stage": "post_assessment",
        "need_more_info": true,
        "missing_info": ["需要更多题目上下文"],
        "outputs": {
            "questions": [
                {"statement": "", "choices": [], "answer": ""}
            ],
            "rubric": {},
            "timing_minutes": 0,
            "citations": []
        }
    }"""

    monkeypatch.setattr(
        LLMService,
        "_call_provider_text",
        classmethod(lambda cls, _provider, _system, _prompt, timeout=180: {"text": payload}),
    )

    result = LLMService.generate("post_assessment", {"topic": "队列"})

    assert "error" not in result
    assert result["need_more_info"] is True
    assert result["missing_info"] == ["需要更多题目上下文"]
