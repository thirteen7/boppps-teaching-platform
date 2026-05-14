import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from './api';

import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Register from './pages/Register';
import UserManagement from './pages/UserManagement';
import CourseManagement from './pages/CourseManagement';
import ResourceUpload from './pages/ResourceUpload';
import SystemLogs from './pages/SystemLogs';
import ChangePassword from './pages/ChangePassword';
import AISettings from './pages/AISettings';
import QuestionBankManagement from './pages/QuestionBankManagement';

axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token && token !== 'undefined' && token !== 'null') {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('active_tab') || 'dashboard');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    localStorage.setItem('active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && (error.response.status === 401 || error.response.status === 422)) {
          if (localStorage.getItem('token')) {
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            setUser(null);
            alert('登录状态已失效，请重新登录');
          }
        }
        return Promise.reject(error);
      }
    );

    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  useEffect(() => {
    const bootstrapAuth = async () => {
      const token = localStorage.getItem('token');

      if (!token || token === 'undefined' || token === 'null') {
        setAuthReady(true);
        return;
      }

      try {
        const res = await axios.get(`${API_BASE}/auth/me`);
        const currentUser = res.data?.data;

        if (currentUser?.username) {
          setUser({
            username: currentUser.username,
            role: currentUser.role,
            name: currentUser.name,
          });
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('role');
        }
      } catch (_error) {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        setUser(null);
      } finally {
        setAuthReady(true);
      }
    };

    bootstrapAuth();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('active_tab');
    setUser(null);
    setActiveTab('dashboard');
  };

  const handleLogin = async (loginData) => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');

    try {
      const res = await axios.post(`${API_BASE}/auth/login`, loginData);
      const payload = res.data?.data || {};

      if (!payload.token) {
        throw new Error('登录接口未返回 token');
      }

      localStorage.setItem('token', payload.token);
      localStorage.setItem('role', payload.role);

      setUser({
        username: payload.username,
        role: payload.role,
        name: payload.name,
      });
      setActiveTab('dashboard');
      return true;
    } catch (err) {
      const errMsg = err.response?.data?.msg || err.response?.data?.message || err.message || '登录失败';
      alert(`登录失败: ${errMsg}`);
      return false;
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen app-shell flex items-center justify-center">
        <div className="muted motion-panel">加载中...</div>
      </div>
    );
  }

  if (isRegistering) {
    return <Register onBackToLogin={() => setIsRegistering(false)} />;
  }

  if (!user) {
    return <Login handleLogin={handleLogin} onGoToRegister={() => setIsRegistering(true)} />;
  }

  return (
    <div className="min-h-screen app-shell flex">
      <Sidebar user={user} activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} />

      <main className="flex-1 ml-64 p-8 max-w-[calc(100vw-16rem)]">
        <header className="mb-8 surface-card motion-panel p-5">
          <div className="text-xs uppercase tracking-[0.2em] muted mb-2">BOPPPS Teaching Studio</div>
          <h1 className="text-3xl panel-title">
            {activeTab === 'dashboard' && '工作台'}
            {activeTab === 'users' && '用户管理'}
            {activeTab === 'courses' && '课程管理'}
            {activeTab === 'question-bank' && '题库管理'}
            {activeTab === 'resources' && '资源上传'}
            {activeTab === 'ai' && 'AI 设置'}
            {activeTab === 'logs' && '系统日志'}
            {activeTab === 'settings' && '修改密码'}
          </h1>
        </header>

        <div key={activeTab} className="page-transition">
          {activeTab === 'dashboard' && (
            <div className="surface-card hero-welcome motion-panel p-10 relative overflow-hidden">
              <div className="absolute right-0 top-0 w-80 h-80 rounded-full hero-glow -translate-y-1/3 translate-x-1/3" />
              <div className="absolute left-10 bottom-6 text-[84px] leading-none text-[#bedcff] font-serif pointer-events-none motion-float">“</div>
              <div className="relative inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium text-[#2f7df6] bg-white/80 border border-[#d7e5f4] mb-4">
                智能教学工作台
              </div>
              <h2 className="text-4xl panel-title mb-4 relative">欢迎回来，{user.name || user.username}</h2>
              <p className="muted max-w-2xl text-lg relative">
                这里是你的教学设计工作区。先搭建目标，再连接测评和课堂活动，让每一节课都形成可追踪的学习闭环。
              </p>
            </div>
          )}

          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'courses' && <CourseManagement />}
          {activeTab === 'question-bank' && <QuestionBankManagement />}
          {activeTab === 'resources' && <ResourceUpload />}
          {activeTab === 'ai' && <AISettings />}
          {activeTab === 'logs' && <SystemLogs />}
          {activeTab === 'settings' && <ChangePassword />}
        </div>
      </main>
    </div>
  );
}

