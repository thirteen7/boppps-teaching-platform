import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = '/api';

const defaultForm = {
  provider_type: 'ollama',
  name: '',
  base_url: 'http://127.0.0.1:11434',
  api_key: '',
  model: '',
  enabled: true,
  is_default: false,
  extra_json: '{}',
};

const AISettings = () => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const fetchItems = async () => {
    try {
      const res = await axios.get(`${API_BASE}/admin/ai/providers`);
      setItems(res.data.data || []);
    } catch (err) {
      alert('加载 AI 配置失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const parseExtraJson = () => {
    try {
      const parsed = JSON.parse(form.extra_json || '{}');
      if (typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed;
    } catch (_e) {
      throw new Error('extra_json 不是合法 JSON');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        provider_type: form.provider_type,
        name: form.name.trim(),
        base_url: form.base_url.trim(),
        api_key: form.api_key,
        model: form.model.trim(),
        enabled: !!form.enabled,
        is_default: !!form.is_default,
        extra_json: parseExtraJson(),
      };
      if (!payload.name || !payload.base_url || !payload.model) {
        throw new Error('name/base_url/model 必填');
      }

      if (editingId) {
        await axios.put(`${API_BASE}/admin/ai/providers/${editingId}`, payload);
      } else {
        await axios.post(`${API_BASE}/admin/ai/providers`, payload);
      }
      setForm(defaultForm);
      setEditingId(null);
      await fetchItems();
      alert('保存成功');
    } catch (err) {
      alert('保存失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setForm({
      provider_type: item.provider_type,
      name: item.name,
      base_url: item.base_url,
      api_key: '',
      model: item.model,
      enabled: !!item.enabled,
      is_default: !!item.is_default,
      extra_json: JSON.stringify(item.extra_json || {}, null, 2),
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定删除该 AI Provider 吗？')) return;
    try {
      await axios.delete(`${API_BASE}/admin/ai/providers/${id}`);
      await fetchItems();
      alert('删除成功');
    } catch (err) {
      alert('删除失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  const handleTest = async (id) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await axios.post(`${API_BASE}/admin/ai/providers/${id}/test`);
      setTestResult(res.data.data || { ok: true });
    } catch (err) {
      setTestResult(err.response?.data?.data || { ok: false, error: err.response?.data?.msg || err.message });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="surface-card p-6 space-y-6">
      <h2 className="text-xl font-bold text-gray-800">AI API 设置</h2>

      <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded-lg p-4">
        <select className="p-2 border rounded" value={form.provider_type} onChange={(e) => setForm((p) => ({ ...p, provider_type: e.target.value }))}>
          <option value="ollama">Ollama</option>
          <option value="openai_compatible">OpenAI Compatible</option>
        </select>
        <input className="p-2 border rounded" placeholder="配置名称" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        <input className="p-2 border rounded" placeholder="Base URL" value={form.base_url} onChange={(e) => setForm((p) => ({ ...p, base_url: e.target.value }))} />
        <input className="p-2 border rounded" placeholder="模型名" value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} />
        <input className="p-2 border rounded md:col-span-2" placeholder="API Key（可空）" value={form.api_key} onChange={(e) => setForm((p) => ({ ...p, api_key: e.target.value }))} />
        <textarea className="p-2 border rounded md:col-span-2 h-28 font-mono text-sm" placeholder='额外参数 JSON，例如 {"temperature":0.2}' value={form.extra_json} onChange={(e) => setForm((p) => ({ ...p, extra_json: e.target.value }))} />
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))} />
          启用
        </label>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={form.is_default} onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))} />
          设为默认
        </label>
        <div className="md:col-span-2 flex gap-2">
          <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-60">
            {saving ? '保存中...' : (editingId ? '更新配置' : '新增配置')}
          </button>
          {editingId && (
            <button type="button" className="px-4 py-2 border rounded" onClick={() => { setEditingId(null); setForm(defaultForm); }}>
              取消编辑
            </button>
          )}
        </div>
      </form>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="text-sm text-gray-500">暂无 AI Provider 配置</div>
        ) : items.map((item) => (
          <div key={item.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-semibold text-gray-800">{item.name} ({item.provider_type})</div>
              <div className="text-gray-600">Base: {item.base_url}</div>
              <div className="text-gray-600">Model: {item.model}</div>
              <div className="text-gray-500">Key: {item.api_key_masked || '未设置'}</div>
              <div className="text-gray-500">状态: {item.enabled ? '启用' : '停用'} | 默认: {item.is_default ? '是' : '否'}</div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => handleTest(item.id)} disabled={testingId === item.id} className="px-3 py-2 border rounded text-sm">
                {testingId === item.id ? '测试中...' : '测试连接'}
              </button>
              <button type="button" onClick={() => handleEdit(item)} className="px-3 py-2 border rounded text-sm">编辑</button>
              <button type="button" onClick={() => handleDelete(item.id)} className="px-3 py-2 bg-red-600 text-white rounded text-sm">删除</button>
            </div>
          </div>
        ))}
      </div>

      {testResult && (
        <div className={`border rounded-lg p-3 text-sm ${testResult.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="font-semibold">{testResult.ok ? '连接成功' : '连接失败'}</div>
          {Array.isArray(testResult.models) && (
            <div className="mt-1">可用模型: {testResult.models.slice(0, 10).join(', ') || '无'}</div>
          )}
          {testResult.error && <div className="mt-1 text-red-700">{testResult.error}</div>}
          {!testResult.ok && testResult.probe_raw && <pre className="mt-2 whitespace-pre-wrap">{String(testResult.probe_raw)}</pre>}
        </div>
      )}
    </div>
  );
};

export default AISettings;

