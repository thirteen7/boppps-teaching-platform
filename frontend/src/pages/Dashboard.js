import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BookOpen } from 'lucide-react';
import { API_BASE } from '../api';

const Dashboard = ({ user }) => {
  const [courses, setCourses] = useState([]);
  const role = localStorage.getItem('role');

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const res = await axios.get(`${API_BASE}/teaching/courses`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setCourses(res.data.data);
      } catch (err) {
        console.error('获取课程失败', err);
      }
    };
    fetchCourses();
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-10 text-white shadow-lg motion-panel relative overflow-hidden">
        <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/15 motion-float" />
        <h2 className="text-3xl font-bold mb-4">欢迎回来，{user?.name} 👋</h2>
        <p className="opacity-90 max-w-2xl text-lg">
          您现在位于 BOPPPS 辅助教学系统的控制台。
        </p>
      </div>

      <div>
        <h3 className="text-2xl font-bold text-gray-800 mb-4">
          {role === 'student' ? '我的课程' : '我教授的课程'}
        </h3>
        {courses.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm text-center text-gray-500 motion-panel">
            暂无课程，请前往课程管理{role === 'student' ? '加入' : '创建'}。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-group">
            {courses.map((course) => (
              <div key={course.id} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow motion-card">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg motion-card-icon">
                    <BookOpen size={24} />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{course.name}</h3>
                <p className="text-sm text-gray-500 mb-4 font-mono">ID: {course.id} | 代码: {course.code}</p>
                <p className="text-gray-600 text-sm line-clamp-3">{course.objectives || '暂无说明'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;

