import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Activity, RefreshCw, Search, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

const API_BASE = '/api';

const SystemLogs = () => {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({ today_count: 0, week_count: 0, active_users: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');

  const [filters, setFilters] = useState({
    keyword: '',
    username: '',
    date_from: '',
    date_to: '',
  });
  const [form, setForm] = useState(filters);
  const [sortBy, setSortBy] = useState('time');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await axios.get(`${API_BASE}/admin/logs`, {
        params: {
          with_meta: 1,
          page,
          per_page: perPage,
          sort_by: sortBy,
          order,
          keyword: filters.keyword || undefined,
          username: filters.username || undefined,
          date_from: filters.date_from || undefined,
          date_to: filters.date_to || undefined,
        },
      });
      const payload = res.data?.data || {};
      setLogs(Array.isArray(payload.items) ? payload.items : []);
      setTotal(Number(payload.total || 0));
      setTotalPages(Math.max(1, Number(payload.total_pages || 1)));
      setSummary(payload.summary || { today_count: 0, week_count: 0, active_users: 0 });
      setLastUpdatedAt(new Date().toLocaleString('zh-CN'));
    } catch (err) {
      alert('获取系统日志失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters, page, perPage, sortBy, order]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => fetchLogs(true), 8000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchLogs]);

  const startIndex = useMemo(() => (total === 0 ? 0 : (page - 1) * perPage + 1), [total, page, perPage]);
  const endIndex = useMemo(() => Math.min(total, page * perPage), [total, page, perPage]);

  const applyFilters = () => {
    setFilters({ ...form });
    setPage(1);
  };

  const resetFilters = () => {
    const empty = { keyword: '', username: '', date_from: '', date_to: '' };
    setForm(empty);
    setFilters(empty);
    setPage(1);
    setSortBy('time');
    setOrder('desc');
  };

  const toggleSort = (field) => {
    if (sortBy === field) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(field);
    setOrder('desc');
  };

  return (
    <div className="surface-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
          <Activity size={20} />
          系统日志
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`px-3 py-2 rounded-lg border text-sm ${autoRefresh ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-200 text-gray-600'}`}
          >
            自动刷新 {autoRefresh ? '开' : '关'}
          </button>
          <button
            onClick={() => fetchLogs(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
            disabled={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            快速刷新
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border border-gray-200 p-3">
          <div className="text-xs text-gray-500">今日日志</div>
          <div className="text-xl font-semibold text-gray-800">{summary.today_count || 0}</div>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <div className="text-xs text-gray-500">近7天日志</div>
          <div className="text-xl font-semibold text-gray-800">{summary.week_count || 0}</div>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <div className="text-xs text-gray-500">活跃用户数</div>
          <div className="text-xl font-semibold text-gray-800">{summary.active_users || 0}</div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 mb-4 bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2">
            <label className="text-xs text-gray-500">关键词（操作/IP/用户）</label>
            <div className="relative mt-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={form.keyword}
                onChange={(e) => setForm((prev) => ({ ...prev, keyword: e.target.value }))}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="输入关键词"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">用户</label>
            <input
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="用户名"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">开始日期</label>
            <input
              type="date"
              value={form.date_from}
              onChange={(e) => setForm((prev) => ({ ...prev, date_from: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">结束日期</label>
            <input
              type="date"
              value={form.date_to}
              onChange={(e) => setForm((prev) => ({ ...prev, date_to: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
          <div className="text-xs text-gray-500">
            最近更新时间：{lastUpdatedAt || '-'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={resetFilters}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 text-sm"
            >
              重置
            </button>
            <button
              onClick={applyFilters}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm"
            >
              查询
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-500">正在加载日志...</div>
      ) : logs.length === 0 ? (
        <div className="py-10 text-center text-gray-400 border border-dashed rounded-xl">
          暂无系统日志
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="p-4 border-b">
                    <button className="inline-flex items-center gap-1" onClick={() => toggleSort('username')}>
                      用户
                      <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th className="p-4 border-b">
                    <button className="inline-flex items-center gap-1" onClick={() => toggleSort('action')}>
                      操作
                      <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th className="p-4 border-b">IP</th>
                  <th className="p-4 border-b">
                    <button className="inline-flex items-center gap-1" onClick={() => toggleSort('time')}>
                      时间
                      <ArrowUpDown size={12} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="p-4 text-gray-800 font-medium">{log.username || '-'}</td>
                    <td className="p-4 text-gray-600">{log.action}</td>
                    <td className="p-4 text-gray-500 font-mono text-sm">{log.ip || '-'}</td>
                    <td className="p-4 text-gray-500 text-sm">{log.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-white border-t border-gray-200">
            <div className="text-sm text-gray-500">
              共 {total} 条，当前显示 {startIndex}-{endIndex}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={perPage}
                onChange={(e) => {
                  setPerPage(Number(e.target.value));
                  setPage(1);
                }}
                className="px-2 py-1 rounded border border-gray-300 text-sm"
              >
                <option value={10}>10 / 页</option>
                <option value={20}>20 / 页</option>
                <option value={50}>50 / 页</option>
                <option value={100}>100 / 页</option>
              </select>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 disabled:opacity-50"
              >
                <ChevronLeft size={14} />
                上一页
              </button>
              <span className="text-sm text-gray-600">
                第 {page} / {totalPages} 页
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 disabled:opacity-50"
              >
                下一页
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemLogs;

