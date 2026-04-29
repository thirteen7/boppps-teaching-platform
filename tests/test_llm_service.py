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
