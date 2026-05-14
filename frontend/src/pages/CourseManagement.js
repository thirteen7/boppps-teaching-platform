/* eslint-disable react-hooks/exhaustive-deps */
import React, { lazy, Suspense, useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, BookOpen, ArrowLeft, FileEdit, Save, Wand2, Trash2, Users, Search, Link as LinkIcon, BarChart3, Bot, Trophy } from 'lucide-react';
import { API_BASE, API_ORIGIN } from '../api';

const API_HOST = API_ORIGIN;

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const stageNames = {
  bridge_in: 'Bridge-in',
  objective: 'Objective',
  pre_assessment: 'Pre-assessment',
  participatory: 'Participatory',
  post_assessment: 'Post-assessment',
  summary: 'Summary',
};
const stageOrder = ['bridge_in', 'objective', 'pre_assessment', 'participatory', 'post_assessment', 'summary'];
const stageHintTitle = {
  bridge_in: '导入环节',
  objective: '学习目标',
  pre_assessment: '前测',
  participatory: '参与式学习',
  post_assessment: '后测',
  summary: '总结',
};

const createEmptyQuestion = () => ({
  content: '',
  options: ['', ''],
  answer: '',
  explanation: '',
});

const createInitialQuizForm = () => ({
  title: '',
  type: 'post_assessment',
  reveal_after_submit: false,
  questions: [],
});
const optionLabel = (idx) => String.fromCharCode(65 + idx);
const AssessmentAnalyticsCharts = lazy(() => import('../components/AssessmentAnalyticsCharts'));

const filenameWithoutExt = (filename = '') => filename.replace(/\.[^/.]+$/, '') || filename;
const getResourceExt = (resource) => {
  const explicitExt = (resource?.file_ext || '').toLowerCase();
  if (explicitExt) {
    return explicitExt.startsWith('.') ? explicitExt.slice(1) : explicitExt;
  }
  const ref = (resource?.url || resource?.name || '').split('?')[0].toLowerCase();
  const seg = ref.split('.');
  return seg.length > 1 ? seg[seg.length - 1] : '';
};
const getResourceMimeType = (resource) => (resource?.mime_type || '').toLowerCase();

const getResourceHref = (url) => {
  if (!url) return '#';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${API_HOST}${url}`;
  return url;
};
const getResourceContentHref = (resource, preferred = 'download') => {
  if (!resource) return '#';
  if (resource.type === 'link') return getResourceHref(resource.url);
  const apiUrl = preferred === 'preview'
    ? resource.preview_url || resource.download_url
    : resource.download_url || resource.preview_url;
  return apiUrl ? `${API_HOST}${apiUrl}` : getResourceHref(resource.url);
};
const openResourceInPlace = (href) => {
  if (!href || href === '#') return;
  window.location.assign(href);
};
const triggerDownload = async (resource, href) => {
  if (!href || href === '#') return;
  const response = await fetch(href);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = resource?.download_name || resource?.name || 'resource';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
};

const escapeHtml = (text = '') => String(text)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const renderInlineMarkdown = (text = '') => {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-[#f3ede2] text-[#4a3d2d]">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-[#6b5234] underline">$1</a>');
  return out;
};

const markdownToHtml = (markdown = '') => {
  const lines = String(markdown || '').split('\n');
  const parts = [];
  let listType = null;

  const closeList = () => {
    if (listType) {
      parts.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trim = line.trim();
    if (!trim) {
      closeList();
      parts.push('<div class="h-2"></div>');
      continue;
    }
    const h = trim.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      const cls = level === 1 ? 'text-2xl font-bold mt-3 mb-2' : level === 2 ? 'text-xl font-semibold mt-3 mb-2' : 'text-lg font-semibold mt-2 mb-1';
      parts.push(`<h${level} class="${cls}">${renderInlineMarkdown(h[2])}</h${level}>`);
      continue;
    }
    const ul = trim.match(/^[-*]\s+(.+)$/);
    if (ul) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        parts.push('<ul class="list-disc pl-5 space-y-1">');
      }
      parts.push(`<li>${renderInlineMarkdown(ul[1])}</li>`);
      continue;
    }
    const ol = trim.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        parts.push('<ol class="list-decimal pl-5 space-y-1">');
      }
      parts.push(`<li>${renderInlineMarkdown(ol[1])}</li>`);
      continue;
    }
    const quote = trim.match(/^>\s?(.+)$/);
    if (quote) {
      closeList();
      parts.push(`<blockquote class="border-l-4 border-[#d8c7ae] pl-3 text-[#6b6358] my-1">${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    closeList();
    parts.push(`<p class="leading-7">${renderInlineMarkdown(trim)}</p>`);
  }

  closeList();
  return parts.join('');
};

const canInlinePreview = (ext) => ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'txt', 'md', 'csv', 'json'].includes(ext);

const isOfficeDoc = (ext) => ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
const canPreviewResource = (resource) => {
  if (!resource) return false;
  if (resource.type === 'link') return false;
  const ext = getResourceExt(resource);
  const mimeType = getResourceMimeType(resource);
  const localPreviewable = canInlinePreview(ext) || isOfficeDoc(ext) || mimeType === 'application/json';
  if (typeof resource.can_preview === 'boolean') return resource.can_preview || localPreviewable;
  return localPreviewable;
};

