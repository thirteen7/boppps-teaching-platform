import React, { useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';

const chartExportImage = (chartRef, filename) => {
  const inst = chartRef?.current?.getEchartsInstance?.();
  if (!inst) return;
  const url = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
};

const AssessmentAnalyticsCharts = ({ analytics, selectedAssessmentId }) => {
  const scoreDistributionChartRef = useRef(null);
  const questionAccuracyChartRef = useRef(null);
  const studentRadarChartRef = useRef(null);

  const scoreDistributionOption = useMemo(() => {
    const dist = analytics?.score_distribution || {};
    const labels = Object.keys(dist).map((k) => k.replace('_', '-'));
    const values = Object.values(dist).map((x) => Number(x || 0));
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 30, bottom: 30 },
      xAxis: { type: 'category', data: labels },
      yAxis: { type: 'value', name: '人数', minInterval: 1 },
      series: [{ type: 'bar', data: values, itemStyle: { color: '#4f46e5' }, barMaxWidth: 48 }],
    };
  }, [analytics]);

  const questionAccuracyOption = useMemo(() => {
    const stats = analytics?.question_stats || [];
    const labels = stats.map((_, idx) => `Q${idx + 1}`);
    const values = stats.map((q) => Number(q.accuracy || 0));
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 30, bottom: 30 },
      xAxis: { type: 'category', data: labels },
      yAxis: { type: 'value', name: '正确率%', min: 0, max: 100 },
      series: [{
        type: 'line',
        smooth: true,
        data: values,
        symbolSize: 8,
        areaStyle: { opacity: 0.12 },
        lineStyle: { width: 3, color: '#f59e0b' },
        itemStyle: { color: '#f59e0b' },
      }],
    };
  }, [analytics]);

  const topStudentsRadarOption = useMemo(() => {
    const stats = (analytics?.student_stats || []).slice(0, 6);
    const indicators = [
      { name: '得分', max: 100 },
      { name: '正确题数', max: Math.max(1, analytics?.assessment?.question_count || 1) },
      { name: '正确率', max: 100 },
    ];
    const seriesData = stats.map((s) => {
      const qCount = Math.max(1, Number(s.question_count || 1));
      const acc = (Number(s.correct_count || 0) / qCount) * 100;
      return {
        name: s.student_name || s.student_username,
        value: [Number(s.score || 0), Number(s.correct_count || 0), Number(acc.toFixed(2))],
      };
    });
    return {
      tooltip: {},
      legend: { type: 'scroll', bottom: 0, data: seriesData.map((x) => x.name) },
      radar: { indicator: indicators, radius: '60%' },
      series: [{ type: 'radar', data: seriesData }],
    };
  }, [analytics]);

  const exportAnalyticsCsv = () => {
    if (!analytics) return;
    const lines = [];
    lines.push(['类型', '名称', '值1', '值2', '值3'].join(','));
    lines.push(['测验概览', analytics.assessment?.title || '', analytics.assessment?.average_score || 0, analytics.assessment?.submission_count || 0, analytics.participation?.participation_rate || 0].join(','));
    (analytics.question_stats || []).forEach((q) => {
      lines.push(['题目统计', `"${String(q.content || '').replace(/"/g, '""')}"`, q.accuracy ?? '', q.attempts ?? 0, q.correct_count ?? 0].join(','));
    });
    (analytics.student_stats || []).forEach((s) => {
      lines.push(['学生统计', s.student_name || s.student_username || '', s.score ?? 0, s.correct_count ?? 0, s.rank ?? ''].join(','));
    });
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assessment_${selectedAssessmentId}_analytics.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => chartExportImage(scoreDistributionChartRef, `assessment_${selectedAssessmentId}_score_dist.png`)} className="px-2 py-1 border rounded text-xs">
          导出分数分布图(PNG)
        </button>
        <button type="button" onClick={() => chartExportImage(questionAccuracyChartRef, `assessment_${selectedAssessmentId}_question_accuracy.png`)} className="px-2 py-1 border rounded text-xs">
          导出题目正确率图(PNG)
        </button>
        <button type="button" onClick={() => chartExportImage(studentRadarChartRef, `assessment_${selectedAssessmentId}_student_radar.png`)} className="px-2 py-1 border rounded text-xs">
          导出学生雷达图(PNG)
        </button>
        <button type="button" onClick={exportAnalyticsCsv} className="px-2 py-1 border rounded text-xs">
          导出分析数据(CSV)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="border rounded p-3">
          <div className="font-medium text-gray-800 mb-2">分数分布（柱状图）</div>
          <ReactECharts ref={scoreDistributionChartRef} option={scoreDistributionOption} style={{ height: 280 }} />
        </div>
        <div className="border rounded p-3">
          <div className="font-medium text-gray-800 mb-2">题目正确率趋势（折线图）</div>
          <ReactECharts ref={questionAccuracyChartRef} option={questionAccuracyOption} style={{ height: 280 }} />
        </div>
      </div>

      <div className="border rounded p-3">
        <div className="font-medium text-gray-800 mb-2">学生表现对比（雷达图，取前6名）</div>
        <ReactECharts ref={studentRadarChartRef} option={topStudentsRadarOption} style={{ height: 360 }} />
      </div>
    </div>
  );
};

export default AssessmentAnalyticsCharts;
