import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Edit3, Trash2 } from 'lucide-react';
import { API_BASE } from '../api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const createEmptyForm = () => ({
  id: null,
  stem: '',
  options: ['', ''],
  answer: '',
  explanation: '',
  difficulty: 3,
  tagsText: '',
});

const QuestionBankManagement = () => {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(createEmptyForm());
  const [inlineForm, setInlineForm] = useState(createEmptyForm());
  const [inlineSaving, setInlineSaving] = useState(false);

  const loadCourses = useCallback(async () => {
    const res = await axios.get(`${API_BASE}/teaching/courses`, { headers: authHeaders() });
    const list = res.data.data || [];
    setCourses(list);
    if (!courseId && list.length > 0) {
      setCourseId(String(list[0].id));
    }
  }, [courseId]);

  const loadItems = useCallback(async (targetCourseId = courseId) => {
    if (!targetCourseId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ course_id: String(targetCourseId) });
      const res = await axios.get(`${API_BASE}/teaching/question-bank?${params.toString()}`, { headers: authHeaders() });
      setItems(res.data.data || []);
    } catch (err) {
      alert(`加载题库失败: ${err.response?.data?.msg || err.message}`);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { loadCourses(); }, [loadCourses]);
  useEffect(() => { if (courseId) loadItems(courseId); }, [courseId, loadItems]);

  const availableTags = useMemo(
    () => Array.from(new Set(items.flatMap((x) => x.tags || []))).filter(Boolean),
    [items]
  );

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return items.filter((item) => {
      const kwMatched = !kw || (item.stem || '').toLowerCase().includes(kw);
      const tagMatched = !tagFilter || (item.tags || []).includes(tagFilter);
      const difficultyMatched = !difficultyFilter || String(item.difficulty || '') === String(difficultyFilter);
      return kwMatched && tagMatched && difficultyMatched;
    });
  }, [items, keyword, tagFilter, difficultyFilter]);

  const handleDelete = async (id) => {
    if (!window.confirm('确定删除这道题吗？')) return;
    try {
      await axios.delete(`${API_BASE}/teaching/question-bank/${id}`, { headers: authHeaders() });
      await loadItems();
    } catch (err) {
      alert(`删除失败: ${err.response?.data?.msg || err.message}`);
    }
  };

  const openEdit = (item) => {
    setForm({
      id: item.id,
      stem: item.stem || '',
      options: (item.options || ['', '']).length >= 2 ? (item.options || ['', '']) : ['', ''],
      answer: item.answer || '',
      explanation: item.explanation || '',
      difficulty: Number(item.difficulty || 3),
      tagsText: (item.tags || []).join(','),
    });
    setCreating(false);
    setEditing(true);
  };

  const openCreate = () => {
    if (!courseId) {
      alert('请先选择课程后再录入题目');
      return;
    }
    setForm(createEmptyForm());
    setCreating(true);
    setEditing(true);
  };

  const updateOption = (idx, value) => {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((opt, i) => (i === idx ? value : opt)),
    }));
  };

  const addOption = () => {
    setForm((prev) => ({ ...prev, options: [...prev.options, ''] }));
  };

  const saveEdit = async () => {
    const stem = form.stem.trim();
    const options = form.options.map((x) => x.trim()).filter(Boolean);
    const answer = form.answer.trim();
    if (!stem || options.length < 2 || !answer || !options.includes(answer)) {
      alert('请检查题目：题干不能为空，至少两个选项，答案必须来自选项。');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        stem,
        options,
        answer,
        explanation: (form.explanation || '').trim(),
        difficulty: Number(form.difficulty || 3),
        tags: form.tagsText.split(',').map((x) => x.trim()).filter(Boolean),
      };
      if (creating) {
        await axios.post(`${API_BASE}/teaching/question-bank`, {
          ...payload,
          source: 'manual',
          course_id: Number(courseId),
        }, { headers: authHeaders() });
      } else {
        await axios.put(`${API_BASE}/teaching/question-bank/${form.id}`, payload, { headers: authHeaders() });
      }
      setEditing(false);
      setCreating(false);
      setForm(createEmptyForm());
      await loadItems();
    } catch (err) {
      alert(`保存失败: ${err.response?.data?.msg || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const updateInlineOption = (idx, value) => {
    setInlineForm((prev) => ({
      ...prev,
      options: prev.options.map((opt, i) => (i === idx ? value : opt)),
    }));
  };

  const addInlineOption = () => {
    setInlineForm((prev) => ({ ...prev, options: [...prev.options, ''] }));
  };

  const saveInlineCreate = async () => {
    if (!courseId) {
      alert('请先选择课程后再录入题目');
      return;
    }
    const stem = inlineForm.stem.trim();
    const options = inlineForm.options.map((x) => x.trim()).filter(Boolean);
    const answer = inlineForm.answer.trim();
    if (!stem || options.length < 2 || !answer || !options.includes(answer)) {
      alert('请检查题目：题干不能为空，至少两个选项，答案必须来自选项。');
      return;
    }
    setInlineSaving(true);
    try {
      await axios.post(`${API_BASE}/teaching/question-bank`, {
        source: 'manual',
        course_id: Number(courseId),
        stem,
        options,
        answer,
        explanation: (inlineForm.explanation || '').trim(),
        difficulty: Number(inlineForm.difficulty || 3),
        tags: inlineForm.tagsText.split(',').map((x) => x.trim()).filter(Boolean),
      }, { headers: authHeaders() });
      setInlineForm(createEmptyForm());
      await loadItems();
      alert('题目已录入题库');
    } catch (err) {
      alert(`录入失败: ${err.response?.data?.msg || err.message}`);
    } finally {
      setInlineSaving(false);
    }
  };

  return (
    <div className="surface-card p-6 h-full space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">题库管理</h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={openCreate} className="px-3 py-2 rounded text-sm bg-indigo-600 text-white">手动录题</button>
          <button type="button" onClick={() => loadItems()} className="px-3 py-2 border rounded text-sm">刷新</button>
        </div>
      </div>

      <div className="border rounded-lg p-3 bg-blue-50 border-blue-200 text-sm text-blue-900">
        <div className="font-semibold">题库使用建议</div>
        <div className="mt-1 text-xs leading-5">
          优先复用成熟题（有历史作答数据），再补充手动录入的新题。录题时建议填写解析与标签，便于后续 AI 教学分析和课堂讲评。
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <select className="p-2 border rounded" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          {courses.map((course) => (
            <option key={course.id} value={String(course.id)}>{course.name}</option>
          ))}
        </select>
        <input className="p-2 border rounded" placeholder="按题干关键字筛选" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <select className="p-2 border rounded" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="">全部标签</option>
          {availableTags.map((tag) => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
        <select className="p-2 border rounded" value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)}>
          <option value="">全部难度</option>
          {[1, 2, 3, 4, 5].map((lv) => (
            <option key={lv} value={String(lv)}>难度 {lv}</option>
          ))}
        </select>
      </div>

      <div className="border rounded-lg p-3 space-y-3 bg-gray-50">
        <div className="font-semibold text-gray-800">手动录题（页面内）</div>
        <div className="text-xs text-gray-500">
          该区域用于快速新增题目到当前课程题库；建议填写解析与标签，方便后续教学分析。
        </div>
        <input
          className="w-full p-2 border rounded bg-white"
          value={inlineForm.stem}
          onChange={(e) => setInlineForm((p) => ({ ...p, stem: e.target.value }))}
          placeholder="题干"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {inlineForm.options.map((opt, idx) => (
            <input
              key={`inline_opt_${idx}`}
              className="p-2 border rounded bg-white"
              value={opt}
              onChange={(e) => updateInlineOption(idx, e.target.value)}
              placeholder={`选项 ${idx + 1}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={addInlineOption} className="px-2 py-1 border rounded text-xs bg-white">添加选项</button>
          <select
            className="flex-1 p-2 border rounded bg-white"
            value={inlineForm.answer}
            onChange={(e) => setInlineForm((p) => ({ ...p, answer: e.target.value }))}
          >
            <option value="">请选择标准答案</option>
            {inlineForm.options.map((opt, idx) => {
              const v = (opt || '').trim();
              if (!v) return null;
              return <option key={`inline_ans_${idx}`} value={v}>{String.fromCharCode(65 + idx)}. {v}</option>;
            })}
          </select>
        </div>
        <textarea
          className="w-full p-2 border rounded text-sm bg-white"
          value={inlineForm.explanation || ''}
          onChange={(e) => setInlineForm((p) => ({ ...p, explanation: e.target.value }))}
          placeholder="题目解析（用于课堂讲解）"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <select className="p-2 border rounded bg-white" value={inlineForm.difficulty} onChange={(e) => setInlineForm((p) => ({ ...p, difficulty: e.target.value }))}>
            {[1, 2, 3, 4, 5].map((lv) => (
              <option key={lv} value={lv}>难度 {lv}</option>
            ))}
          </select>
          <input
            className="p-2 border rounded bg-white"
            value={inlineForm.tagsText}
            onChange={(e) => setInlineForm((p) => ({ ...p, tagsText: e.target.value }))}
            placeholder="标签（逗号分隔）"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setInlineForm(createEmptyForm())}
            className="px-3 py-2 border rounded text-sm bg-white"
          >
            清空
          </button>
          <button
            type="button"
            onClick={saveInlineCreate}
            disabled={inlineSaving}
            className="px-4 py-2 bg-green-600 text-white rounded text-sm disabled:opacity-60"
          >
            {inlineSaving ? '录入中...' : '录入题库'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-500 text-sm border border-dashed rounded-lg p-4">当前筛选下没有题目。</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div key={item.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
              <div className="text-sm">
                <div className="font-semibold text-gray-900">{item.stem}</div>
                <div className="text-gray-600 mt-1">选项: {(item.options || []).join(' | ')}</div>
                <div className="text-gray-600">答案: {item.answer}</div>
                {item.explanation && <div className="text-gray-500">解析: {item.explanation}</div>}
                <div className="text-gray-500 mt-1">
                  难度: {item.difficulty} | 标签: {(item.tags || []).join(', ') || '-'}
                  {' | 历史人数: '}{item.history_attempts || 0}
                  {' | 历史正确率: '}
                  {item.history_accuracy !== null && item.history_accuracy !== undefined ? `${Number(item.history_accuracy).toFixed(2)}%` : '-'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => openEdit(item)} className="px-2 py-1 border rounded text-xs flex items-center gap-1"><Edit3 size={14} /> 编辑</button>
                <button type="button" onClick={() => handleDelete(item.id)} className="px-2 py-1 border rounded text-xs text-red-600 flex items-center gap-1"><Trash2 size={14} /> 删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/50 motion-overlay z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl p-4 space-y-3 motion-modal">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{creating ? '手动录入题目' : '编辑题目'}</h3>
              <button type="button" onClick={() => { setEditing(false); setCreating(false); setForm(createEmptyForm()); }} className="text-gray-500 text-sm inline-flex items-center gap-1">
                <ArrowLeft size={14} /> 关闭
              </button>
            </div>
            {creating && (
              <div className="text-xs text-gray-500 border rounded p-2 bg-gray-50">
                当前将录入到所选课程题库。建议题干聚焦一个知识点，解析写清“为什么对/错”，便于后续教学复盘。
              </div>
            )}
            <input className="w-full p-2 border rounded" value={form.stem} onChange={(e) => setForm((p) => ({ ...p, stem: e.target.value }))} placeholder="题干" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {form.options.map((opt, idx) => (
                <input key={`opt_${idx}`} className="p-2 border rounded" value={opt} onChange={(e) => updateOption(idx, e.target.value)} placeholder={`选项 ${idx + 1}`} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={addOption} className="px-2 py-1 border rounded text-xs">添加选项</button>
              <select className="flex-1 p-2 border rounded" value={form.answer} onChange={(e) => setForm((p) => ({ ...p, answer: e.target.value }))}>
                <option value="">请选择标准答案</option>
                {form.options.map((opt, idx) => {
                  const v = (opt || '').trim();
                  if (!v) return null;
                  return <option key={`ans_${idx}`} value={v}>{String.fromCharCode(65 + idx)}. {v}</option>;
                })}
              </select>
            </div>
            <textarea className="w-full p-2 border rounded text-sm" value={form.explanation || ''} onChange={(e) => setForm((p) => ({ ...p, explanation: e.target.value }))} placeholder="题目解析（用于课堂讲解）" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <select className="p-2 border rounded" value={form.difficulty} onChange={(e) => setForm((p) => ({ ...p, difficulty: e.target.value }))}>
                {[1, 2, 3, 4, 5].map((lv) => (
                  <option key={lv} value={lv}>难度 {lv}</option>
                ))}
              </select>
              <input className="p-2 border rounded" value={form.tagsText} onChange={(e) => setForm((p) => ({ ...p, tagsText: e.target.value }))} placeholder="标签（逗号分隔）" />
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={saveEdit} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-60">
                {saving ? '保存中...' : (creating ? '保存到题库' : '保存修改')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionBankManagement;

