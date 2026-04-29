import React, { useState } from 'react';
import axios from 'axios';
import { ArrowLeft, UserPlus } from 'lucide-react';

const Register = ({ onBackToLogin }) => {
  const [formData, setFormData] = useState({ username: '', password: '', name: '' });

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/auth/register', formData);
      alert('注册成功，请登录');
      onBackToLogin();
    } catch (err) {
      alert('注册失败: ' + (err.response?.data?.msg || err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'transparent' }}>
      <div className="surface-card w-full max-w-xl p-8 lg:p-10">
        <button
          type="button"
          onClick={onBackToLogin}
          className="flex items-center text-[#6b6459] hover:text-[#3f392f] mb-6"
        >
          <ArrowLeft size={18} className="mr-1" />
          返回登录
        </button>

        <div className="mb-7">
          <h1 className="text-2xl panel-title flex items-center gap-2">
            <UserPlus size={20} />
            新用户注册
          </h1>
          <p className="text-sm muted mt-1">创建账号后可使用学生端或教师端功能</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm text-[#4f493f] mb-1">用户名</label>
            <input
              className="w-full p-3 border rounded-lg bg-[#fffdf8] outline-none focus:ring-2 focus:ring-[#cdb18b]"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[#4f493f] mb-1">姓名</label>
            <input
              className="w-full p-3 border rounded-lg bg-[#fffdf8] outline-none focus:ring-2 focus:ring-[#cdb18b]"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[#4f493f] mb-1">密码</label>
            <input
              type="password"
              className="w-full p-3 border rounded-lg bg-[#fffdf8] outline-none focus:ring-2 focus:ring-[#cdb18b]"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>

          <button type="submit" className="w-full py-3 bg-[#2f6b43] text-white rounded-lg hover:bg-[#255537] font-semibold transition-all">
            注册
          </button>
        </form>
      </div>
    </div>
  );
};

export default Register;

