import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';

const STEPS = ['选择类型', '填写信息', '测试连接', '完成'];

const PROVIDER_PRESETS = {
  ollama: {
    label: 'Ollama（本地部署）',
    desc: '在本地或内网服务器运行的开源大模型，数据不出域',
    defaultBaseUrl: 'http://host.docker.internal:11434',
    defaultModel: 'qwen3:30b',
    placeholder: {
      baseUrl: 'Ollama 服务地址，例如 http://192.168.1.100:11434',
      model: '模型名称，例如 qwen3:30b',
    },
  },
  openai_compatible: {
    label: 'OpenAI 兼容 API',
    desc: '适用于 OpenAI、DeepSeek、通义千问、Kimi 等云端 API',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4',
    placeholder: {
      baseUrl: 'API 地址，例如 https://api.deepseek.com/v1',
      model: '模型名称，例如 gpt-4, deepseek-chat, qwen-plus',
    },
  },
};

const LLMSetupWizard = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [providerType, setProviderType] = useState('ollama');
  const [baseUrl, setBaseUrl] = useState(PROVIDER_PRESETS.ollama.defaultBaseUrl);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(PROVIDER_PRESETS.ollama.defaultModel);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saveResult, setSaveResult] = useState(null);
  const [error, setError] = useState('');

  const presets = PROVIDER_PRESETS[providerType];

  const handleProviderChange = (type) => {
    setProviderType(type);
    const p = PROVIDER_PRESETS[type];
    setBaseUrl(p.defaultBaseUrl);
    setModel(p.defaultModel);
    setApiKey('');
    setTestResult(null);
    setError('');
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const res = await axios.post(`${API_BASE}/admin/system/llm-test-connection`, {
        provider_type: providerType,
        base_url: baseUrl.trim(),
        api_key: apiKey,
        model: model.trim(),
      });
      setTestResult(res.data.data || { ok: true });
      setStep(4);
    } catch (err) {
      const result = err.response?.data?.data || { ok: false, error: err.response?.data?.msg || err.message };
      setTestResult(result);
      setStep(4);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setTestResult(null);
    try {
      await axios.post(`${API_BASE}/admin/ai/providers`, {
        provider_type: providerType,
        name: providerType === 'ollama' ? 'Ollama（默认）' : 'OpenAI 兼容 API（默认）',
        base_url: baseUrl.trim(),
        api_key: apiKey || null,
        model: model.trim(),
        enabled: true,
        is_default: true,
        extra_json: {},
      });
      setSaveResult({ ok: true });
      if (onComplete) onComplete();
    } catch (err) {
      setError('保存失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setSaving(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((label, i) => {
        const idx = i + 1;
        const isActive = step === idx;
        const isDone = step > idx;
        return (
          <React.Fragment key={label}>
            {i > 0 && <div className={`w-12 h-0.5 ${isDone ? 'bg-indigo-500' : 'bg-gray-200'}`} />}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                  : isDone
                  ? 'bg-green-50 text-green-600 border border-green-200'
                  : 'bg-gray-50 text-gray-400 border border-gray-200'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : isDone
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {isDone ? '✓' : idx}
              </span>
              {label}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      {renderStepIndicator()}

      <div className="surface-card p-8 rounded-xl shadow-sm border border-gray-100">
        {/* Step 1: Choose provider type */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">配置 AI 教学助手</h2>
              <p className="text-gray-500">
                选择一个后端来驱动 AI 教学设计功能。您可以稍后在 AI 设置中修改。
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(PROVIDER_PRESETS).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleProviderChange(key)}
                  className={`p-5 rounded-xl border-2 text-left transition-all hover:shadow-md ${
                    providerType === key
                      ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="text-lg font-semibold text-gray-800 mb-1">{cfg.label}</div>
                  <div className="text-sm text-gray-500 leading-relaxed">{cfg.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                下一步
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Fill in details */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-gray-800 mb-1">配置 {presets.label}</h2>
              <p className="text-sm text-gray-500">填写以下信息，所有字段均可修改</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API 地址</label>
              <input
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder={presets.placeholder.baseUrl}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>

            {providerType === 'openai_compatible' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input
                  type="password"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder={apiKey ? '••••••••' : '输入您的 API Key'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">Ollama 通常不需要 API Key</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">模型名称</label>
              <input
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder={presets.placeholder.model}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                上一步
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing || !baseUrl.trim() || !model.trim()}
                  className="px-6 py-2.5 border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors font-medium disabled:opacity-50"
                >
                  {testing ? '测试中...' : '测试连接'}
                </button>
                <button
                  type="button"
                  onClick={() => { setTestResult(null); setStep(4); }}
                  className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                  跳过测试
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Test connection (intermediate state) */}
        {step === 3 && (
          <div className="space-y-6 text-center py-8">
            <div className="animate-pulse">
              <div className="w-16 h-16 mx-auto bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800">正在测试连接...</h3>
              <p className="text-gray-500 text-sm mt-1">正在尝试连接 {baseUrl}</p>
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              取消测试，返回修改
            </button>
          </div>
        )}

        {/* Step 4: Result & Save */}
        {step === 4 && (
          <div className="space-y-6">
            {testResult && (
              <div
                className={`p-5 rounded-xl border ${
                  testResult.ok
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${
                      testResult.ok ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                    }`}
                  >
                    {testResult.ok ? '✓' : '✗'}
                  </span>
                  <div>
                    <h3 className="font-semibold text-gray-800">
                      {testResult.ok ? '连接成功！' : '连接失败'}
                    </h3>
                    {testResult.error && (
                      <p className="text-sm text-red-600 mt-0.5">{testResult.error}</p>
                    )}
                  </div>
                </div>

                {Array.isArray(testResult.models) && testResult.models.length > 0 && (
                  <div className="mt-3 text-sm text-gray-600">
                    <span className="font-medium">可用模型：</span>
                    {testResult.models.slice(0, 8).join('、')}
                    {testResult.models.length > 8 && ` 等 ${testResult.models.length} 个`}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {saveResult?.ok ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-3xl text-green-600">✓</span>
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">配置已保存！</h3>
                <p className="text-gray-500">AI 教学助手已准备就绪，即将跳转至工作台。</p>
              </div>
            ) : (
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  返回修改
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-8 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-60"
                >
                  {saving ? '保存中...' : '保存并开始使用'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LLMSetupWizard;
