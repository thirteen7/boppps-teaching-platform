import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { ExternalLink, Eye, FileText, Link as LinkIcon, Upload, RefreshCw, Trash2 } from 'lucide-react';
import { API_BASE, API_ORIGIN } from '../api';

const API_HOST = API_ORIGIN;

const filenameWithoutExt = (filename = '') => filename.replace(/\.[^/.]+$/, '') || filename;
const getFileExt = (resource) => {
  const explicitExt = (resource?.file_ext || '').toLowerCase();
  if (explicitExt) {
    return explicitExt.startsWith('.') ? explicitExt.slice(1) : explicitExt;
  }
  return ((resource?.url || resource?.name || '').split('?')[0].toLowerCase().split('.').pop() || '');
};
const getMimeType = (resource) => (resource?.mime_type || '').toLowerCase();
const isOfficeDoc = (ext) => ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
const isInlinePreviewable = (ext) => ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'txt', 'md', 'csv', 'json'].includes(ext);
const canPreviewResource = (resource) => {
  if (!resource) return false;
  const ext = getFileExt(resource);
  const mimeType = getMimeType(resource);
  const localPreviewable = isInlinePreviewable(ext) || isOfficeDoc(ext) || mimeType === 'application/json';
  if (typeof resource.can_preview === 'boolean') return resource.can_preview || localPreviewable;
  if (resource.type === 'link') return false;
  return localPreviewable;
};
const openResourceInPlace = (href) => {
  if (!href || href === '#') return;
  window.location.assign(href);
};
const triggerDownload = async (resource, href) => {
  if (!href || href === '#') return;
  const response = await fetch(href);
  if (!response.ok) {
    throw new Error(`下载失败: ${response.status}`);
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

const ResourcePreviewModal = ({ resource, href, onClose }) => {
  const [textContent, setTextContent] = useState('');
  const [textLoading, setTextLoading] = useState(false);
  const safeResource = resource || {};
  const ext = getFileExt(safeResource);
  const mimeType = getMimeType(safeResource);
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
    <div className="fixed inset-0 bg-black/50 motion-overlay z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col motion-modal">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold text-gray-800">{resource.name}</div>
          <button type="button" onClick={onClose} className="px-3 py-1 text-sm rounded border">关闭</button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {isPdf && <iframe title={resource.name} src={href} className="w-full h-full min-h-[60vh] border" />}
          {isImage && <img src={href} alt={resource.name} className="max-w-full h-auto mx-auto" />}
          {isText && <pre className="whitespace-pre-wrap text-sm bg-gray-50 border rounded p-3">{textLoading ? 'Loading...' : textContent}</pre>}
          {isOfficeDoc(ext) && (
            <div className="space-y-3">
              <iframe title={`${resource.name}-office`} src={officeViewUrl} className="w-full h-[70vh] border" />
              <p className="text-xs text-gray-500">如果预览为空，通常是文件当前无法被 Office Online 直接访问。</p>
            </div>
          )}
          {!isPdf && !isImage && !isText && !isOfficeDoc(ext) && (
            <div className="text-gray-600">
              当前格式不支持站内预览。
              <button type="button" onClick={() => openResourceInPlace(href)} className="text-indigo-600 ml-1">打开或下载</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ResourceUpload = () => {
  const [resources, setResources] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resourceMode, setResourceMode] = useState('file');
  const [filterCourseId, setFilterCourseId] = useState('');
  const [form, setForm] = useState({ name: '', course_id: '', url: '', file: null });
  const [previewResource, setPreviewResource] = useState(null);

  const fetchCourses = useCallback(async () => {
    const res = await axios.get(`${API_BASE}/teaching/courses`);
    setCourses(Array.isArray(res.data.data) ? res.data.data : []);
  }, []);

  const fetchResources = useCallback(async (courseId = filterCourseId) => {
    const params = {};
    if (courseId) params.course_id = courseId;
    const res = await axios.get(`${API_BASE}/teaching/resources`, { params });
    setResources(Array.isArray(res.data.data) ? res.data.data : []);
  }, [filterCourseId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchCourses(), fetchResources(filterCourseId)]);
    } catch (err) {
      alert('加载资源失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setLoading(false);
    }
  }, [fetchCourses, fetchResources, filterCourseId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (!form.course_id) throw new Error('请选择课程');
      if (resourceMode === 'file' && !form.file) throw new Error('请选择上传文件');
      if (resourceMode === 'link' && !form.url.trim()) throw new Error('请输入资源链接');

      const payload = new FormData();
      payload.append('name', form.name);
      payload.append('type', resourceMode);
      payload.append('course_id', form.course_id);
      if (resourceMode === 'link') payload.append('url', form.url);
      if (resourceMode === 'file') payload.append('file', form.file);

      await axios.post(`${API_BASE}/teaching/resources`, payload, { headers: { 'Content-Type': 'multipart/form-data' } });

      setForm({ name: '', course_id: '', url: '', file: null });
      await fetchResources();
      alert('资源上传成功');
    } catch (err) {
      alert('上传失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteResource = async (resource) => {
    if (!window.confirm(`确定删除资源“${resource.name}”吗？`)) return;
    try {
      await axios.delete(`${API_BASE}/teaching/resources/${resource.id}`);
      await fetchResources();
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
      alert(`打开资源失败: ${err.message}`);
    }
  };

  const getResourceHref = (url) => {
    if (!url) return '#';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return `${API_HOST}${url}`;
    return url;
  };

  return (
    <div className="space-y-6">
      <div className="surface-card motion-panel p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800"><Upload size={20} /> 统一资源上传</h2>
          <button onClick={loadData} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all duration-300 hover:-translate-y-0.5">
            <RefreshCw size={16} /> 刷新
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">资源名称</label>
              <input className="w-full p-3 border rounded-lg" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">所属课程</label>
              <select className="w-full p-3 border rounded-lg bg-white" value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })} required>
                <option value="">请选择课程</option>
                {courses.map((course) => (<option key={course.id} value={course.id}>{course.name}</option>))}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">资源类型</label>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setResourceMode('file'); setForm((prev) => ({ ...prev, url: '', file: null })); }} className={`px-4 py-2 rounded-lg border ${resourceMode === 'file' ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'border-gray-300 text-gray-600'}`}>文件</button>
                <button type="button" onClick={() => { setResourceMode('link'); setForm((prev) => ({ ...prev, url: '', file: null })); }} className={`px-4 py-2 rounded-lg border ${resourceMode === 'link' ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'border-gray-300 text-gray-600'}`}>链接</button>
              </div>
            </div>

            {resourceMode === 'file' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">上传文件</label>
                <input
                  type="file"
                  className="w-full p-3 border rounded-lg bg-white"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setForm((prev) => ({
                      ...prev,
                      file,
                      name: file && !prev.name.trim() ? filenameWithoutExt(file.name) : prev.name,
                    }));
                  }}
                  required
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">资源链接</label>
                <input type="url" className="w-full p-3 border rounded-lg" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/resource" required />
              </div>
            )}

            <button type="submit" disabled={submitting} className="w-full inline-flex justify-center items-center gap-2 px-4 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-60">
              <Upload size={18} /> {submitting ? '上传中...' : '上传资源'}
            </button>
          </div>
        </form>
      </div>

      <div className="surface-card motion-panel p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 text-gray-800 font-bold text-xl"><FileText size={20} /> 文件库</div>
          <select className="p-2 border rounded-lg bg-white" value={filterCourseId} onChange={async (e) => { const value = e.target.value; setFilterCourseId(value); await fetchResources(value); }}>
            <option value="">全部课程</option>
            {courses.map((course) => (<option key={course.id} value={course.id}>{course.name}</option>))}
          </select>
        </div>

        {loading ? (
          <div className="py-10 text-center text-gray-500">加载中...</div>
        ) : resources.length === 0 ? (
          <div className="py-10 text-center text-gray-400 border border-dashed rounded-xl">暂无资源</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-group">
            {resources.map((resource) => (
              <div key={resource.id} className="motion-card border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900">{resource.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{resource.course_name || '未关联课程'}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${resource.type === 'link' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {resource.type === 'link' ? '链接' : '文件'}
                  </span>
                </div>

                <div className="space-y-2 text-sm text-gray-600">
                  <p>所属章节：{resource.chapter_title || '未关联章节'}</p>
                  <p>上传人：{resource.uploader_name || '-'}</p>
                  <p>上传时间：{resource.created_at}</p>
                </div>

                <div className="mt-4 flex items-center gap-4">
                  {canPreviewResource(resource) && (
                    <button type="button" onClick={() => setPreviewResource(resource)} className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800">
                      <Eye size={16} /> 预览
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenResource(resource)}
                    className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800"
                  >
                    {resource.type === 'link' ? <ExternalLink size={16} /> : <LinkIcon size={16} />}
                    {resource.type === 'link' ? '打开链接' : canPreviewResource(resource) ? '下载文件' : '打开/下载'}
                  </button>
                  <button type="button" onClick={() => handleDeleteResource(resource)} className="inline-flex items-center gap-2 text-red-600 hover:text-red-800">
                    <Trash2 size={16} /> 删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {previewResource && (
        <ResourcePreviewModal
          resource={previewResource}
          href={previewResource.type === 'link' ? getResourceHref(previewResource.url) : `${API_HOST}${previewResource.preview_url || previewResource.download_url || previewResource.url}`}
          onClose={() => setPreviewResource(null)}
        />
      )}
    </div>
  );
};

export default ResourceUpload;

