import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, Plus, Trash2, KeyRound } from 'lucide-react';
import { apiUrl } from '../api';

const confirmDelete = (message) => {
  if (!window.confirm(message)) return false;
  return window.confirm('请再次确认，删除后不可恢复。');
};

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'student', name: '', major: '人工智能', class_name: '人工智能1班' });

  const fetchUsers = async () => {
    try {
      const res = await axios.get(apiUrl('/admin/users'));
      setUsers(Array.isArray(res.data.data) ? res.data.data : []);
    } catch (err) {
      console.error(err);
      alert('获取用户失败: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post(apiUrl('/admin/users'), newUser);
      alert('用户创建成功');
      setShowAddForm(false);
      setNewUser({ username: '', password: '', role: 'student', name: '', major: '人工智能', class_name: '人工智能1班' });
      fetchUsers();
    } catch (err) {
      alert('创建失败: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleDeleteUser = async (user) => {
    if (user.username === 'admin' || user.username === 'teacher' || user.username === 'student') {
      alert('默认用户不能删除');
      return;
    }

    if (!confirmDelete(`确定删除用户“${user.username}”吗？`)) return;

    try {
      await axios.delete(apiUrl(`/admin/users/${user.id}`));
      alert('用户已删除');
      fetchUsers();
    } catch (err) {
      alert('删除失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  const handleResetPassword = async (user) => {
    if (!window.confirm(`确定将用户“${user.username}”的密码重置为 123 吗？`)) return;
    try {
      await axios.post(apiUrl(`/admin/users/${user.id}/reset-password`));
      alert('密码已重置为 123');
    } catch (err) {
      alert('重置失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div className="surface-card motion-panel p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
          <Users size={20} /> 用户管理
        </h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-1 text-sm transition-all duration-300 hover:-translate-y-0.5"
        >
          <Plus size={16} /> {showAddForm ? '取消添加' : '添加用户'}
        </button>
      </div>

      {showAddForm && (
        <div className="mb-8 p-6 bg-gray-50 rounded-xl border border-indigo-100 motion-panel">
          <h3 className="font-bold text-gray-700 mb-4">添加新用户</h3>
          <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4 items-end">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">用户名</label>
              <input
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                required
                placeholder="例如: 2021001"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">密码</label>
              <input
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                required
                placeholder="初始密码"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">姓名</label>
              <input
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="真实姓名"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">角色</label>
              <select
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                value={newUser.role}
                onChange={(e) => {
                  const role = e.target.value;
                  setNewUser({
                    ...newUser,
                    role,
                    major: role === 'student' ? (newUser.major || '人工智能') : '',
                    class_name: role === 'student' ? (newUser.class_name || '人工智能1班') : '',
                  });
                }}
              >
                <option value="student">学生</option>
                <option value="teacher">教师</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            {newUser.role === 'student' && (
              <>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">专业</label>
                  <input
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={newUser.major}
                    onChange={(e) => setNewUser({ ...newUser, major: e.target.value })}
                    placeholder="例如: 人工智能"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">班级</label>
                  <input
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={newUser.class_name}
                    onChange={(e) => setNewUser({ ...newUser, class_name: e.target.value })}
                    placeholder="例如: 人工智能1班"
                  />
                </div>
              </>
            )}
            <button type="submit" className="h-[42px] bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors">
              保存用户
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-8 text-gray-500">加载中...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase font-semibold tracking-wider">
              <tr>
                <th className="p-4 border-b">ID</th>
                <th className="p-4 border-b">用户名</th>
                <th className="p-4 border-b">姓名</th>
                <th className="p-4 border-b">角色</th>
                <th className="p-4 border-b">专业</th>
                <th className="p-4 border-b">班级</th>
                <th className="p-4 border-b">注册时间</th>
                <th className="p-4 border-b">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-gray-400">暂无用户数据</td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors duration-300">
                    <td className="p-4 text-gray-500">#{u.id}</td>
                    <td className="p-4 font-medium text-gray-900">{u.username}</td>
                    <td className="p-4 text-gray-700">{u.name || '-'}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                        u.role === 'admin' ? 'bg-red-50 text-red-700 border-red-200' :
                        u.role === 'teacher' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                        'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {u.role === 'admin' ? '管理员' : u.role === 'teacher' ? '教师' : '学生'}
                      </span>
                    </td>
                    <td className="p-4 text-gray-700">{u.role === 'student' ? (u.major || '-') : '-'}</td>
                    <td className="p-4 text-gray-700">{u.role === 'student' ? (u.class_name || '-') : '-'}</td>
                    <td className="p-4 text-gray-500 text-sm">{u.created_at}</td>
                    <td className="p-4">
                      {(u.username === 'admin' || u.username === 'teacher' || u.username === 'student') ? (
                        <span className="text-xs text-gray-400">系统用户</span>
                      ) : (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleResetPassword(u)}
                            className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-800 text-sm font-medium"
                          >
                            <KeyRound size={14} />
                            重置密码
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            <Trash2 size={14} />
                            删除
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default UserManagement;

