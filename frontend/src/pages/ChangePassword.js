import React, { useState } from 'react';
import axios from 'axios';
import { Lock, Save } from 'lucide-react';

const ChangePassword = () => {
  const [data, setData] = useState({ old_password: '', new_password: '', confirm_password: '' });

  const handleChange = async (e) => {
    e.preventDefault();

    if (data.new_password !== data.confirm_password) {
      alert('两次输入的新密码不一致');
      return;
    }

    try {
      await axios.post('/api/auth/change-password', {
        old_password: data.old_password,
        new_password: data.new_password,
      });
      alert('密码修改成功，请重新登录');
      setData({ old_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      alert('修改失败: ' + (err.response?.data?.msg || err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="surface-card p-6 max-w-md">
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-800">
        <Lock size={20} />
        修改密码
      </h2>

      <form onSubmit={handleChange} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">旧密码</label>
          <input
            type="password"
            className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 outline-none"
            value={data.old_password}
            onChange={(e) => setData({ ...data, old_password: e.target.value })}
            required
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">新密码</label>
          <input
            type="password"
            className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 outline-none"
            value={data.new_password}
            onChange={(e) => setData({ ...data, new_password: e.target.value })}
            required
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">确认新密码</label>
          <input
            type="password"
            className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 outline-none"
            value={data.confirm_password}
            onChange={(e) => setData({ ...data, confirm_password: e.target.value })}
            required
          />
        </div>

        <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700 flex justify-center items-center gap-2">
          <Save size={18} />
          保存新密码
        </button>
      </form>
    </div>
  );
};

export default ChangePassword;

