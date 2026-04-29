import React from 'react';
import {
  Activity,
  BookOpen,
  Cpu,
  Database,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from 'lucide-react';

const Sidebar = ({ user, activeTab, setActiveTab, onLogout }) => {
  const menuItems = [
    { id: 'dashboard', label: '工作台', icon: <LayoutDashboard size={20} />, roles: ['admin', 'teacher', 'student'] },
    { id: 'users', label: '用户管理', icon: <Users size={20} />, roles: ['admin'] },
    { id: 'courses', label: '课程管理', icon: <BookOpen size={20} />, roles: ['admin', 'teacher', 'student'] },
    { id: 'question-bank', label: '题库管理', icon: <Database size={20} />, roles: ['admin', 'teacher'] },
    { id: 'resources', label: '资源上传', icon: <FileText size={20} />, roles: ['admin', 'teacher'] },
    { id: 'ai', label: 'AI设置', icon: <Cpu size={20} />, roles: ['admin'] },
    { id: 'logs', label: '系统日志', icon: <Activity size={20} />, roles: ['admin'] },
    { id: 'settings', label: '密码设置', icon: <Settings size={20} />, roles: ['admin', 'teacher', 'student'] },
  ];

  return (
    <aside className="w-64 bg-[#fdf9f1] border-r border-[#e0d6c8] flex flex-col fixed h-full z-10">
      <div className="p-6 border-b border-[#ece3d6] flex items-center gap-3">
        <div className="w-9 h-9 bg-[#7f5f3b] rounded-xl flex items-center justify-center text-white shadow-sm">
          <GraduationCap size={20} />
        </div>
        <div>
          <div className="text-[10px] tracking-[0.22em] text-[#8d846f] uppercase">Studio</div>
          <span className="text-xl font-bold text-[#2b261f] display-font">BOPPPS</span>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {menuItems
          .filter((item) => item.roles.includes(user.role))
          .map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === item.id
                  ? 'bg-[#efe7da] text-[#5f4528] font-semibold border border-[#deceb8]'
                  : 'text-[#5f5a4f] hover:bg-[#f4ede2]'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
      </nav>

      <div className="p-4 border-t border-[#ece3d6]">
        <div className="flex items-center gap-3 px-4 py-3 mb-2">
          <div className="w-8 h-8 rounded-full bg-[#e7dbc9] flex items-center justify-center text-[#6b5a45] font-bold">
            {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#2c281f] truncate">{user.name || user.username}</p>
            <p className="text-xs text-[#8d846f] capitalize">{user.role}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#b23f2b] hover:bg-[#f7e7e3] rounded-lg transition-colors"
        >
          <LogOut size={16} />
          退出登录
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;