const ResourcePreviewModal = ({ resource, onClose }) => {
  const [textContent, setTextContent] = useState('');
  const [textLoading, setTextLoading] = useState(false);
  const safeResource = resource || {};
  const ext = getResourceExt(safeResource);
  const href = safeResource.type === 'link' ? getResourceHref(safeResource.url) : `${API_HOST}${safeResource.preview_url || safeResource.download_url || safeResource.url}`;
  const mimeType = getResourceMimeType(safeResource);
  const isImage = mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext);
  const isPdf = mimeType === 'application/pdf' || ext === 'pdf';
  const isText = mimeType.startsWith('text/') || ['txt', 'md', 'csv', 'json'].includes(ext);
  const officeViewUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(href)}`;

  useEffect(() => {
    const loadText = async () => {
      if (!isText) return;
      setTextLoading(true);
      try {
        const res = await axios.get(href);
        setTextContent(typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2));
      } catch (e) {
        setTextContent('Preview failed. Please download and open locally.');
      } finally {
        setTextLoading(false);
      }
    };
    loadText();
  }, [href, isText]);

  if (!resource) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[#fffdf8] rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col border border-[#e8dece]">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold text-gray-800">{resource.name}</div>
          <button type="button" onClick={onClose} className="px-3 py-1 text-sm rounded border">Close</button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {isPdf && <iframe title={resource.name} src={href} className="w-full h-full min-h-[60vh] border" />}
          {isImage && <img src={href} alt={resource.name} className="max-w-full h-auto mx-auto" />}
          {isText && (
            <pre className="whitespace-pre-wrap text-sm bg-gray-50 border rounded p-3">
              {textLoading ? 'Loading...' : textContent}
            </pre>
          )}
          {isOfficeDoc(ext) && (
            <div className="space-y-3">
              <iframe title={`${resource.name}-office`} src={officeViewUrl} className="w-full h-[70vh] border" />
              <p className="text-xs text-gray-500">If preview is blank, this file may not be publicly reachable by Office Online.</p>
            </div>
          )}
          {!canInlinePreview(ext) && !isOfficeDoc(ext) && (
            <div className="text-gray-600">
              Preview not supported for this type.
              <button type="button" onClick={() => openResourceInPlace(href)} className="text-indigo-600 ml-1">Open/Download</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CourseList = ({ onSelectCourse, onManageStudents, onViewResources }) => {
  const [courses, setCourses] = useState([]);
  const [pendingAssessments, setPendingAssessments] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [teachers, setTeachers] = useState([]);
  const [showTeacherAssignModal, setShowTeacherAssignModal] = useState(false);
  const [assigningCourse, setAssigningCourse] = useState(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [newCourse, setNewCourse] = useState({ name: '', objectives: '' });
  const [joinCourseCode, setJoinCourseCode] = useState('');
  const role = localStorage.getItem('role');

  const fetchCourses = async () => {
    try {
      const res = await axios.get(`${API_BASE}/teaching/courses`, { headers: authHeaders() });
      setCourses(res.data.data || []);
    } catch (err) {
      alert('获取课程失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  const fetchPendingAssessments = async () => {
    if (role !== 'student') return;
    try {
      const res = await axios.get(`${API_BASE}/teaching/students/pending-assessments`, { headers: authHeaders() });
      setPendingAssessments(res.data.data || []);
    } catch (_err) {
      setPendingAssessments([]);
    }
  };

  const fetchTeachers = async () => {
    if (!['admin', 'teacher'].includes(role)) return;
    try {
      const res = await axios.get(`${API_BASE}/teaching/search-teachers`, { headers: authHeaders() });
      setTeachers(res.data.data || []);
    } catch (_err) {
      setTeachers([]);
    }
  };

  useEffect(() => { fetchCourses(); fetchPendingAssessments(); fetchTeachers(); }, []);

  const handleCreateCourse = async () => {
    try {
      const payload = { ...newCourse };
      if (role === 'admin' && selectedTeacherId) {
        payload.teacher_id = Number(selectedTeacherId);
      }
      await axios.post(`${API_BASE}/teaching/courses`, payload, { headers: authHeaders() });
      setShowCreateModal(false);
      setNewCourse({ name: '', objectives: '' });
      if (role === 'admin') {
        setSelectedTeacherId('');
      }
      await fetchCourses();
    } catch (err) {
      alert('创建课程失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  const handleJoinCourse = async () => {
    if (!joinCourseCode.trim()) return;
    try {
      await axios.post(`${API_BASE}/teaching/courses/join`, { course_code: joinCourseCode.trim() }, { headers: authHeaders() });
      setShowJoinModal(false);
      setJoinCourseCode('');
      await fetchCourses();
      alert('加入课程成功');
    } catch (err) {
      alert('加入课程失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  const handleDeleteCourse = async (course) => {
    if (!window.confirm(`确定删除课程“${course.name}”吗？`)) return;
    if (!window.confirm('请再次确认，删除后不可恢复。')) return;
    try {
      await axios.delete(`${API_BASE}/teaching/courses/${course.id}`, { headers: authHeaders() });
      await fetchCourses();
      alert('课程已删除');
    } catch (err) {
      alert('删除课程失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  const openAssignTeacher = (course) => {
    setAssigningCourse(course);
    setSelectedTeacherId(course.teacher_id ? String(course.teacher_id) : '');
    setShowTeacherAssignModal(true);
  };

  const handleAssignTeacher = async () => {
    if (!assigningCourse || !selectedTeacherId) {
      alert('请选择老师');
      return;
    }
    try {
      await axios.put(`${API_BASE}/teaching/courses/${assigningCourse.id}/teacher`, {
        teacher_id: Number(selectedTeacherId),
      }, { headers: authHeaders() });
      setShowTeacherAssignModal(false);
      setAssigningCourse(null);
      await fetchCourses();
      alert('课程老师分配成功');
    } catch (err) {
      alert('分配老师失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  return (
    <div className="space-y-6">
      {role === 'student' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="font-semibold text-amber-800">待完成小测消息</div>
          {pendingAssessments.length === 0 ? (
            <div className="text-sm text-amber-700 mt-1">当前没有待完成的小测。</div>
          ) : (
            <div className="mt-2 space-y-1 text-sm text-amber-900">
              {pendingAssessments.slice(0, 6).map((item) => (
                <div key={`pending_${item.assessment_id}`}>
                  {item.course_name} / {item.chapter_title}：{item.title}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">课程管理</h2>
        {role === 'student' ? (
          <button type="button" onClick={() => setShowJoinModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            <Plus size={18} /> 加入课程
          </button>
        ) : (
          <button type="button" onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            <Plus size={18} /> 创建课程
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses.map((course) => (
          <div key={course.id} className="surface-card p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg"><BookOpen size={22} /></div>
              <div className="flex gap-3 items-center flex-wrap justify-end">
                <button type="button" onClick={() => onSelectCourse(course)} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                  {role === 'student' ? '进入练习' : '管理章节'}
                </button>
                {(role === 'teacher' || role === 'admin') && course.can_manage && (
                  <button type="button" onClick={() => onManageStudents(course)} className="text-green-600 hover:text-green-800 text-sm font-medium flex items-center gap-1">
                    <Users size={14} /> 学生
                  </button>
                )}
                {(role === 'teacher' || role === 'admin') && course.can_manage && (
                  <button type="button" onClick={() => openAssignTeacher(course)} className="text-amber-600 hover:text-amber-800 text-sm font-medium">
                    分配老师
                  </button>
                )}
                {(role === 'teacher' || role === 'admin') && (
                  <button type="button" onClick={() => onViewResources(course)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">课程资源</button>
                )}
                {(role === 'teacher' || role === 'admin') && (
                  <button type="button" onClick={() => handleDeleteCourse(course)} className="text-red-600 hover:text-red-800 text-sm font-medium flex items-center gap-1">
                    <Trash2 size={14} /> 删除
                  </button>
                )}
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{course.name}</h3>
            <p className="text-sm text-gray-500 mb-2 font-mono">课程代码: {course.code || '-'}</p>
            <p className="text-sm text-gray-600 mb-1">授课老师: {course.teacher_name || '-'}</p>
            <p className="text-gray-600 text-sm">{course.objectives || '暂无课程目标说明'}</p>
          </div>
        ))}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#fffdf8] p-8 rounded-xl w-full max-w-md shadow-2xl border border-[#e8dece]">
            <h3 className="text-xl font-bold mb-4">创建课程</h3>
            <div className="space-y-3">
              <input className="w-full p-2 border rounded-lg" placeholder="课程名称" value={newCourse.name} onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })} />
              <p className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded px-3 py-2">课程代码由系统自动分配，可用于学生查找和加入课程。</p>
              <textarea className="w-full p-2 border rounded-lg h-24" placeholder="课程目标" value={newCourse.objectives} onChange={(e) => setNewCourse({ ...newCourse, objectives: e.target.value })} />
              {role === 'admin' && (
                <select className="w-full p-2 border rounded-lg" value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)}>
                  <option value="">请选择授课老师</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={String(teacher.id)}>
                      {teacher.name || teacher.username} ({teacher.username})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-600">取消</button>
              <button type="button" onClick={handleCreateCourse} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">创建</button>
            </div>
          </div>
        </div>
      )}

      {showJoinModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#fffdf8] p-8 rounded-xl w-full max-w-md shadow-2xl border border-[#e8dece]">
            <h3 className="text-xl font-bold mb-4">加入课程</h3>
            <input className="w-full p-2 border rounded-lg" placeholder="请输入课程代码（如 CRS20260421001）" value={joinCourseCode} onChange={(e) => setJoinCourseCode(e.target.value.toUpperCase())} />
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setShowJoinModal(false)} className="px-4 py-2 text-gray-600">取消</button>
              <button type="button" onClick={handleJoinCourse} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">加入</button>
            </div>
          </div>
        </div>
      )}

      {showTeacherAssignModal && assigningCourse && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#fffdf8] p-8 rounded-xl w-full max-w-md shadow-2xl border border-[#e8dece]">
            <h3 className="text-xl font-bold mb-4">分配课程老师</h3>
            <p className="text-sm text-gray-600 mb-3">课程：{assigningCourse.name}</p>
            <select className="w-full p-2 border rounded-lg" value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)}>
              <option value="">请选择老师</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={String(teacher.id)}>
                  {teacher.name || teacher.username} ({teacher.username})
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => { setShowTeacherAssignModal(false); setAssigningCourse(null); }} className="px-4 py-2 text-gray-600">取消</button>
              <button type="button" onClick={handleAssignTeacher} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StudentManagement = ({ course, onBack }) => {
  const [students, setStudents] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchMajor, setSearchMajor] = useState('');
  const [searchClassName, setSearchClassName] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const fetchStudents = async () => {
    try {
      const res = await axios.get(`${API_BASE}/teaching/courses/${course.id}/students`, { headers: authHeaders() });
      setStudents(res.data.data || []);
    } catch (err) {
      alert('获取学生失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  const handleSearch = async (kw = searchKeyword) => {
    try {
      const params = new URLSearchParams({ keyword: kw || '' });
      if (searchMajor.trim()) params.set('major', searchMajor.trim());
      if (searchClassName.trim()) params.set('class_name', searchClassName.trim());
      const res = await axios.get(`${API_BASE}/teaching/search-students?${params.toString()}`, { headers: authHeaders() });
      setSearchResults(res.data.data || []);
    } catch (err) {
      alert('搜索失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  useEffect(() => { fetchStudents(); handleSearch(''); }, [course.id]);

  const handleAddStudent = async (studentId) => {
    try {
      await axios.post(`${API_BASE}/teaching/courses/${course.id}/students`, { student_id: studentId }, { headers: authHeaders() });
      await fetchStudents();
      alert('添加成功');
    } catch (err) {
      alert('添加失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  const handleRemoveStudent = async (studentId) => {
    if (!window.confirm('确定移除该学生吗？')) return;
    try {
      await axios.delete(`${API_BASE}/teaching/courses/${course.id}/students/${studentId}`, { headers: authHeaders() });
      await fetchStudents();
      alert('移除成功');
    } catch (err) {
      alert('移除失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-8">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={24} className="text-gray-600" /></button>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">{course.name} - 学生管理</h2>
          <p className="text-gray-500 text-sm">已加入学生: {students.length}</p>
        </div>
      </div>

      <div className="surface-card p-6 space-y-3">
        <h3 className="text-lg font-bold">添加学生</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input className="flex-1 p-2 border rounded-lg" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} placeholder="搜索学生用户名或姓名..." />
          <input className="p-2 border rounded-lg" value={searchMajor} onChange={(e) => setSearchMajor(e.target.value)} placeholder="按专业筛选（如 人工智能）" />
          <input className="p-2 border rounded-lg" value={searchClassName} onChange={(e) => setSearchClassName(e.target.value)} placeholder="按班级筛选（如 人工智能1班）" />
          <button type="button" onClick={() => handleSearch(searchKeyword)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg flex items-center gap-2 justify-center">
            <Search size={16} /> 搜索
          </button>
        </div>
        <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
          {searchResults.map((student) => (
            <div key={student.id} className="p-3 flex justify-between items-center border-b last:border-b-0">
              <span>{student.username} ({student.name || '未命名'}) | {student.major || '-'} / {student.class_name || '-'}</span>
              <button type="button" onClick={() => handleAddStudent(student.id)} className="px-3 py-1 bg-green-500 text-white rounded text-sm">添加</button>
            </div>
          ))}
        </div>
      </div>

      <div className="surface-card p-6">
        <h3 className="text-lg font-bold mb-4">学生名单</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.map((student) => (
            <div key={student.id} className="p-4 border rounded-lg flex justify-between items-center bg-indigo-50">
              <div>
                <div className="font-bold">{student.username}</div>
                <div className="text-sm text-gray-500">{student.name || '未命名'} | {student.major || '-'} / {student.class_name || '-'}</div>
              </div>
              <button type="button" onClick={() => handleRemoveStudent(student.id)} className="p-2 text-red-500 hover:bg-red-100 rounded" title="移除学生">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const LessonPlanList = ({ course, onBack, onSelectPlan }) => {
  const [plans, setPlans] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const role = localStorage.getItem('role');

  const fetchPlans = async () => {
    try {
      const res = await axios.get(`${API_BASE}/teaching/courses/${course.id}/chapters`, { headers: authHeaders() });
      setPlans(res.data.data || []);
    } catch (err) {
      alert('获取章节失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  useEffect(() => { fetchPlans(); }, [course.id]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      await axios.post(`${API_BASE}/teaching/chapters`, { course_id: course.id, title: newTitle.trim() }, { headers: authHeaders() });
      setShowCreateModal(false);
      setNewTitle('');
      await fetchPlans();
    } catch (err) {
      alert('创建章节失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  const handleDeletePlan = async (plan) => {
    if (!window.confirm(`确定删除章节“${plan.title}”吗？`)) return;
    if (!window.confirm('章节下的教案内容、章节资源、章节测验和提交记录都会被删除，且不可恢复。')) return;
    try {
      await axios.delete(`${API_BASE}/teaching/chapters/${plan.id}`, { headers: authHeaders() });
      await fetchPlans();
      alert('章节已删除');
    } catch (err) {
      alert('删除章节失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-8">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={24} className="text-gray-600" /></button>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">{course.name} {role === 'student' ? '- 课程练习' : '- 章节管理'}</h2>
          <p className="text-gray-500 text-sm">课程代码: {course.code}</p>
        </div>
      </div>

      <div className="flex justify-between items-center bg-indigo-50 p-4 rounded-xl border border-indigo-100">
        <div className="flex items-center gap-2 text-indigo-700 font-medium"><FileEdit size={20} /> 共 {plans.length} 个{role === 'student' ? '练习' : '章节'}</div>
        {role !== 'student' && (
          <button type="button" onClick={() => setShowCreateModal(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2">
            <Plus size={16} /> 新建章节
          </button>
        )}
      </div>

      <div className="space-y-4">
        {plans.map((plan) => (
          <div key={plan.id} className="flex justify-between items-center p-5 bg-[#fffdf8] border border-[#e8dece] rounded-xl">
            <div>
              <h3 className="text-lg font-bold text-gray-800">{plan.title}</h3>
              <p className="text-xs text-gray-400 mt-1">创建时间: {plan.created_at}</p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => onSelectPlan(plan.id)} className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm">
                {role === 'student' ? '查看练习' : '编辑章节'}
              </button>
              {role !== 'student' && (
                <button
                  type="button"
                  onClick={() => handleDeletePlan(plan)}
                  className="px-4 py-2 bg-red-50 text-red-700 rounded-lg text-sm"
                >
                  删除章节
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#fffdf8] p-8 rounded-xl w-full max-w-md shadow-2xl border border-[#e8dece]">
            <h3 className="text-xl font-bold mb-4">新建章节</h3>
            <input className="w-full p-2 border rounded-lg" placeholder="请输入章节标题" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-600">取消</button>
              <button type="button" onClick={handleCreate} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StudentCourseAssessments = ({ course, onBack }) => {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [takingAssessment, setTakingAssessment] = useState(null);
  const [takingAnswers, setTakingAnswers] = useState({});
  const [submittingAssessment, setSubmittingAssessment] = useState(false);
  const [myResult, setMyResult] = useState(null);
  const [loadingResult, setLoadingResult] = useState(false);

  const loadAssessments = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/teaching/courses/${course.id}/student-assessments`, { headers: authHeaders() });
      setAssessments(res.data.data || []);
    } catch (err) {
      alert('加载课程测验失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setLoading(false);
    }
  };

  const loadMyResult = async (assessmentId) => {
    setLoadingResult(true);
    try {
      const res = await axios.get(`${API_BASE}/teaching/assessments/${assessmentId}/my-result`, { headers: authHeaders() });
      setMyResult(res.data.data || null);
    } catch (err) {
      setMyResult(null);
      if (err.response?.status !== 404) {
        alert('加载成绩失败: ' + (err.response?.data?.msg || err.message));
      }
    } finally {
      setLoadingResult(false);
    }
  };

  useEffect(() => { loadAssessments(); }, [course.id]);

  const handleStartAssessment = async (assessmentId) => {
    try {
      const res = await axios.get(`${API_BASE}/teaching/assessments/${assessmentId}`, { headers: authHeaders() });
      const detail = res.data.data || {};
      setTakingAssessment(detail);
      setTakingAnswers({});
      await loadMyResult(assessmentId);
    } catch (err) {
      alert('加载测验失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  const handleSubmitAssessment = async () => {
    if (!takingAssessment) return;
    const requiredQuestionIds = (takingAssessment.questions || []).map((q) => String(q.id));
    const missing = requiredQuestionIds.find((qid) => !takingAnswers[qid]);
    if (missing) {
      alert('请先完成所有题目再提交');
      return;
    }
    setSubmittingAssessment(true);
    try {
      await axios.post(`${API_BASE}/teaching/assessments/${takingAssessment.id}/submit`, { answers: takingAnswers }, { headers: authHeaders() });
      await loadAssessments();
      await loadMyResult(takingAssessment.id);
      alert('提交成功');
    } catch (err) {
      alert('提交失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setSubmittingAssessment(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 mb-6">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={24} className="text-gray-600" /></button>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">{course.name} - 小测中心</h2>
          <p className="text-gray-500 text-sm">仅展示老师已推送的测验</p>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">加载中...</div>
      ) : assessments.length === 0 ? (
        <div className="text-sm text-gray-500 border border-dashed rounded-lg p-4">当前课程还没有可作答的小测。</div>
      ) : (
        <div className="space-y-3">
          {assessments.map((item) => (
            <div key={item.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-gray-900">{item.title}</div>
                <div className="text-xs text-gray-500 mt-1">章节: {item.chapter_title || '-'} | 类型: {item.type} | 题数: {item.question_count}</div>
                {item.my_submission && (
                  <div className="text-xs text-green-700 mt-1">当前有效成绩: {Number(item.my_submission.score || 0).toFixed(2)}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => handleStartAssessment(item.id)} disabled={!!item.has_active_submission} className="px-3 py-2 rounded border text-sm disabled:opacity-50">
                  {item.has_active_submission ? '已提交' : '开始作答'}
                </button>
                <button type="button" onClick={() => loadMyResult(item.id)} className="px-3 py-2 rounded border text-sm">查看成绩</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {takingAssessment && (
        <div className="border rounded-lg p-3 space-y-3">
          <div className="font-semibold text-gray-800">正在作答: {takingAssessment.title}</div>
          {(takingAssessment.questions || []).map((q, qIndex) => (
            <div key={q.id} className="border rounded p-3">
              <div className="font-medium text-gray-800 mb-2">{qIndex + 1}. {q.content}</div>
              <div className="space-y-2">
                {(q.options || []).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm">
                    <input type="radio" name={`q_${q.id}`} checked={takingAnswers[String(q.id)] === opt} onChange={() => setTakingAnswers((prev) => ({ ...prev, [String(q.id)]: opt }))} />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button type="button" onClick={handleSubmitAssessment} disabled={submittingAssessment} className="px-4 py-2 rounded bg-green-600 text-white disabled:opacity-60">
            {submittingAssessment ? '提交中...' : '提交测验'}
          </button>
        </div>
      )}

      <div className="border rounded-lg p-3">
        <div className="font-semibold text-gray-800 mb-2">成绩与明细</div>
        {loadingResult ? (
          <div className="text-sm text-gray-500">加载中...</div>
        ) : !myResult ? (
          <div className="text-sm text-gray-500">请选择测验并提交后查看。</div>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="text-gray-800">测验: {myResult.title}</div>
            <div className="text-gray-800">总分: {Number(myResult.score || 0).toFixed(2)}</div>
            {!myResult.reveal_after_submit ? (
              <div className="text-gray-500">{myResult.message || '教师未开放明细查看'}</div>
            ) : (
              <div className="space-y-2">
                {(myResult.question_results || []).map((qr, idx) => (
                  <div key={qr.question_id} className="border rounded p-3">
                    <div className="font-medium text-gray-800">{idx + 1}. {qr.content}</div>
                    <div className="text-gray-700 mt-1">我的答案: {qr.my_answer || '-'}</div>
                    <div className="text-gray-700">标准答案: {qr.correct_answer || '-'}</div>
                    <div className={qr.is_correct ? 'text-green-700' : 'text-red-700'}>
                      结果: {qr.is_correct ? '正确' : '错误'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const LessonPlanDetail = ({ planId, onBack }) => {
  const [planInfo, setPlanInfo] = useState(null);
  const [stages, setStages] = useState({});
  const [activeStage, setActiveStage] = useState('bridge_in');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [genConfig, setGenConfig] = useState({ focus_points: '', rag_snippets: '' });
  const [courseResources, setCourseResources] = useState([]);
  const [chapterResources, setChapterResources] = useState([]);
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);
  const [resourceSelection, setResourceSelection] = useState(new Set());
  const [kbResourceSelection, setKbResourceSelection] = useState(new Set());
  const [quickFile, setQuickFile] = useState(null);
  const [uploadingResource, setUploadingResource] = useState(false);
  const [previewResource, setPreviewResource] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [assessmentDetailAnalytics, setAssessmentDetailAnalytics] = useState(null);
  const [loadingDetailAnalytics, setLoadingDetailAnalytics] = useState(false);
  const [aiAnalytics, setAiAnalytics] = useState(null);
  const [loadingAiAnalytics, setLoadingAiAnalytics] = useState(false);
  const [aiAnalyticsHistory, setAiAnalyticsHistory] = useState([]);
  const [aiHistoryOpen, setAiHistoryOpen] = useState(false);
  const [focusStudentIds, setFocusStudentIds] = useState(new Set());
  const [focusQuestionIds, setFocusQuestionIds] = useState(new Set());
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [quizForm, setQuizForm] = useState(createInitialQuizForm());
  const [creatingQuiz, setCreatingQuiz] = useState(false);
  const [editingAssessmentId, setEditingAssessmentId] = useState(null);
  const [pushingAssessmentId, setPushingAssessmentId] = useState(null);
  const [questionBank, setQuestionBank] = useState([]);
  const [selectedBankIds, setSelectedBankIds] = useState(new Set());
  const [loadingQuestionBank, setLoadingQuestionBank] = useState(false);
  const [bankKeyword, setBankKeyword] = useState('');
  const [bankTagFilter, setBankTagFilter] = useState('');
  const [bankDifficultyFilter, setBankDifficultyFilter] = useState('');
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [aiQuestionConfig, setAiQuestionConfig] = useState({ count: 5, difficulty: 3, tags: '' });
  const [aiGeneratedQuestions, setAiGeneratedQuestions] = useState([]);
  const [selectedGeneratedIndexes, setSelectedGeneratedIndexes] = useState(new Set());
  const [savingGeneratedToBank, setSavingGeneratedToBank] = useState(false);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [submissionKeyword, setSubmissionKeyword] = useState('');
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState('');
  const [submissionClassFilter, setSubmissionClassFilter] = useState('');
  const [submissionMajorFilter, setSubmissionMajorFilter] = useState('');
  const [submissionSortBy, setSubmissionSortBy] = useState('submitted_at');
  const [submissionSortOrder, setSubmissionSortOrder] = useState('desc');
  const [submissionPage, setSubmissionPage] = useState(1);
  const [rejectingSubmissionId, setRejectingSubmissionId] = useState(null);
  const [takingAssessment, setTakingAssessment] = useState(null);
  const [takingAnswers, setTakingAnswers] = useState({});
  const [submittingAssessment, setSubmittingAssessment] = useState(false);
  const [myResult, setMyResult] = useState(null);
  const [loadingResult, setLoadingResult] = useState(false);
  const role = localStorage.getItem('role');
  const preAssessments = assessments.filter((item) => item.type === 'pre_assessment');
  const postAssessments = assessments.filter((item) => item.type === 'post_assessment');
  const selectedAssessment = assessments.find((item) => Number(item.id) === Number(selectedAssessmentId));
  const stageLinkedAssessments = activeStage === 'pre_assessment' ? preAssessments : (activeStage === 'post_assessment' ? postAssessments : []);
  const stageDoneMap = stageOrder.reduce((acc, stage) => {
    acc[stage] = Boolean((stages?.[stage] || '').trim());
    return acc;
  }, {});
  const activeStageIndex = stageOrder.indexOf(activeStage);
  const missingPrevStages = stageOrder
    .slice(0, Math.max(0, activeStageIndex))
    .filter((stage) => !stageDoneMap[stage])
    .map((stage) => stageHintTitle[stage] || stage);
  const nextRecommendedStage = stageOrder.find((stage) => !stageDoneMap[stage]);
  const currentStageContent = stages[activeStage] || '';
  const currentStageHtml = markdownToHtml(currentStageContent);
  const submissionClassOptions = Array.from(new Set((submissions || []).map((s) => s.student_class_name).filter(Boolean)));
  const submissionMajorOptions = Array.from(new Set((submissions || []).map((s) => s.student_major).filter(Boolean)));
  const filteredSortedSubmissions = (submissions || [])
    .filter((sub) => {
      const kw = submissionKeyword.trim().toLowerCase();
      const matchedKw = !kw || `${sub.student_name || ''} ${sub.student_username || ''}`.toLowerCase().includes(kw);
      const matchedStatus = !submissionStatusFilter || sub.status === submissionStatusFilter;
      const matchedClass = !submissionClassFilter || sub.student_class_name === submissionClassFilter;
      const matchedMajor = !submissionMajorFilter || sub.student_major === submissionMajorFilter;
      return matchedKw && matchedStatus && matchedClass && matchedMajor;
    })
    .sort((a, b) => {
      let va;
      let vb;
      if (submissionSortBy === 'score') {
        va = Number(a.score || 0);
        vb = Number(b.score || 0);
      } else if (submissionSortBy === 'student_name') {
        va = String(a.student_name || a.student_username || '');
        vb = String(b.student_name || b.student_username || '');
      } else {
        va = String(a.submitted_at || '');
        vb = String(b.submitted_at || '');
      }
      if (va < vb) return submissionSortOrder === 'asc' ? -1 : 1;
      if (va > vb) return submissionSortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  const submissionPageSize = 10;
  const submissionTotalPages = Math.max(1, Math.ceil(filteredSortedSubmissions.length / submissionPageSize));
  const safeSubmissionPage = Math.min(submissionPage, submissionTotalPages);
  const pagedSubmissions = filteredSortedSubmissions.slice(
    (safeSubmissionPage - 1) * submissionPageSize,
    safeSubmissionPage * submissionPageSize
  );

  const loadResources = async (courseId) => {
    const resourceRes = await axios.get(`${API_BASE}/teaching/courses/${courseId}/resources`, { headers: authHeaders() });
    const all = resourceRes.data.data || [];
    const linked = all.filter((item) => item.chapter_id === planId);
    setCourseResources(all);
    setChapterResources(linked);
    setResourceSelection(new Set(linked.map((item) => item.id)));
    if (kbResourceSelection.size === 0) {
      setKbResourceSelection(new Set(linked.map((item) => item.id)));
    }
  };

  const loadAssessments = async () => {
    const res = await axios.get(`${API_BASE}/teaching/chapters/${planId}/assessments`, { headers: authHeaders() });
    const list = res.data.data || [];
    setAssessments(list);
    if (!selectedAssessmentId && role !== 'student' && list.length > 0) {
      setSelectedAssessmentId(list[0].id);
    }
  };

  const loadAnalytics = async () => {
    const res = await axios.get(`${API_BASE}/teaching/chapters/${planId}/analytics/basic`, { headers: authHeaders() });
    setAnalytics(res.data.data || []);
  };

  const loadQuestionBank = async () => {
    if (!planInfo?.course_id) return;
    setLoadingQuestionBank(true);
    try {
      const params = new URLSearchParams({
        course_id: String(planInfo.course_id),
        chapter_id: String(planId),
      });
      const res = await axios.get(`${API_BASE}/teaching/question-bank?${params.toString()}`, { headers: authHeaders() });
      setQuestionBank(res.data.data || []);
    } catch (err) {
      alert('加载题库失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setLoadingQuestionBank(false);
    }
  };

  const loadMyResult = async (assessmentId) => {
    setLoadingResult(true);
    try {
      const res = await axios.get(`${API_BASE}/teaching/assessments/${assessmentId}/my-result`, { headers: authHeaders() });
      setMyResult(res.data.data || null);
    } catch (err) {
      setMyResult(null);
      if (err.response?.status !== 404) {
        alert('加载成绩失败: ' + (err.response?.data?.msg || err.message));
      }
    } finally {
      setLoadingResult(false);
    }
  };

  const loadAssessmentSubmissions = async (assessmentId) => {
    if (!assessmentId) {
      setSubmissions([]);
      return;
    }
    setLoadingSubmissions(true);
    try {
      const res = await axios.get(`${API_BASE}/teaching/assessments/${assessmentId}/submissions`, { headers: authHeaders() });
      setSubmissions(res.data.data || []);
    } catch (err) {
      alert('加载提交记录失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const loadAssessmentDetailAnalytics = async (assessmentId) => {
    if (!assessmentId) {
      setAssessmentDetailAnalytics(null);
      return;
    }
    setLoadingDetailAnalytics(true);
    try {
      const res = await axios.get(`${API_BASE}/teaching/assessments/${assessmentId}/analytics/detail`, { headers: authHeaders() });
      setAssessmentDetailAnalytics(res.data.data || null);
    } catch (err) {
      setAssessmentDetailAnalytics(null);
      alert('加载详细分析失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setLoadingDetailAnalytics(false);
    }
  };

  const loadAssessmentAiAnalytics = async (assessmentId) => {
    if (!assessmentId) {
      setAiAnalytics(null);
      return;
    }
    setLoadingAiAnalytics(true);
    try {
      const params = new URLSearchParams();
      if (focusStudentIds.size > 0) {
        params.set('focus_student_ids', Array.from(focusStudentIds).join(','));
      }
      if (focusQuestionIds.size > 0) {
        params.set('focus_question_ids', Array.from(focusQuestionIds).join(','));
      }
      const url = `${API_BASE}/teaching/assessments/${assessmentId}/analytics/ai${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await axios.get(url, { headers: authHeaders() });
      const payload = res.data.data || null;
      setAiAnalytics(payload);
      if (payload) {
        setAiAnalyticsHistory((prev) => [{
          id: `${Date.now()}`,
          created_at: new Date().toLocaleString(),
          payload,
        }, ...prev].slice(0, 8));
      }
    } catch (err) {
      alert('加载 AI 分析失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setLoadingAiAnalytics(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const infoRes = await axios.get(`${API_BASE}/teaching/chapters/${planId}`, { headers: authHeaders() });
        const stagesRes = await axios.get(`${API_BASE}/teaching/chapters/${planId}/stages`, { headers: authHeaders() });
        setPlanInfo(infoRes.data.data);
        setStages(stagesRes.data.data || {});
        await loadResources(infoRes.data.data.course_id);
        await loadAssessments();
        await loadAnalytics();
        await loadQuestionBank();
      } catch (err) {
        alert('加载章节失败: ' + (err.response?.data?.msg || err.message));
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [planId]);

  const handleSaveStage = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_BASE}/teaching/chapters/${planId}/stages/${activeStage}`, { content: stages[activeStage] }, { headers: authHeaders() });
      alert('保存成功');
    } catch (err) {
      alert('保存失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    try {
      setStages((prev) => ({ ...prev, [activeStage]: '正在生成中...' }));
      const res = await axios.post(`${API_BASE}/teaching/chapters/${planId}/generate-custom`, {
        ...genConfig,
        stage: activeStage,
        selected_resource_ids: Array.from(kbResourceSelection),
      }, { headers: authHeaders() });
      let content = res.data.data.content;
      if (typeof content === 'object') content = JSON.stringify(content, null, 2);
      setStages((prev) => ({ ...prev, [activeStage]: content }));
      alert('AI 生成完成');
    } catch (err) {
      alert('AI 生成失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  const saveBinding = async (ids) => {
    await axios.put(`${API_BASE}/teaching/chapters/${planId}/resources`, { resource_ids: Array.from(ids) }, { headers: authHeaders() });
    if (planInfo?.course_id) {
      await loadResources(planInfo.course_id);
    }
  };

  const toggleResource = (resourceId) => {
    setResourceSelection((prev) => {
      const next = new Set(prev);
      if (next.has(resourceId)) next.delete(resourceId);
      else next.add(resourceId);
      return next;
    });
  };

  const toggleKbResource = (resourceId) => {
    setKbResourceSelection((prev) => {
      const next = new Set(prev);
      if (next.has(resourceId)) next.delete(resourceId);
      else next.add(resourceId);
      return next;
    });
  };

  const handleSaveResourcePicker = async () => {
    try {
      await saveBinding(resourceSelection);
      setResourcePickerOpen(false);
      alert('章节资源关联已更新');
    } catch (err) {
      alert('保存资源关联失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  const handleUploadAndLink = async () => {
    if (!quickFile || !planInfo?.course_id) {
      alert('请选择文件');
      return;
    }
    setUploadingResource(true);
    try {
      const payload = new FormData();
      payload.append('name', filenameWithoutExt(quickFile.name));
      payload.append('type', 'file');
      payload.append('course_id', String(planInfo.course_id));
      payload.append('file', quickFile);
      const created = await axios.post(`${API_BASE}/teaching/resources`, payload, {
        headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
      });
      const newId = created.data?.data?.id;
      const next = new Set(resourceSelection);
      if (newId) next.add(newId);
      await saveBinding(next);
      setQuickFile(null);
      alert('已上传并关联到当前章节');
    } catch (err) {
      alert('上传并关联失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setUploadingResource(false);
    }
  };

  const resetQuizForm = () => {
    setQuizForm(createInitialQuizForm());
    setAiGeneratedQuestions([]);
    setSelectedGeneratedIndexes(new Set());
    setEditingAssessmentId(null);
  };

  const updateQuestion = (idx, patch) => {
    setQuizForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)),
    }));
  };

  const updateQuestionOption = (qIdx, optIdx, value) => {
    setQuizForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => {
        if (i !== qIdx) return q;
        const nextOptions = q.options.map((opt, idx) => (idx === optIdx ? value : opt));
        return { ...q, options: nextOptions };
      }),
    }));
  };

  const addQuestion = () => {
    setQuizForm((prev) => ({ ...prev, questions: [...prev.questions, createEmptyQuestion()] }));
  };

  const removeQuestion = (idx) => {
    setQuizForm((prev) => ({ ...prev, questions: prev.questions.filter((_, i) => i !== idx) }));
  };

  const addOption = (qIdx) => {
    setQuizForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => (i === qIdx ? { ...q, options: [...q.options, ''] } : q)),
    }));
  };

  const handleCreateQuiz = async () => {
    const title = quizForm.title.trim();
    if (!title) {
      alert('请输入测验标题');
      return;
    }
    const questions = quizForm.questions.map((q) => ({
      content: q.content.trim(),
      q_type: 'choice',
      options: q.options.map((opt) => opt.trim()).filter(Boolean),
      answer: q.answer.trim(),
      explanation: (q.explanation || '').trim(),
    }));
    const manualQuestions = questions.filter((q) => q.content || q.options.length || q.answer);
    if (manualQuestions.some((q) => !q.content || q.options.length < 2 || !q.answer || !q.options.includes(q.answer))) {
      alert('请检查题目：题干不能为空，至少两个选项，标准答案必须是其中一个选项');
      return;
    }
    if (manualQuestions.length === 0 && selectedBankIds.size === 0) {
      alert('请至少添加一道题目或从题库勾选导入');
      return;
    }

    setCreatingQuiz(true);
    try {
      const payload = {
        chapter_id: planId,
        title,
        type: quizForm.type,
        reveal_after_submit: quizForm.reveal_after_submit,
        questions: manualQuestions,
        question_bank_ids: Array.from(selectedBankIds),
      };
      if (editingAssessmentId) {
        await axios.put(`${API_BASE}/teaching/assessments/${editingAssessmentId}`, payload, { headers: authHeaders() });
      } else {
        await axios.post(`${API_BASE}/teaching/assessments`, payload, { headers: authHeaders() });
      }
      setQuizModalOpen(false);
      resetQuizForm();
      setSelectedBankIds(new Set());
      await loadAssessments();
      await loadAnalytics();
      alert(editingAssessmentId ? '测验更新成功' : '测验创建成功');
    } catch (err) {
      alert((editingAssessmentId ? '更新测验失败: ' : '创建测验失败: ') + (err.response?.data?.msg || err.message));
    } finally {
      setCreatingQuiz(false);
    }
  };

  const toggleBankQuestion = (id) => {
    setSelectedBankIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const importBankQuestionToDraft = () => {
    if (selectedBankIds.size === 0) return;
    const selectedQuestions = questionBank.filter((item) => selectedBankIds.has(item.id));
    setQuizForm((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        ...selectedQuestions.map((item) => ({
          content: item.stem,
          options: item.options || ['', ''],
          answer: item.answer || '',
          explanation: item.explanation || '',
        })),
      ],
    }));
    alert(`已导入 ${selectedQuestions.length} 道题到草稿`);
  };

  const availableTags = Array.from(new Set(questionBank.flatMap((item) => item.tags || []))).filter(Boolean);
  const filteredQuestionBank = questionBank.filter((item) => {
    const keyword = bankKeyword.trim().toLowerCase();
    const keywordMatched = !keyword || (item.stem || '').toLowerCase().includes(keyword);
    const tagMatched = !bankTagFilter || (item.tags || []).includes(bankTagFilter);
    const difficultyMatched = !bankDifficultyFilter || String(item.difficulty || '') === String(bankDifficultyFilter);
    return keywordMatched && tagMatched && difficultyMatched;
  });

  const toggleGeneratedQuestion = (idx) => {
    setSelectedGeneratedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const importSelectedGeneratedToDraft = () => {
    if (selectedGeneratedIndexes.size === 0) {
      alert('请先勾选要导入的 AI 题目');
      return;
    }
    const selected = aiGeneratedQuestions.filter((_, idx) => selectedGeneratedIndexes.has(idx));
    setQuizForm((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        ...selected.map((item) => ({
          content: item.stem,
          options: item.options || ['', ''],
          answer: item.answer || '',
          explanation: item.explanation || '',
        })),
      ],
    }));
    alert(`已导入 ${selected.length} 道 AI 题目到草稿`);
  };

  const saveSelectedGeneratedToBank = async () => {
    if (selectedGeneratedIndexes.size === 0) {
      alert('请先勾选要保存到题库的 AI 题目');
      return;
    }
    if (!planInfo?.course_id) return;
    const selected = aiGeneratedQuestions.filter((_, idx) => selectedGeneratedIndexes.has(idx));
    setSavingGeneratedToBank(true);
    try {
      for (const item of selected) {
        await axios.post(`${API_BASE}/teaching/question-bank`, {
          course_id: planInfo.course_id,
          chapter_id: planId,
          source: 'ai',
          stem: item.stem,
          options: item.options,
          answer: item.answer,
          explanation: item.explanation || '',
          difficulty: item.difficulty || Number(aiQuestionConfig.difficulty || 3),
          tags: item.tags || [],
        }, { headers: authHeaders() });
      }
      await loadQuestionBank();
      alert(`已保存 ${selected.length} 道题到题库`);
    } catch (err) {
      alert('保存到题库失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setSavingGeneratedToBank(false);
    }
  };

  const handleGenerateAIQuestions = async () => {
    if (!planInfo?.course_id) return;
    const count = Number(aiQuestionConfig.count || 5);
    const difficulty = Number(aiQuestionConfig.difficulty || 3);
    const tags = aiQuestionConfig.tags.split(',').map((x) => x.trim()).filter(Boolean);
    setGeneratingQuestions(true);
    try {
      const res = await axios.post(`${API_BASE}/teaching/question-bank/generate`, {
        course_id: planInfo.course_id,
        chapter_id: planId,
        count,
        difficulty,
        tags,
        save_to_bank: false,
      }, { headers: authHeaders() });
      const generated = res.data?.data?.questions || [];
      setAiGeneratedQuestions(generated);
      setSelectedGeneratedIndexes(new Set(generated.map((_, idx) => idx)));
      alert(`AI 已生成 ${generated.length} 道题，请先预览并勾选`);
    } catch (err) {
      alert('AI 生成题目失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setGeneratingQuestions(false);
    }
  };

  const handleEditAssessment = async (assessmentId) => {
    try {
      const res = await axios.get(`${API_BASE}/teaching/assessments/${assessmentId}`, { headers: authHeaders() });
      const detail = res.data.data || {};
      setEditingAssessmentId(detail.id);
      setQuizForm({
        title: detail.title || '',
        type: detail.type || 'post_assessment',
        reveal_after_submit: !!detail.reveal_after_submit,
        questions: (detail.questions || []).map((q) => ({
          content: q.content || '',
          options: q.options || ['', ''],
          answer: q.answer || '',
          explanation: q.explanation || '',
        })),
      });
      setSelectedBankIds(new Set());
      setAiGeneratedQuestions([]);
      setSelectedGeneratedIndexes(new Set());
      setQuizModalOpen(true);
    } catch (err) {
      alert('加载测验失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  const handlePushAssessment = async (assessmentId) => {
    setPushingAssessmentId(assessmentId);
    try {
      await axios.patch(`${API_BASE}/teaching/assessments/${assessmentId}/push`, {}, { headers: authHeaders() });
      await loadAssessments();
      alert('测验已推送给学生');
    } catch (err) {
      alert('推送失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setPushingAssessmentId(null);
    }
  };

  const handleDeleteAssessment = async (assessment) => {
    if (!window.confirm(`确定删除测验“${assessment.title}”吗？`)) return;
    if (!window.confirm('该测验的题目、提交记录和分析数据都会删除，但已进入题库的题目会保留。')) return;
    try {
      await axios.delete(`${API_BASE}/teaching/assessments/${assessment.id}`, { headers: authHeaders() });
      if (Number(selectedAssessmentId) === Number(assessment.id)) {
        setSelectedAssessmentId(null);
      }
      await loadAssessments();
      await loadAnalytics();
      setAssessmentDetailAnalytics(null);
      setAiAnalytics(null);
      setAiAnalyticsHistory([]);
      setSubmissions([]);
      alert('测验已删除');
    } catch (err) {
      alert('删除测验失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  const handleStartAssessment = async (assessmentId) => {
    try {
      const res = await axios.get(`${API_BASE}/teaching/assessments/${assessmentId}`, { headers: authHeaders() });
      const detail = res.data.data || {};
      setTakingAssessment(detail);
      setTakingAnswers({});
      await loadMyResult(assessmentId);
    } catch (err) {
      alert('加载测验失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  const handleSubmitAssessment = async () => {
    if (!takingAssessment) return;
    const requiredQuestionIds = (takingAssessment.questions || []).map((q) => String(q.id));
    const missing = requiredQuestionIds.find((qid) => !takingAnswers[qid]);
    if (missing) {
      alert('请先完成所有题目再提交');
      return;
    }

    setSubmittingAssessment(true);
    try {
      await axios.post(`${API_BASE}/teaching/assessments/${takingAssessment.id}/submit`, {
        answers: takingAnswers,
      }, { headers: authHeaders() });
      await loadAssessments();
      await loadAnalytics();
      await loadMyResult(takingAssessment.id);
      alert('提交成功');
    } catch (err) {
      alert('提交失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setSubmittingAssessment(false);
    }
  };

  const handleRejectSubmission = async (submissionId) => {
    const reason = window.prompt('请输入打回原因（可选）', '') || '';
    setRejectingSubmissionId(submissionId);
    try {
      await axios.patch(`${API_BASE}/teaching/submissions/${submissionId}/status`, {
        status: 'rejected',
        reason,
      }, { headers: authHeaders() });
      await loadAssessmentSubmissions(selectedAssessmentId);
      await loadAssessments();
      await loadAnalytics();
      alert('已打回该提交');
    } catch (err) {
      alert('打回失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setRejectingSubmissionId(null);
    }
  };

  useEffect(() => {
    if (role === 'student' || !selectedAssessmentId) return;
    loadAssessmentSubmissions(selectedAssessmentId);
    loadAssessmentDetailAnalytics(selectedAssessmentId);
    const saved = localStorage.getItem(`ai_analysis_history_${selectedAssessmentId}`);
    if (saved) {
      try {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.length > 0) {
          setAiAnalyticsHistory(arr);
          setAiAnalytics(arr[0]?.payload || null);
        } else {
          setAiAnalyticsHistory([]);
          setAiAnalytics(null);
        }
      } catch (_e) {
        setAiAnalyticsHistory([]);
        setAiAnalytics(null);
      }
    } else {
      setAiAnalyticsHistory([]);
      setAiAnalytics(null);
    }
    setFocusStudentIds(new Set());
    setFocusQuestionIds(new Set());
    setAiHistoryOpen(false);
  }, [selectedAssessmentId]);

  useEffect(() => {
    if (!selectedAssessmentId) return;
    localStorage.setItem(`ai_analysis_history_${selectedAssessmentId}`, JSON.stringify(aiAnalyticsHistory));
  }, [selectedAssessmentId, aiAnalyticsHistory]);

  useEffect(() => {
    setSubmissionPage(1);
  }, [selectedAssessmentId, submissionKeyword, submissionStatusFilter, submissionClassFilter, submissionMajorFilter, submissionSortBy, submissionSortOrder]);

  if (loading) return <div className="p-12 text-center text-gray-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="surface-card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={24} className="text-gray-600" /></button>
          <div>
            <h2 className="text-xl font-bold text-gray-800">{planInfo?.title}</h2>
            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">{planInfo?.course_name}</span>
          </div>
        </div>
        {role !== 'student' && (
          <div className="flex gap-3">
            <button type="button" onClick={handleGenerate} className="flex items-center gap-2 px-4 py-2 text-indigo-600 bg-indigo-50 rounded-lg">
              <Wand2 size={16} /> AI 生成
            </button>
            <button type="button" onClick={handleSaveStage} disabled={saving} className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">
              <Save size={18} /> {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}
      </div>

      <div className="surface-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-gray-800">教案分阶段编辑（BOPPPS）</h3>
          <div className="text-xs text-gray-500">左侧切换阶段，右侧查看/编辑内容</div>
        </div>
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
        <div className="space-y-2">
          {Object.keys(stageNames).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveStage(key)}
              className={`w-full text-left px-4 py-3 rounded-lg ${activeStage === key ? 'bg-indigo-600 text-white' : 'bg-[#fffdf8] border border-[#e2d8c8] text-gray-700'}`}
            >
              {stageNames[key]}
            </button>
          ))}
        </div>
        <div className="surface-card p-4">
          {role !== 'student' && (
            <div className="mb-3 border rounded-lg p-3 bg-blue-50 border-blue-200 text-blue-900 text-sm">
              <div className="font-semibold">AI 生成顺序建议（BOPPPS）</div>
              <div className="mt-1 text-xs leading-5">
                推荐按「导入 → 目标 → 前测 → 参与式学习 → 后测 → 总结」顺序生成。
                前测会参考导入与目标，后测会参考目标与活动，总结会结合前后测结果。
              </div>
              {missingPrevStages.length > 0 ? (
                <div className="mt-2 text-xs text-amber-700">
                  当前阶段前置内容未完成：{missingPrevStages.join('、')}。建议先补齐再生成当前阶段。
                </div>
              ) : (
                <div className="mt-2 text-xs text-emerald-700">
                  当前阶段前置内容已齐备，可直接生成。
                </div>
              )}
              {nextRecommendedStage && (
                <div className="mt-1 text-xs text-blue-800">
                  下一推荐阶段：{stageHintTitle[nextRecommendedStage]}（{stageNames[nextRecommendedStage]}）
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="border rounded-lg bg-[#fffdf8]">
              <div className="px-3 py-2 border-b text-xs text-gray-500">Markdown 编辑区</div>
              <textarea
                className="w-full h-[460px] outline-none resize-none font-mono text-gray-800 bg-transparent p-3"
                value={currentStageContent}
                readOnly={role === 'student'}
                onChange={(e) => setStages({ ...stages, [activeStage]: e.target.value })}
              />
            </div>
            <div className="border rounded-lg bg-[#fffdf8]">
              <div className="px-3 py-2 border-b text-xs text-gray-500">渲染预览</div>
              <div
                className="h-[460px] overflow-auto p-3 text-[15px] text-gray-800"
                dangerouslySetInnerHTML={{ __html: currentStageHtml }}
              />
            </div>
          </div>
          {role !== 'student' && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
              <input className="p-2 border rounded md:col-span-2" placeholder="本节重难点" value={genConfig.focus_points} onChange={(e) => setGenConfig({ ...genConfig, focus_points: e.target.value })} />
              <input className="p-2 border rounded" placeholder="补充说明（可选文本）" value={genConfig.rag_snippets} onChange={(e) => setGenConfig({ ...genConfig, rag_snippets: e.target.value })} />
            </div>
          )}
          {role !== 'student' && (
            <div className="mt-3 border rounded-lg p-3 bg-gray-50">
              <div className="text-sm font-medium text-gray-800">AI 生成知识库资料选择</div>
              <div className="text-xs text-gray-500 mt-1">勾选后仅使用这些资料参与本次教案生成。</div>
              <div className="flex gap-2 mt-2">
                <button type="button" className="px-2 py-1 border rounded text-xs" onClick={() => setKbResourceSelection(new Set(courseResources.map((x) => x.id)))}>全选</button>
                <button type="button" className="px-2 py-1 border rounded text-xs" onClick={() => setKbResourceSelection(new Set())}>清空</button>
              </div>
              {courseResources.length === 0 ? (
                <div className="text-xs text-gray-500 mt-2">暂无可选课程资料。</div>
              ) : (
                <div className="mt-2 max-h-36 overflow-auto space-y-1">
                  {courseResources.map((item) => (
                    <label key={`kb_${item.id}`} className="flex items-center gap-2 text-xs text-gray-700">
                      <input type="checkbox" checked={kbResourceSelection.has(item.id)} onChange={() => toggleKbResource(item.id)} />
                      <span>{item.name} {item.chapter_title ? `(章节: ${item.chapter_title})` : '(课程级)'}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {role !== 'student' && (activeStage === 'pre_assessment' || activeStage === 'post_assessment') && (
            <div className={`mt-3 border rounded-lg p-3 text-sm ${stageLinkedAssessments.length > 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              {stageLinkedAssessments.length > 0 ? (
                <div>
                  已检测到本章节{activeStage === 'pre_assessment' ? '前测' : '后测'}测验 {stageLinkedAssessments.length} 个，AI 生成会基于这些测验进一步完善教案。
                  <div className="mt-1 text-xs">
                    {stageLinkedAssessments.map((item) => item.title).join('、')}
                  </div>
                </div>
              ) : (
                <div>
                  当前章节还未设置{activeStage === 'pre_assessment' ? '前测' : '后测'}测验。建议先创建章节测验，再生成该阶段教案，结果会更稳定。
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>

      <div className="surface-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-bold text-gray-800">章节资源（{chapterResources.length}）</h3>
          {role !== 'student' && (
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={() => setResourcePickerOpen(true)} className="px-3 py-2 border rounded-lg text-sm bg-indigo-50 text-indigo-700 border-indigo-200">
                从资源库导入
              </button>
              <input type="file" onChange={(e) => setQuickFile(e.target.files?.[0] || null)} className="text-sm" />
              <button type="button" onClick={handleUploadAndLink} disabled={uploadingResource || !quickFile} className="px-3 py-2 rounded-lg text-sm bg-green-600 text-white disabled:opacity-60">
                {uploadingResource ? '上传中...' : '上传并关联'}
              </button>
            </div>
          )}
        </div>
        {chapterResources.length === 0 ? (
          <div className="text-sm text-gray-500 border border-dashed rounded-lg p-4">当前章节还没有关联资源。</div>
        ) : (
          <div className="space-y-2">
            {chapterResources.map((item) => (
              <div key={item.id} className="border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-800">{item.name}</div>
                  <div className="text-xs text-gray-500">{item.uploader_name || '-'} | {item.created_at}</div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {canPreviewResource(item) && item.file_exists !== false && (
                    <button type="button" onClick={() => setPreviewResource(item)} className="text-indigo-600 hover:text-indigo-800">预览</button>
                  )}
                  {item.file_exists === false ? (
                    <span className="text-red-500">文件缺失</span>
                  ) : (
                    <a href={getResourceContentHref(item)} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800">
                      {item.type === 'link' ? '打开' : '下载'}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="surface-card p-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-bold text-gray-800">章节测验</h3>
          {role !== 'student' && (
            <button
              type="button"
              onClick={() => { resetQuizForm(); setQuizModalOpen(true); }}
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm"
            >
              新建测验
            </button>
          )}
        </div>
        {role !== 'student' && (
          <div className="text-xs text-gray-500 border rounded-lg p-2 bg-gray-50">
            流程提示：创建/编辑测验 → 预览题目质量 → 点击“推送给学生”后学生端才可见并可作答。
          </div>
        )}
        <div className="text-sm font-semibold text-gray-700">测验列表</div>

        {assessments.length === 0 ? (
          <div className="text-sm text-gray-500 border border-dashed rounded-lg p-4">当前章节暂无测验。</div>
        ) : (
          <div className="space-y-3">
            {assessments.map((item) => (
              <div key={item.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">{item.title}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    类型: {item.type} | 题数: {item.question_count} | 已推送: {item.is_pushed ? '是' : '否'} | 提交后可看答案: {item.reveal_after_submit ? '是' : '否'}
                  </div>
                  {role === 'student' && item.my_submission && (
                    <div className="text-xs text-green-700 mt-1">当前有效成绩: {item.my_submission.score?.toFixed?.(2) ?? item.my_submission.score}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {role === 'student' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStartAssessment(item.id)}
                        disabled={!!item.has_active_submission}
                        className="px-3 py-2 rounded border text-sm disabled:opacity-50"
                      >
                        {item.has_active_submission ? '已提交' : '开始作答'}
                      </button>
                      <button
                        type="button"
                        onClick={() => loadMyResult(item.id)}
                        className="px-3 py-2 rounded border text-sm"
                      >
                        查看成绩
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAssessmentId(item.id);
                          setSubmissionKeyword('');
                          setSubmissionStatusFilter('');
                          setSubmissionClassFilter('');
                          setSubmissionMajorFilter('');
                          setSubmissionSortBy('submitted_at');
                          setSubmissionSortOrder('desc');
                        }}
                        className={`px-3 py-2 rounded text-sm ${selectedAssessmentId === item.id ? 'bg-indigo-600 text-white' : 'border'}`}
                      >
                        查看提交
                      </button>
                      <>
                        <button type="button" onClick={() => handleEditAssessment(item.id)} className="px-3 py-2 rounded border text-sm">编辑测验</button>
                        <button type="button" onClick={() => handleDeleteAssessment(item)} className="px-3 py-2 rounded border border-red-200 text-red-700 text-sm">删除测验</button>
                        {!item.is_pushed && (
                          <button
                            type="button"
                            onClick={() => handlePushAssessment(item.id)}
                            disabled={pushingAssessmentId === item.id}
                            className="px-3 py-2 rounded bg-green-600 text-white text-sm disabled:opacity-60"
                          >
                            {pushingAssessmentId === item.id ? '推送中...' : '推送给学生'}
                          </button>
                        )}
                      </>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {role !== 'student' && (
          <>
          <div className="text-sm font-semibold text-gray-700">基础统计</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {analytics.length === 0 ? (
              <div className="text-sm text-gray-500">暂无可统计的有效提交。</div>
            ) : analytics.map((item) => (
              <div key={item.assessment_id} className="border rounded-lg p-3 bg-indigo-50">
                <div className="font-semibold text-gray-800">{item.title}</div>
                <div className="text-sm text-gray-600 mt-1">平均分: {Number(item.avg_score || 0).toFixed(2)}</div>
                <div className="text-sm text-gray-600">提交人数: {item.submission_count}</div>
              </div>
            ))}
          </div>
          </>
        )}

        {role !== 'student' && selectedAssessmentId && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="border rounded-lg p-3 space-y-2 xl:col-span-7">
            <div className="text-sm font-semibold text-gray-700">提交记录与筛选</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="border rounded p-2 bg-[#f8f4ec]">
                <div className="text-[#7a6d5a]">题目数</div>
                <div className="text-base font-semibold text-[#2e2821]">{selectedAssessment?.question_count || 0}</div>
              </div>
              <div className="border rounded p-2 bg-[#f8f4ec]">
                <div className="text-[#7a6d5a]">提交数</div>
                <div className="text-base font-semibold text-[#2e2821]">{submissions.length}</div>
              </div>
              <div className="border rounded p-2 bg-[#f8f4ec]">
                <div className="text-[#7a6d5a]">状态</div>
                <div className="text-base font-semibold text-[#2e2821]">{selectedAssessment?.is_pushed ? '已推送' : '未推送'}</div>
              </div>
            </div>
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-gray-800">提交记录</div>
            </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
                  <input className="p-2 border rounded text-sm" placeholder="搜索姓名/用户名" value={submissionKeyword} onChange={(e) => setSubmissionKeyword(e.target.value)} />
                  <select className="p-2 border rounded text-sm" value={submissionStatusFilter} onChange={(e) => setSubmissionStatusFilter(e.target.value)}>
                    <option value="">全部状态</option>
                    <option value="active">active</option>
                    <option value="rejected">rejected</option>
                  </select>
                  <select className="p-2 border rounded text-sm" value={submissionMajorFilter} onChange={(e) => setSubmissionMajorFilter(e.target.value)}>
                    <option value="">全部专业</option>
                    {submissionMajorOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select className="p-2 border rounded text-sm" value={submissionClassFilter} onChange={(e) => setSubmissionClassFilter(e.target.value)}>
                    <option value="">全部班级</option>
                    {submissionClassOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                  <select className="p-2 border rounded text-sm" value={submissionSortBy} onChange={(e) => setSubmissionSortBy(e.target.value)}>
                    <option value="submitted_at">按提交时间</option>
                    <option value="score">按分数</option>
                    <option value="student_name">按姓名</option>
                  </select>
                  <select className="p-2 border rounded text-sm" value={submissionSortOrder} onChange={(e) => setSubmissionSortOrder(e.target.value)}>
                    <option value="desc">降序</option>
                    <option value="asc">升序</option>
                  </select>
                  <div className="text-xs text-gray-500 flex items-center">结果: {filteredSortedSubmissions.length} / {submissions.length}（每页10条）</div>
                </div>
                {loadingSubmissions ? (
                  <div className="text-sm text-gray-500">加载中...</div>
                ) : filteredSortedSubmissions.length === 0 ? (
                  <div className="text-sm text-gray-500">暂无提交记录。</div>
                ) : (
                  <div className="space-y-2">
                    {pagedSubmissions.map((sub) => (
                      <div key={sub.id} className="border rounded p-3 flex items-center justify-between gap-3">
                        <div className="text-sm">
                          <div className="font-medium text-gray-800">{sub.student_name} ({sub.student_username})</div>
                          <div className="text-gray-600">分数: {Number(sub.score || 0).toFixed(2)} | 状态: {sub.status}</div>
                          <div className="text-gray-500">{sub.student_major || '-'} / {sub.student_class_name || '-'}</div>
                          <div className="text-gray-500">提交时间: {sub.submitted_at || '-'}</div>
                          {sub.reject_reason && <div className="text-gray-500">打回原因: {sub.reject_reason}</div>}
                        </div>
                        {sub.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => handleRejectSubmission(sub.id)}
                            disabled={rejectingSubmissionId === sub.id}
                            className="px-3 py-2 rounded bg-red-600 text-white text-sm disabled:opacity-60"
                          >
                            {rejectingSubmissionId === sub.id ? '处理中...' : '打回重提'}
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center justify-between border rounded p-2 bg-gray-50">
                      <div className="text-xs text-gray-500">
                        第 {safeSubmissionPage} / {submissionTotalPages} 页
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSubmissionPage((p) => Math.max(1, p - 1))}
                          disabled={safeSubmissionPage <= 1}
                          className="px-2 py-1 border rounded text-xs disabled:opacity-50"
                        >
                          上一页
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubmissionPage((p) => Math.min(submissionTotalPages, p + 1))}
                          disabled={safeSubmissionPage >= submissionTotalPages}
                          className="px-2 py-1 border rounded text-xs disabled:opacity-50"
                        >
                          下一页
                        </button>
                      </div>
                    </div>
                  </div>
                )}
          </div>
          <div className="border rounded-lg p-3 space-y-4 xl:col-span-5">
            <div className="text-sm font-semibold text-gray-700">详细分析与 AI 建议</div>
            <div className="flex items-center justify-between">
              <div className="font-semibold text-gray-800 inline-flex items-center gap-2"><BarChart3 size={16} /> 详细分析</div>
              <button
                type="button"
                onClick={() => {
                  loadAssessmentDetailAnalytics(selectedAssessmentId);
                }}
                className="px-2 py-1 border rounded text-xs"
              >
                刷新统计
              </button>
            </div>
            {loadingDetailAnalytics ? (
              <div className="text-sm text-gray-500">详细分析加载中...</div>
            ) : !assessmentDetailAnalytics ? (
              <div className="text-sm text-gray-500">暂无详细分析数据。</div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="border rounded p-2 bg-indigo-50 text-sm">平均分: {Number(assessmentDetailAnalytics.assessment?.average_score || 0).toFixed(2)}</div>
                  <div className="border rounded p-2 bg-indigo-50 text-sm">提交人数: {assessmentDetailAnalytics.assessment?.submission_count || 0}</div>
                  <div className="border rounded p-2 bg-indigo-50 text-sm">参与率: {Number(assessmentDetailAnalytics.participation?.participation_rate || 0).toFixed(2)}%</div>
                </div>

                <Suspense fallback={<div className="text-sm text-gray-500">图表模块加载中...</div>}>
                  <AssessmentAnalyticsCharts
                    analytics={assessmentDetailAnalytics}
                    selectedAssessmentId={selectedAssessmentId}
                  />
                </Suspense>

                <div className="border rounded p-3">
                  <div className="font-medium text-gray-800 mb-2">题目正确率（重难点识别）</div>
                  <div className="space-y-2 max-h-56 overflow-auto">
                    {(assessmentDetailAnalytics.question_stats || []).map((q) => (
                      <div key={q.question_id} className="text-sm border rounded p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-gray-800">{q.content}</div>
                          <label className="text-xs text-indigo-700 flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={focusQuestionIds.has(q.question_id)}
                              onChange={() => setFocusQuestionIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(q.question_id)) next.delete(q.question_id);
                                else next.add(q.question_id);
                                return next;
                              })}
                            />
                            重点关注
                          </label>
                        </div>
                        <div className="text-gray-600">正确率: {q.accuracy !== null && q.accuracy !== undefined ? `${Number(q.accuracy).toFixed(2)}%` : '-'} | 作答人数: {q.attempts}</div>
                        {q.explanation && <div className="text-gray-500 mt-1">解析: {q.explanation}</div>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border rounded p-3">
                    <div className="font-medium text-gray-800 mb-2">学生作答详情</div>
                    <div className="space-y-2 max-h-52 overflow-auto">
                      {(assessmentDetailAnalytics.student_stats || []).map((s) => (
                        <div key={s.submission_id} className="text-sm border rounded p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-gray-800">{s.student_name} ({s.student_username})</div>
                            <label className="text-xs text-indigo-700 flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={focusStudentIds.has(s.student_id)}
                                onChange={() => setFocusStudentIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(s.student_id)) next.delete(s.student_id);
                                  else next.add(s.student_id);
                                  return next;
                                })}
                              />
                              重点关注
                            </label>
                          </div>
                          <div className="text-gray-600">排名: {s.rank} | 分数: {Number(s.score || 0).toFixed(2)} | 对题: {s.correct_count}/{s.question_count}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border rounded p-3">
                    <div className="font-medium text-gray-800 mb-2 inline-flex items-center gap-2"><Trophy size={14} /> 课程总排名（按课程平均分）</div>
                    <div className="space-y-2 max-h-52 overflow-auto">
                      {(assessmentDetailAnalytics.course_ranking || []).map((r) => (
                        <div key={r.student_id} className="text-sm border rounded p-2">
                          <div className="font-medium text-gray-800">#{r.rank} {r.student_name} ({r.student_username})</div>
                          <div className="text-gray-600">课程平均分: {Number(r.avg_score || 0).toFixed(2)} | 有效提交: {r.submission_count}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="border rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-gray-800 inline-flex items-center gap-2"><Bot size={14} /> AI 教学分析建议</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => loadAssessmentAiAnalytics(selectedAssessmentId)}
                    disabled={loadingAiAnalytics}
                    className="px-2 py-1 border rounded text-xs disabled:opacity-60"
                  >
                    {loadingAiAnalytics ? '分析中...' : '实时分析'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiHistoryOpen((v) => !v)}
                    className="px-2 py-1 border rounded text-xs"
                  >
                    历史记录
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-500 mb-2">
                可勾选“重点关注”的学生与题目后点击实时分析，AI 会按全局到细节给建议。
              </div>
              {loadingAiAnalytics ? (
                <div className="text-sm text-gray-500">AI 分析中...</div>
              ) : !aiAnalytics?.analysis ? (
                <div className="text-sm text-gray-500">点击“实时分析”调用大模型生成建议。</div>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="border rounded p-2">
                    <div className="font-medium text-gray-800">全局结论</div>
                    <div className="text-gray-700 mt-1">{aiAnalytics.analysis.global_summary?.conclusion || aiAnalytics.analysis.summary || '-'}</div>
                    <div className="text-gray-600 mt-1">整体风险: {aiAnalytics.analysis.global_summary?.overall_risk || '-'}</div>
                  </div>
                  <div className="border rounded p-2">
                    <div className="font-medium text-gray-800">题目细节建议</div>
                    <div className="space-y-1 mt-1">
                      {(aiAnalytics.analysis.question_insights || aiAnalytics.analysis.key_difficulties || []).map((x, idx) => (
                        <div key={`ai_q_${idx}`} className="text-gray-700">
                          - Q{x.question_id}: {x.reason}；建议: {x.teaching_advice || x.in_class_explanation}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border rounded p-2">
                    <div className="font-medium text-gray-800">重点学生建议</div>
                    <div className="space-y-1 mt-1">
                      {(aiAnalytics.analysis.student_insights || []).map((s, idx) => (
                        <div key={`ai_s_${idx}`} className="text-gray-700">
                          - {s.student_name}（风险{ s.risk_level }）: {s.coaching_advice}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border rounded p-2">
                    <div className="font-medium text-gray-800">教学行动建议</div>
                    <div className="space-y-1 mt-1">
                      {(aiAnalytics.analysis.teaching_suggestions || []).map((s, idx) => (
                        <div key={`ai_suggestion_${idx}`} className="text-gray-700">- {s}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {aiHistoryOpen && aiAnalyticsHistory.length > 0 && (
                <div className="mt-3 border-t pt-2">
                  <div className="text-xs text-gray-500 mb-1">历史分析记录</div>
                  <div className="space-y-1 max-h-28 overflow-auto">
                    {aiAnalyticsHistory.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        className="w-full text-left px-2 py-1 border rounded text-xs hover:bg-gray-50"
                        onClick={() => setAiAnalytics(h.payload)}
                      >
                        {h.created_at}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {aiHistoryOpen && aiAnalyticsHistory.length === 0 && (
                <div className="mt-3 border-t pt-2 text-xs text-gray-500">暂无历史记录。</div>
              )}
            </div>
          </div>
          </div>
        )}

        {role === 'student' && takingAssessment && (
          <div className="border rounded-lg p-3 space-y-3">
            <div className="font-semibold text-gray-800">正在作答: {takingAssessment.title}</div>
            <div className="text-xs text-gray-500 border rounded p-2 bg-gray-50">
              作答提示：需完成全部题目后提交。提交后如需重做，需要老师在“提交记录”中打回本次提交。
            </div>
            {(takingAssessment.questions || []).map((q, qIndex) => (
              <div key={q.id} className="border rounded p-3">
                <div className="font-medium text-gray-800 mb-2">{qIndex + 1}. {q.content}</div>
                <div className="space-y-2">
                  {(q.options || []).map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`q_${q.id}`}
                        checked={takingAnswers[String(q.id)] === opt}
                        onChange={() => setTakingAnswers((prev) => ({ ...prev, [String(q.id)]: opt }))}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={handleSubmitAssessment}
              disabled={submittingAssessment}
              className="px-4 py-2 rounded bg-green-600 text-white disabled:opacity-60"
            >
              {submittingAssessment ? '提交中...' : '提交测验'}
            </button>
          </div>
        )}

        {role === 'student' && (
          <div className="border rounded-lg p-3">
            <div className="font-semibold text-gray-800 mb-2">成绩与明细</div>
            {loadingResult ? (
              <div className="text-sm text-gray-500">加载中...</div>
            ) : !myResult ? (
              <div className="text-sm text-gray-500">请选择测验并提交后查看。</div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="text-gray-800">测验: {myResult.title}</div>
                <div className="text-gray-800">总分: {Number(myResult.score || 0).toFixed(2)}</div>
                {!myResult.reveal_after_submit ? (
                  <div className="text-gray-500">{myResult.message || '教师未开放明细查看'}</div>
                ) : (
                  <div className="space-y-2">
                    {(myResult.question_results || []).map((qr, idx) => (
                      <div key={qr.question_id} className="border rounded p-3">
                        <div className="font-medium text-gray-800">{idx + 1}. {qr.content}</div>
                        <div className="text-gray-700 mt-1">我的答案: {qr.my_answer || '-'}</div>
                        <div className="text-gray-700">标准答案: {qr.correct_answer || '-'}</div>
                        <div className={qr.is_correct ? 'text-green-700' : 'text-red-700'}>
                          结果: {qr.is_correct ? '正确' : '错误'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {quizModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[#fffdf8] rounded-xl w-full max-w-4xl max-h-[88vh] overflow-auto p-4 space-y-4 border border-[#e8dece]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{editingAssessmentId ? '编辑测验' : '新建测验'}</h3>
              <button type="button" onClick={() => setQuizModalOpen(false)} className="text-sm text-gray-500">关闭</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                className="p-2 border rounded"
                placeholder="测验标题"
                value={quizForm.title}
                onChange={(e) => setQuizForm((prev) => ({ ...prev, title: e.target.value }))}
              />
              <select
                className="p-2 border rounded"
                value={quizForm.type}
                onChange={(e) => setQuizForm((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="pre_assessment">前测</option>
                <option value="post_assessment">后测</option>
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={quizForm.reveal_after_submit}
                  onChange={(e) => setQuizForm((prev) => ({ ...prev, reveal_after_submit: e.target.checked }))}
                />
                提交后允许查看答案与对错
              </label>
            </div>
            <div className="border rounded-lg p-3 bg-indigo-50 border-indigo-200 text-xs text-indigo-900">
              组卷建议：优先从题库导入成熟题，再补充手动录题，最后用 AI 生成做扩展。发布前先预览题干、选项和标准答案是否一致。
            </div>

            <div className="border rounded-lg p-3 space-y-3">
              <div className="font-semibold text-sm text-gray-800">AI 生成题目（单选）</div>
              <div className="text-xs text-gray-500">
                参数说明：题目数量默认 5（生成 5 道题）；难度默认 3（中等难度，1 最易，5 最难）。
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <label className="text-xs text-gray-600">
                  题目数量（1-20，默认5）
                  <input
                    type="number"
                    min={1}
                    max={20}
                    className="p-2 border rounded w-full mt-1"
                    placeholder="例如：5"
                    value={aiQuestionConfig.count}
                    onChange={(e) => setAiQuestionConfig((p) => ({ ...p, count: e.target.value }))}
                  />
                </label>
                <label className="text-xs text-gray-600">
                  难度等级（1-5，默认3）
                  <input
                    type="number"
                    min={1}
                    max={5}
                    className="p-2 border rounded w-full mt-1"
                    placeholder="例如：3（中等）"
                    value={aiQuestionConfig.difficulty}
                    onChange={(e) => setAiQuestionConfig((p) => ({ ...p, difficulty: e.target.value }))}
                  />
                </label>
                <input
                  className="p-2 border rounded md:col-span-2"
                  placeholder="标签（逗号分隔，如 计算,概念）"
                  value={aiQuestionConfig.tags}
                  onChange={(e) => setAiQuestionConfig((p) => ({ ...p, tags: e.target.value }))}
                />
              </div>
              <button type="button" onClick={handleGenerateAIQuestions} disabled={generatingQuestions} className="px-3 py-2 rounded bg-indigo-600 text-white text-sm disabled:opacity-60">
                {generatingQuestions ? '生成中...' : 'AI 生成（先预览）'}
              </button>
              {aiGeneratedQuestions.length > 0 && (
                <div className="border rounded p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-600">已生成 {aiGeneratedQuestions.length} 道题，请勾选后导入/保存</div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="px-2 py-1 border rounded text-xs"
                        onClick={() => setSelectedGeneratedIndexes(new Set(aiGeneratedQuestions.map((_, idx) => idx)))}
                      >
                        全选
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 border rounded text-xs"
                        onClick={() => setSelectedGeneratedIndexes(new Set())}
                      >
                        清空
                      </button>
                    </div>
                  </div>
                  <div className="max-h-44 overflow-auto space-y-2">
                    {aiGeneratedQuestions.map((item, idx) => (
                      <label key={`ai_gen_${idx}`} className="border rounded p-2 flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={selectedGeneratedIndexes.has(idx)} onChange={() => toggleGeneratedQuestion(idx)} />
                        <div className="text-xs">
                          <div className="font-medium text-gray-800">{item.stem}</div>
                          <div className="text-gray-600 mt-1">
                            {(item.options || []).map((opt, optIdx) => (
                              <div key={`ai_opt_${idx}_${optIdx}`}>{optionLabel(optIdx)}. {opt}</div>
                            ))}
                          </div>
                          <div className="text-gray-700 mt-1">
                            正确答案: {
                              (() => {
                                const ansIdx = (item.options || []).findIndex((opt) => opt === item.answer);
                                if (ansIdx >= 0) return `${optionLabel(ansIdx)}. ${item.answer}`;
                                return item.answer || '-';
                              })()
                            }
                          </div>
                          {item.explanation && (
                            <div className="text-gray-600 mt-1">解析: {item.explanation}</div>
                          )}
                          <div className="text-gray-500">
                            难度: {item.difficulty || '-'} | 标签: {(item.tags || []).join(', ') || '-'}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={importSelectedGeneratedToDraft} className="px-2 py-1 border rounded text-xs">导入草稿</button>
                    <button type="button" onClick={saveSelectedGeneratedToBank} disabled={savingGeneratedToBank} className="px-2 py-1 border rounded text-xs disabled:opacity-60">
                      {savingGeneratedToBank ? '保存中...' : '保存到题库'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm text-gray-800">题库导入（课程+章节）</div>
                <div className="flex gap-2">
                  <button type="button" onClick={loadQuestionBank} className="px-2 py-1 border rounded text-xs">刷新</button>
                  <button type="button" onClick={importBankQuestionToDraft} disabled={selectedBankIds.size === 0} className="px-2 py-1 border rounded text-xs disabled:opacity-50">导入到草稿</button>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                提示：优先选择“历史正确率”和“历史人数”较稳定的题；新题建议先小规模试测再用于正式测验。
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  className="p-2 border rounded text-sm"
                  placeholder="按题干关键字筛选"
                  value={bankKeyword}
                  onChange={(e) => setBankKeyword(e.target.value)}
                />
                <select className="p-2 border rounded text-sm" value={bankTagFilter} onChange={(e) => setBankTagFilter(e.target.value)}>
                  <option value="">全部标签</option>
                  {availableTags.map((tag) => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
                <select className="p-2 border rounded text-sm" value={bankDifficultyFilter} onChange={(e) => setBankDifficultyFilter(e.target.value)}>
                  <option value="">全部难度</option>
                  {[1, 2, 3, 4, 5].map((lv) => (
                    <option key={lv} value={String(lv)}>难度 {lv}</option>
                  ))}
                </select>
              </div>
              {loadingQuestionBank ? (
                <div className="text-sm text-gray-500">题库加载中...</div>
              ) : filteredQuestionBank.length === 0 ? (
                <div className="text-sm text-gray-500">暂无题库题目</div>
              ) : (
                <div className="max-h-52 overflow-auto space-y-2">
                  {filteredQuestionBank.map((item) => (
                    <label key={item.id} className="border rounded p-2 flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={selectedBankIds.has(item.id)} onChange={() => toggleBankQuestion(item.id)} />
                      <div className="text-xs">
                        <div className="font-medium text-gray-800">{item.stem}</div>
                        <div className="text-gray-500">
                          难度: {item.difficulty} | 标签: {(item.tags || []).join(', ') || '-'}
                          {' | 历史人数: '}
                          {item.history_attempts || 0}
                          {' | 历史正确率: '}
                          {item.history_accuracy !== null && item.history_accuracy !== undefined ? `${Number(item.history_accuracy).toFixed(2)}%` : '-'}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              {quizForm.questions.map((q, qIdx) => (
                <div key={`q_${qIdx}`} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm">题目 {qIdx + 1}</div>
                    <button type="button" onClick={() => removeQuestion(qIdx)} className="text-xs text-red-600">删除题目</button>
                  </div>
                  <input
                    className="w-full p-2 border rounded"
                    placeholder="请输入题干"
                    value={q.content}
                    onChange={(e) => updateQuestion(qIdx, { content: e.target.value })}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {q.options.map((opt, optIdx) => (
                      <input
                        key={`q_${qIdx}_opt_${optIdx}`}
                        className="p-2 border rounded"
                        placeholder={`选项 ${optIdx + 1}`}
                        value={opt}
                        onChange={(e) => updateQuestionOption(qIdx, optIdx, e.target.value)}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => addOption(qIdx)} className="px-2 py-1 text-xs border rounded">添加选项</button>
                    <select
                      className="flex-1 p-2 border rounded"
                      value={q.answer}
                      onChange={(e) => updateQuestion(qIdx, { answer: e.target.value })}
                    >
                      <option value="">请选择标准答案（按选项）</option>
                      {q.options.map((opt, idx) => {
                        const value = (opt || '').trim();
                        if (!value) return null;
                        return <option key={`q_${qIdx}_ans_${idx}`} value={value}>{optionLabel(idx)}. {value}</option>;
                      })}
                    </select>
                  </div>
                  <textarea
                    className="w-full p-2 border rounded text-sm"
                    placeholder="题目解析（用于教学分析与讲解）"
                    value={q.explanation || ''}
                    onChange={(e) => updateQuestion(qIdx, { explanation: e.target.value })}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button type="button" onClick={addQuestion} className="px-3 py-2 border rounded text-sm">新增题目</button>
              <button type="button" onClick={handleCreateQuiz} disabled={creatingQuiz} className="px-4 py-2 rounded bg-green-600 text-white disabled:opacity-60">
                {creatingQuiz ? (editingAssessmentId ? '更新中...' : '创建中...') : (editingAssessmentId ? '更新测验' : '创建测验')}
              </button>
            </div>
          </div>
        </div>
      )}

      {resourcePickerOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[#fffdf8] rounded-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col border border-[#e8dece]">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold text-gray-800">Select Resources</div>
              <button type="button" onClick={() => setResourcePickerOpen(false)} className="px-3 py-1 border rounded text-sm">Close</button>
            </div>
            <div className="p-4 overflow-auto space-y-2">
              {courseResources.map((item) => (
                <label key={item.id} className="border rounded-lg p-3 flex items-center justify-between cursor-pointer hover:border-indigo-200">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={resourceSelection.has(item.id)} onChange={() => toggleResource(item.id)} />
                    <div>
                      <div className="font-medium text-gray-800">{item.name}</div>
                      <div className="text-xs text-gray-500">Current chapter: {item.chapter_title || 'Unlinked'}</div>
                    </div>
                  </div>
                  <button type="button" onClick={(e) => { e.preventDefault(); setPreviewResource(item); }} className="text-sm text-indigo-600">Preview</button>
                </label>
              ))}
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button type="button" onClick={() => setResourcePickerOpen(false)} className="px-4 py-2 border rounded">Cancel</button>
              <button type="button" onClick={handleSaveResourcePicker} className="px-4 py-2 bg-green-600 text-white rounded">Save</button>
            </div>
          </div>
        </div>
      )}

      {previewResource && <ResourcePreviewModal resource={previewResource} onClose={() => setPreviewResource(null)} />}
    </div>
  );
};

const CourseResourceManagement = ({ course, onBack }) => {
  const [resources, setResources] = useState([]);
  const [resourceMode, setResourceMode] = useState('file');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', file: null, url: '' });
  const [previewResource, setPreviewResource] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/teaching/courses/${course.id}/resources`, { headers: authHeaders() });
      setResources(res.data.data || []);
    } catch (err) {
      alert('加载资源失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [course.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('name', form.name);
      payload.append('type', resourceMode);
      payload.append('course_id', String(course.id));
      if (resourceMode === 'file') {
        if (!form.file) throw new Error('请选择上传文件');
        payload.append('file', form.file);
      } else {
        if (!form.url.trim()) throw new Error('请输入资源链接');
        payload.append('url', form.url.trim());
      }
      await axios.post(`${API_BASE}/teaching/resources`, payload, { headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' } });
      setForm({ name: '', file: null, url: '' });
      await fetchData();
      alert('资源上传成功');
    } catch (err) {
      alert('资源上传失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (resourceId) => {
    if (!window.confirm('确定删除该资源吗？')) return;
    try {
      await axios.delete(`${API_BASE}/teaching/resources/${resourceId}`, { headers: authHeaders() });
      await fetchData();
      alert('资源已删除');
    } catch (err) {
      alert('删除失败: ' + (err.response?.data?.msg || err.message));
    }
  };

  const handleOpenResource = async (resource) => {
    const href = resource.type === 'link' ? getResourceHref(resource.url) : `${API_HOST}${resource.download_url || resource.preview_url || resource.url}`;
    try {
      if (resource.type === 'link') {
        openResourceInPlace(href);
        return;
      }
      await triggerDownload(resource, href);
    } catch (err) {
      alert(`资源打开失败: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={24} className="text-gray-600" /></button>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">{course.name} - 课程文件库</h2>
          <p className="text-gray-500 text-sm">统一上传文件，章节中按需关联</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="surface-card p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <input className="p-3 border rounded-lg" placeholder="资源名称" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
        <div className="flex gap-3">
          <button type="button" className={`px-4 py-2 rounded-lg border ${resourceMode === 'file' ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'border-gray-300 text-gray-600'}`} onClick={() => setResourceMode('file')}>文件</button>
          <button type="button" className={`px-4 py-2 rounded-lg border ${resourceMode === 'link' ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'border-gray-300 text-gray-600'}`} onClick={() => setResourceMode('link')}>链接</button>
        </div>

        {resourceMode === 'file' ? (
          <input
            type="file"
            className="p-3 border rounded-lg md:col-span-2"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setForm((p) => ({
                ...p,
                file,
                name: file && !p.name.trim() ? filenameWithoutExt(file.name) : p.name,
              }));
            }}
            required
          />
        ) : (
          <input type="url" className="p-3 border rounded-lg md:col-span-2" placeholder="https://example.com/resource" value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} required />
        )}

        <button type="submit" disabled={submitting} className="md:col-span-2 px-4 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-60">
          {submitting ? '上传中...' : '上传资源'}
        </button>
      </form>

      <div className="surface-card p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">文件库</h3>
        {loading ? (
          <div className="text-gray-500 py-8 text-center">加载中...</div>
        ) : resources.length === 0 ? (
          <div className="text-gray-400 py-8 text-center border border-dashed rounded-lg">暂无资源</div>
        ) : (
          <div className="space-y-3">
            {resources.map((resource) => (
              <div key={resource.id} className="border rounded-lg p-4 flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-gray-900">{resource.name}</div>
                  <div className="text-sm text-gray-500 mt-1">所属章节：{resource.chapter_title || '未关联章节'}</div>
                  <div className="text-sm text-gray-500">上传人：{resource.uploader_name || '-'}</div>
                  <div className="text-xs text-gray-400">{resource.created_at}</div>
                </div>
                <div className="flex items-center gap-3">
                  {canPreviewResource(resource) && resource.file_exists !== false && (
                    <button type="button" onClick={() => setPreviewResource(resource)} className="text-indigo-600 hover:text-indigo-800 text-sm inline-flex items-center gap-1">
                      <LinkIcon size={14} /> 预览
                    </button>
                  )}
                  {resource.file_exists === false ? (
                    <span className="text-red-500 text-sm">文件缺失</span>
                  ) : (
                    <button type="button" onClick={() => handleOpenResource(resource)} className="text-blue-600 hover:text-blue-800 text-sm inline-flex items-center gap-1">
                      <LinkIcon size={14} /> {resource.type === 'link' ? '打开链接' : canPreviewResource(resource) ? '下载文件' : '打开/下载'}
                    </button>
                  )}
                  <button type="button" className="text-red-600 hover:text-red-800 text-sm" onClick={() => handleDelete(resource.id)}>删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {previewResource && <ResourcePreviewModal resource={previewResource} onClose={() => setPreviewResource(null)} />}
    </div>
  );
};

const CourseManagement = () => {
  const [view, setView] = useState('list');
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const role = localStorage.getItem('role');

  return (
    <div className="surface-card p-6 h-full">
      {view === 'list' && (
        <CourseList
          onSelectCourse={(course) => {
            setSelectedCourse(course);
            setView(role === 'student' ? 'studentAssessments' : 'planList');
          }}
          onManageStudents={(course) => { setSelectedCourse(course); setView('studentList'); }}
          onViewResources={(course) => { setSelectedCourse(course); setView('resourceList'); }}
        />
      )}

      {view === 'studentList' && selectedCourse && (
        <StudentManagement course={selectedCourse} onBack={() => { setSelectedCourse(null); setView('list'); }} />
      )}

      {view === 'planList' && selectedCourse && (
        <LessonPlanList
          course={selectedCourse}
          onBack={() => { setSelectedCourse(null); setView('list'); }}
          onSelectPlan={(id) => { setSelectedPlanId(id); setView('planDetail'); }}
        />
      )}

      {view === 'studentAssessments' && selectedCourse && (
        <StudentCourseAssessments
          course={selectedCourse}
          onBack={() => { setSelectedCourse(null); setView('list'); }}
        />
      )}

      {view === 'planDetail' && selectedPlanId && (
        <LessonPlanDetail planId={selectedPlanId} onBack={() => { setSelectedPlanId(null); setView('planList'); }} />
      )}

      {view === 'resourceList' && selectedCourse && (
        <CourseResourceManagement course={selectedCourse} onBack={() => { setSelectedCourse(null); setView('list'); }} />
      )}
    </div>
  );
};

export default CourseManagement;
