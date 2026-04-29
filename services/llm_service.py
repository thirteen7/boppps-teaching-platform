import json
import re

import requests

from config import Config
from models import AIProviderConfig


class LLMService:
    DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434"
    DEFAULT_OLLAMA_MODEL = getattr(Config, "OLLAMA_MODEL", "qwen3:30b")

    SYSTEM_PROMPT = """
你是“BOPPPS 教学设计智能助手”。
硬性规则：
1. 只输出严格 JSON，不要 Markdown、解释或代码块。
2. 必须匹配给定结构，字段类型正确。
3. 优先使用给定知识库片段，避免编造来源。
4. 信息不足时仍返回合法 JSON，并说明 missing_info。
5. 设计必须体现 BOPPPS“以学定教、以评促学”，而非传统教案的教师讲授流水账。
6. 每个阶段都要给出可观察的学习证据（学生行为/作品/作答结果）。
"""

    STAGE_OUTPUT_KEYS = {
        "bridge_in": [
            "hook_type",
            "hook_title",
            "hook_script",
            "teacher_actions",
            "student_actions",
            "duration_minutes",
            "transition_to_objectives",
            "materials_needed",
            "citations",
        ],
        "objective": ["objectives", "alignment_checks", "citations"],
        "pre_assessment": ["questions", "timing_minutes", "evaluation_focus", "citations"],
        "participatory": ["activities", "teacher_actions", "student_actions", "artifacts", "citations"],
        "post_assessment": ["questions", "rubric", "timing_minutes", "citations"],
        "summary": [
            "key_takeaways",
            "common_errors_and_fixes",
            "minute_paper_questions",
            "assessment_result_reflection",
            "next_steps",
        ],
    }

    BOPPPS_DIFFERENTIATION_RULES = """
与传统教案的区别（必须遵守）：
- 不是“按教师讲什么”组织，而是“学生学会什么、如何被验证”组织。
- 每个阶段都要写清：教师动作、学生动作、产出证据、时间控制、衔接语。
- 目标、活动、评价必须一一对齐；禁止出现“目标很好看但无法测量”的描述。
- 优先使用真实课堂任务、情境问题、同伴互动，不要空泛说教。
- 语言务实、可执行、可落地，避免口号式表述。
"""

    STAGE_GOAL_REQUIREMENTS = {
        "bridge_in": """
目标：在 3-8 分钟内建立学习动机并激活旧知，为目标发布做认知铺垫。
要求：
- hook_script 要有真实课堂开场话术，包含提问或情境冲突。
- teacher_actions/student_actions 要可直接执行，不写抽象词。
- transition_to_objectives 必须明确“为什么现在学这个”。
""",
        "objective": """
目标：给出可测、可评、可达成的学习目标，形成后续活动与评价的锚点。
要求：
- objectives 为 3-5 条，每条必须包含：
  id（如 O1）、statement（完整目标陈述）、domain（知识/技能/态度）、
  measurable_verb、condition、standard、success_criteria。
- alignment_checks 需体现目标与前测/活动/后测的对应关系。
- 避免“了解、掌握”等不可测动词，优先“辨析/设计/实现/解释/验证”等。
""",
        "pre_assessment": """
目标：快速诊断学生起点，识别先备知识缺口，用于分层教学决策。
要求：
- 题目必须围绕 bridge_in 导入情境与 objective 学习目标设计，不能脱离课堂导入主线。
- questions 应覆盖关键先备点，难度由浅到中。
- 每道题建议包含 mapped_objective_ids（对应目标）与 diagnostic_purpose（诊断用途）。
- evaluation_focus 要明确“根据何种错误信号调整教学节奏/分组”。
- 题目需能在短时间完成并可快速判分。
""",
        "participatory": """
目标：让学生通过任务驱动完成核心知识建构与迁移应用。
要求：
- activities 按“任务目标-步骤-时间-产出-评价点”组织。
- 必须体现师生互动与同伴协作，不能只写教师讲解。
- artifacts 要具体（如表格、代码片段、思维图、口头汇报结论）。
""",
        "post_assessment": """
目标：检验目标达成度并为讲评/补救提供依据。
要求：
- questions 对齐 objective 阶段的目标，不得偏题。
- 每道题建议包含 mapped_objective_ids（检验哪个目标）与 mastery_signal（达到何种表现视为达标）。
- rubric 给出可判定标准（正确性、完整性、迁移性等）。
- timing_minutes 与题量匹配，避免明显超时设计。
""",
        "summary": """
目标：固化关键收获、暴露误区并形成课后行动闭环。
要求：
- key_takeaways 聚焦高价值知识，不是重复标题。
- common_errors_and_fixes 需成对出现（误区-修正策略）。
- assessment_result_reflection 必须结合前测/后测或课堂测评结果，给出“现状-问题-改进”。
- minute_paper_questions 用于诊断理解深度，next_steps 需可执行。
""",
    }

    @classmethod
    def _provider_payload(cls, provider):
        if provider:
            return {
                "id": provider.id,
                "provider_type": provider.provider_type,
                "name": provider.name,
                "base_url": provider.base_url,
                "api_key": provider.api_key,
                "model": provider.model,
                "extra_json": provider.extra_json or {},
            }
        return {
            "id": None,
            "provider_type": "ollama",
            "name": "Built-in Ollama",
            "base_url": cls.DEFAULT_OLLAMA_BASE_URL,
            "api_key": "",
            "model": cls.DEFAULT_OLLAMA_MODEL,
            "extra_json": {},
        }

    @classmethod
    def get_active_provider(cls):
        provider = AIProviderConfig.query.filter_by(enabled=True, is_default=True).first()
        if not provider:
            provider = AIProviderConfig.query.filter_by(enabled=True).order_by(AIProviderConfig.id.asc()).first()
        return cls._provider_payload(provider)

    @staticmethod
    def _build_openai_headers(api_key):
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        return headers

    @classmethod
    def list_models(cls, provider):
        provider_type = provider.get("provider_type")
        base_url = (provider.get("base_url") or "").rstrip("/")
        if provider_type == "ollama":
            resp = requests.get(f"{base_url}/api/tags", timeout=30)
            resp.raise_for_status()
            payload = resp.json()
            models = [m.get("name") for m in payload.get("models", []) if m.get("name")]
            return models
        if provider_type == "openai_compatible":
            resp = requests.get(
                f"{base_url}/models",
                headers=cls._build_openai_headers(provider.get("api_key")),
                timeout=30,
            )
            resp.raise_for_status()
            payload = resp.json()
            models = [m.get("id") for m in payload.get("data", []) if m.get("id")]
            return models
        raise ValueError(f"Unsupported provider type: {provider_type}")

    @classmethod
    def test_provider_connection(cls, provider):
        models = cls.list_models(provider)
        probe = cls._call_provider_text(
            provider,
            system="你是一个连通性测试助手，只返回 JSON。",
            prompt='返回 JSON: {"ok": true, "message": "pong"}',
            timeout=45,
        )
        if probe.get("error"):
            return {"ok": False, "error": probe.get("error"), "models": models}
        parsed = cls._try_parse_json(probe.get("text", ""))
        if isinstance(parsed, dict):
            return {"ok": True, "models": models, "probe": parsed}
        return {"ok": True, "models": models, "probe_raw": probe.get("text")}

    @classmethod
    def _call_provider_text(cls, provider, system, prompt, timeout=180):
        provider_type = provider.get("provider_type")
        base_url = (provider.get("base_url") or "").rstrip("/")
        model = provider.get("model")
        extra = provider.get("extra_json") or {}
        try:
            if provider_type == "ollama":
                payload = {
                    "model": model,
                    "system": system,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": extra.get("temperature", 0.2),
                    },
                }
                resp = requests.post(f"{base_url}/api/generate", json=payload, timeout=timeout)
                resp.raise_for_status()
                data = resp.json()
                return {"text": data.get("response", ""), "raw": data}

            if provider_type == "openai_compatible":
                payload = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": extra.get("temperature", 0.2),
                    "max_tokens": extra.get("max_tokens", 1800),
                    "response_format": {"type": "json_object"},
                }
                resp = requests.post(
                    f"{base_url}/chat/completions",
                    json=payload,
                    headers=cls._build_openai_headers(provider.get("api_key")),
                    timeout=timeout,
                )
                resp.raise_for_status()
                data = resp.json()
                text = (
                    data.get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                )
                return {"text": text, "raw": data}
        except requests.exceptions.RequestException as err:
            return {"error": f"LLM request failed: {err}"}

        return {"error": f"Unsupported provider type: {provider_type}"}

    @staticmethod
    def _try_parse_json(text):
        if not text:
            return None
        text = text.strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, flags=re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass

        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                return None
        return None

    @staticmethod
    def _normalize_stem(stem):
        if not stem:
            return ""
        text = str(stem).strip().lower()
        text = re.sub(r"\s+", "", text)
        text = re.sub(r"[，。！？、,.!?;；:：\"'“”‘’（）()\\[\\]{}]", "", text)
        return text

    @classmethod
    def _validate_stage_payload(cls, stage, payload, context=None):
        errors = []
        if not isinstance(payload, dict):
            return ["Payload is not a JSON object"]
        if payload.get("stage") != stage:
            errors.append("Field 'stage' mismatch")
        if "outputs" not in payload or not isinstance(payload.get("outputs"), dict):
            errors.append("Field 'outputs' missing or invalid")
            return errors
        outputs = payload.get("outputs") or {}
        for key in cls.STAGE_OUTPUT_KEYS.get(stage, []):
            if key not in outputs:
                errors.append(f"Missing outputs.{key}")

        if stage == "objective":
            objectives = outputs.get("objectives")
            if not isinstance(objectives, list) or len(objectives) == 0:
                errors.append("outputs.objectives must be a non-empty array")
            else:
                for idx, obj in enumerate(objectives):
                    if not isinstance(obj, dict):
                        errors.append(f"outputs.objectives[{idx}] must be an object")
                        continue
                    statement = (obj.get("statement") or "").strip()
                    measurable_verb = (obj.get("measurable_verb") or "").strip()
                    # 接受 standard 或 success_criteria 任一存在，避免模型字段波动造成全量失败
                    success = (obj.get("success_criteria") or obj.get("standard") or "").strip()
                    if not statement:
                        errors.append(f"outputs.objectives[{idx}].statement is required")
                    if not measurable_verb:
                        errors.append(f"outputs.objectives[{idx}].measurable_verb is required")
                    if not success:
                        errors.append(f"outputs.objectives[{idx}].success_criteria/standard is required")

        if stage in ["pre_assessment", "post_assessment"]:
            questions = outputs.get("questions")
            if not isinstance(questions, list) or len(questions) == 0:
                errors.append("outputs.questions must be a non-empty array")
            else:
                for idx, q in enumerate(questions):
                    if not isinstance(q, dict):
                        errors.append(f"outputs.questions[{idx}] must be an object")
                        continue
                    stem = ""
                    for key in ["stem", "question", "content", "title", "prompt"]:
                        value = q.get(key)
                        if value is not None and str(value).strip():
                            stem = str(value).strip()
                            break
                    if not stem:
                        errors.append(f"outputs.questions[{idx}] missing question stem")

                    options = q.get("options")
                    answer = (q.get("answer") or "").strip()
                    if not isinstance(options, list) or len(options) < 2:
                        errors.append(f"outputs.questions[{idx}].options must contain at least 2 items")
                        continue

                    normalized_options = []
                    for opt in options:
                        if isinstance(opt, dict):
                            text = opt.get("text") or opt.get("value") or opt.get("content") or ""
                            text = str(text).strip()
                        else:
                            text = str(opt).strip()
                        if text:
                            normalized_options.append(text)

                    if len(normalized_options) < 2:
                        errors.append(f"outputs.questions[{idx}] valid options less than 2")
                    elif not answer or answer not in normalized_options:
                        errors.append(f"outputs.questions[{idx}].answer must match one option")
            expected_count = 0
            if isinstance(context, dict):
                if stage == "pre_assessment":
                    expected_count = int(context.get("pre_assessment_expected_count") or 0)
                elif stage == "post_assessment":
                    expected_count = int(context.get("post_assessment_expected_count") or 0)
            if expected_count > 0 and isinstance(questions, list) and len(questions) != expected_count:
                errors.append(f"outputs.questions count must equal expected_count={expected_count}")

        if stage == "participatory":
            activities = outputs.get("activities")
            if not isinstance(activities, list) or len(activities) == 0:
                errors.append("outputs.activities must be a non-empty array")
            else:
                for idx, act in enumerate(activities):
                    if isinstance(act, dict):
                        text = ""
                        for key in ["title", "name", "activity", "task", "step", "description", "detail", "instruction", "goal", "content"]:
                            value = act.get(key)
                            if value is not None and str(value).strip():
                                text = str(value).strip()
                                break
                        if not text:
                            errors.append(f"outputs.activities[{idx}] missing displayable content")
                    else:
                        if not str(act or "").strip():
                            errors.append(f"outputs.activities[{idx}] is empty")

        if stage == "summary":
            errs = outputs.get("common_errors_and_fixes")
            if isinstance(errs, list):
                for idx, item in enumerate(errs):
                    if isinstance(item, dict):
                        err_text = (
                            item.get("error")
                            or item.get("mistake")
                            or item.get("issue")
                            or item.get("problem")
                            or ""
                        )
                        fix_text = (
                            item.get("fix")
                            or item.get("correction")
                            or item.get("advice")
                            or item.get("solution")
                            or ""
                        )
                        if not str(err_text).strip() or str(err_text).strip().lower() in ["none", "null"]:
                            errors.append(f"outputs.common_errors_and_fixes[{idx}].error is empty")
                        if not str(fix_text).strip() or str(fix_text).strip().lower() in ["none", "null"]:
                            errors.append(f"outputs.common_errors_and_fixes[{idx}].fix is empty")
        return errors

    @classmethod
    def _base_context_text(cls, context):
        return (
            f"课程：{context.get('course_name', '未命名课程')}\n"
            f"主题：{context.get('topic', '未命名主题')}\n"
            f"受众：{context.get('audience', '高校学生')}\n"
            f"课堂时长：{context.get('class_minutes', 45)}分钟\n"
            f"重点：{context.get('key_points', '根据主题推断')}\n"
            f"难点：{context.get('difficult_points', '根据主题推断')}\n"
            f"课程目标：{context.get('objectives', '')}\n"
            f"知识库片段：\n{context.get('rag_snippets', '')}\n"
        )

    @classmethod
    def _stage_prompt(cls, stage, context):
        stage_guides = {
            "bridge_in": "生成高质量导入环节（3~8 分钟）与过渡语，快速建立学习动机。",
            "objective": "生成 3~5 条可测学习目标并给出目标-评价对齐检查。",
            "pre_assessment": "生成课前诊断题（选择题）与可执行评估焦点。",
            "participatory": "生成参与式学习任务链（步骤+师生动作+产出物+评价点）。",
            "post_assessment": "生成课后检测题（选择题）与可判定评分规则。",
            "summary": "生成收束性总结、误区修正、一分钟问题与课后行动建议。",
        }
        keys = cls.STAGE_OUTPUT_KEYS.get(stage, [])
        stage_requirement = cls.STAGE_GOAL_REQUIREMENTS.get(stage, "")
        stage_basis_text = ""
        stage_linkage_text = ""
        if stage == "pre_assessment":
            stage_basis_text = context.get("pre_assessment_quiz_basis", "") or ""
            expected_count = int(context.get("pre_assessment_expected_count") or 0)
            stage_linkage_text = (
                "阶段联动参考（请用于前测题目设计）：\n"
                f"bridge_in 当前内容：\n{context.get('bridge_in_stage_content', '') or '未提供'}\n\n"
                f"objective 当前内容：\n{context.get('objective_stage_content', '') or '未提供'}\n"
            )
            if expected_count > 0:
                stage_linkage_text += f"\n数量约束：本章节已有前测共 {expected_count} 题，本次必须生成同样数量的题目。"
        elif stage == "post_assessment":
            stage_basis_text = context.get("post_assessment_quiz_basis", "") or ""
            expected_count = int(context.get("post_assessment_expected_count") or 0)
            stage_linkage_text = (
                "阶段联动参考（请用于后测题目设计）：\n"
                f"objective 当前内容：\n{context.get('objective_stage_content', '') or '未提供'}\n\n"
                f"participatory 当前内容：\n{context.get('participatory_stage_content', '') or '未提供'}\n"
            )
            if expected_count > 0:
                stage_linkage_text += f"\n数量约束：本章节已有后测共 {expected_count} 题，本次必须生成同样数量的题目。"
        elif stage == "summary":
            stage_linkage_text = (
                "测评结果参考（请用于总结反思）：\n"
                f"前测结果摘要：\n{context.get('pre_assessment_result_basis', '') or '暂无前测作答数据'}\n\n"
                f"后测结果摘要：\n{context.get('post_assessment_result_basis', '') or '暂无后测作答数据'}\n\n"
                f"objective 当前内容：\n{context.get('objective_stage_content', '') or '未提供'}\n"
            )

        return (
            f"{cls._base_context_text(context)}\n"
            f"{cls.BOPPPS_DIFFERENTIATION_RULES}\n"
            f"任务：{stage_guides.get(stage, '生成教学内容')}\n"
            f"本阶段目标与约束：\n{stage_requirement}\n"
            f"{stage_linkage_text}\n"
            f"章节测验基础（优先参考；若为空则自行生成）：\n{stage_basis_text or '未设置'}\n"
            "输出格式要求：\n"
            "{\n"
            f'  "stage": "{stage}",\n'
            '  "need_more_info": false,\n'
            '  "missing_info": [],\n'
            '  "outputs": { ... }\n'
            "}\n"
            f"outputs 必须包含字段：{', '.join(keys)}。\n"
            "若 stage=objective，objectives 的单项格式示例：\n"
            '{"id":"O1","statement":"学生能够...","domain":"技能","measurable_verb":"辨析","condition":"给定...","standard":"正确率≥80%","success_criteria":"达到标准即达成"}\n'
            "若使用引用资料，请在 citations 中填 source_id/quote。"
        )

    @classmethod
    def _repair_prompt(cls, stage, raw_text, errors):
        return (
            f"你上一次输出不合法，请修复并只返回 JSON。\n"
            f"目标 stage: {stage}\n"
            f"错误列表: {errors}\n"
            f"上次输出:\n{raw_text}\n"
            "请严格修复后重新输出。"
        )

    @classmethod
    def generate(cls, stage, context):
        if stage not in cls.STAGE_OUTPUT_KEYS:
            return {"error": f"暂不支持该阶段: {stage}"}

        provider = cls.get_active_provider()
        prompt = cls._stage_prompt(stage, context)
        first = cls._call_provider_text(provider, cls.SYSTEM_PROMPT, prompt)
        if first.get("error"):
            return {"error": first.get("error"), "provider": provider}

        parsed = cls._try_parse_json(first.get("text", ""))
        errors = cls._validate_stage_payload(stage, parsed, context=context)
        if not errors:
            return {
                **parsed,
                "_meta": {"valid": True, "retry_used": False, "provider": provider},
            }

        retry_prompt = cls._repair_prompt(stage, first.get("text", ""), errors)
        second = cls._call_provider_text(provider, cls.SYSTEM_PROMPT, retry_prompt)
        if second.get("error"):
            return {
                "error": second.get("error"),
                "raw": first.get("text", ""),
                "validation_errors": errors,
                "provider": provider,
            }

        parsed_retry = cls._try_parse_json(second.get("text", ""))
        retry_errors = cls._validate_stage_payload(stage, parsed_retry, context=context)
        if not retry_errors:
            return {
                **parsed_retry,
                "_meta": {"valid": True, "retry_used": True, "provider": provider},
            }

        return {
            "error": "Invalid JSON format from LLM",
            "raw": second.get("text", "") or first.get("text", ""),
            "validation_errors": retry_errors,
            "provider": provider,
        }

    @classmethod
    def generate_choice_questions(cls, context):
        provider = cls.get_active_provider()
        prompt = (
            f"{cls._base_context_text(context)}\n"
            f"题目数量：{context.get('count', 5)}\n"
            f"难度（1-5）：{context.get('difficulty', 3)}\n"
            f"标签：{', '.join(context.get('tags', []))}\n"
            "请生成严格 JSON：\n"
            "{\n"
            '  "questions": [\n'
            "    {\"stem\": \"\", \"options\": [\"\", \"\", \"\", \"\"], \"answer\": \"\", \"explanation\": \"\", \"difficulty\": 3, \"tags\": []}\n"
            "  ]\n"
            "}\n"
            "仅生成单选题，answer 必须等于某个 option。"
        )
        result = cls._call_provider_text(provider, cls.SYSTEM_PROMPT, prompt)
        if result.get("error"):
            return {"error": result.get("error")}
        parsed = cls._try_parse_json(result.get("text", ""))
        if not isinstance(parsed, dict) or not isinstance(parsed.get("questions"), list):
            return {"error": "Invalid question JSON format", "raw": result.get("text", "")}

        clean_questions = []
        seen_stems = set()
        for item in parsed.get("questions", []):
            if not isinstance(item, dict):
                continue
            stem = (item.get("stem") or "").strip()
            options = item.get("options") if isinstance(item.get("options"), list) else []
            options = [str(opt).strip() for opt in options if str(opt).strip()]
            answer = (item.get("answer") or "").strip()
            explanation = (item.get("explanation") or "").strip()
            difficulty = int(item.get("difficulty") or context.get("difficulty", 3))
            difficulty = max(1, min(5, difficulty))
            tags = item.get("tags") if isinstance(item.get("tags"), list) else context.get("tags", [])
            tags = [str(tag).strip() for tag in tags if str(tag).strip()]
            if not stem or len(options) < 2 or answer not in options:
                continue
            normalized = cls._normalize_stem(stem)
            if not normalized or normalized in seen_stems:
                continue
            seen_stems.add(normalized)

            clean_questions.append(
                {
                    "stem": stem,
                    "options": options,
                    "answer": answer,
                    "explanation": explanation,
                    "difficulty": difficulty,
                    "tags": tags,
                }
            )

        if not clean_questions:
            return {"error": "No valid choice questions generated", "raw": result.get("text", "")}
        return {"questions": clean_questions}
