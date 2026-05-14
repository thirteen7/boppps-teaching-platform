import React, { useState } from 'react';

const Login = ({ handleLogin, onGoToRegister }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      await handleLogin({ username, password });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen auth-shell flex items-center justify-center p-6" style={{ background: 'transparent' }}>
      <div className="absolute inset-x-[12%] top-[18%] h-40 rounded-full bg-[rgba(188,221,255,0.18)] blur-3xl motion-float pointer-events-none" />
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="surface-card motion-panel auth-highlight p-8 lg:p-10 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute right-[-40px] top-[-30px] w-48 h-48 rounded-full bg-[#d9ecff] opacity-70" />
          <div className="stagger-group">
            <div className="text-xs uppercase tracking-[0.24em] muted">BOPPPS Teaching Studio</div>
            <h1 className="text-4xl mt-3 panel-title">教学设计与课堂测评一体化平台</h1>
            <p className="mt-4 muted leading-7">
              以目标为锚点，串联导入、测评、活动与复盘，让每节课都能看到学习证据与改进方向。
            </p>
          </div>
          <div className="mt-10 text-sm muted">
            推荐先从“课程管理 → 章节教案 → 测验推送”开始。
          </div>
        </div>

        <div className="surface-card motion-panel p-8 lg:p-10">
          <h2 className="panel-title text-2xl mb-1">登录</h2>
          <p className="text-sm muted mb-6">请输入账号信息进入工作区</p>

          <form onSubmit={handleSubmit} className="space-y-5 stagger-group">
            <div>
              <label className="block text-sm text-[#587491] mb-1">用户名</label>
              <input
                type="text"
                className="w-full p-3 border rounded-xl outline-none transition-all duration-300"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm text-[#587491] mb-1">密码</label>
              <input
                type="password"
                className="w-full p-3 border rounded-xl outline-none transition-all duration-300"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 primary-button rounded-xl font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? '登录中...' : '登录'}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between text-sm">
            <span className="muted">默认账号: admin / 123</span>
            <button onClick={onGoToRegister} className="ghost-button font-medium">
              没有账号？去注册
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
