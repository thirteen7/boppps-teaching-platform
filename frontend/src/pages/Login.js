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
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'transparent' }}>
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="surface-card p-8 lg:p-10 flex flex-col justify-between">
          <div>
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

        <div className="surface-card p-8 lg:p-10">
          <h2 className="panel-title text-2xl mb-1">登录</h2>
          <p className="text-sm muted mb-6">请输入账号信息进入工作区</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-[#4f493f] mb-1">用户名</label>
              <input
                type="text"
                className="w-full p-3 border rounded-lg bg-[#fffdf8] outline-none focus:ring-2 focus:ring-[#cdb18b]"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm text-[#4f493f] mb-1">密码</label>
              <input
                type="password"
                className="w-full p-3 border rounded-lg bg-[#fffdf8] outline-none focus:ring-2 focus:ring-[#cdb18b]"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-[#7f5f3b] text-white rounded-lg hover:bg-[#6e5232] font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? '登录中...' : '登录'}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between text-sm">
            <span className="muted">默认账号: admin / 123</span>
            <button onClick={onGoToRegister} className="text-[#7f5f3b] hover:text-[#5c452b] font-medium">
              没有账号？去注册
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
