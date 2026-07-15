import React, { useCallback, useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { getAutomations, runDemoAutomations, toggleAutomation } from '../../../services/api';
import type { AutomationTask } from '../../../types';

type Notify = (message: string, type?: 'success' | 'error' | 'info') => void;

type Props = { onNotify: Notify };

export default function AutomationsPage({ onNotify }: Props) {
  const [automations, setAutomations] = useState<AutomationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAutomations(await getAutomations());
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'Không tải automations.', 'error');
      setAutomations([]);
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = async (id: string) => {
    setActionLoading(`toggle-${id}`);
    try {
      const updated = await toggleAutomation(id);
      setAutomations(prev => prev.map(item => (item.id === updated.id ? updated : item)));
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'Không đổi trạng thái.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunDemo = async () => {
    setActionLoading('run-automations');
    try {
      const next = await runDemoAutomations();
      setAutomations(next);
      onNotify('Đã chạy thử automation.', 'success');
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'Chạy thử thất bại.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Đang tải automation…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Trung tâm Tự Động Hóa AI Automation Center
          </h2>
          <p className="text-slate-400 text-sm">Thiết lập các workflow sự kiện tự động kích hoạt AI xử lý thông tin.</p>
        </div>
        <button
          onClick={() => void handleRunDemo()}
          disabled={actionLoading === 'run-automations'}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-md"
        >
          <Play className="w-3.5 h-3.5" /> Chạy thử toàn diện (Simulate)
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {automations.map(auto => (
          <div
            key={auto.id}
            className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900 flex flex-col justify-between hover:border-slate-800 transition-all space-y-4"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-white text-sm">{auto.name}</h3>
                  <span className="text-2xs text-rose-400 font-mono">Trigger: {auto.trigger_event}</span>
                </div>
                <button
                  onClick={() => void handleToggle(auto.id)}
                  disabled={actionLoading === `toggle-${auto.id}`}
                  className={`px-3 py-1.5 rounded-lg text-2xs font-extrabold transition-all border ${
                    auto.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-slate-950 text-slate-500 border-slate-900'
                  }`}
                >
                  {auto.status === 'active' ? '● RUNNING' : '○ PAUSED'}
                </button>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">{auto.action_description}</p>
            </div>
            <div className="flex justify-between text-2xs text-slate-500 border-t border-slate-900/85 pt-3">
              <span>
                Chạy được: <strong>{auto.run_count} lần</strong>
              </span>
              <span>Đồng bộ: {auto.last_run ? new Date(auto.last_run).toLocaleTimeString() : 'Chưa chạy'}</span>
            </div>
            {auto.logs && auto.logs.length > 0 && (
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-900/80 font-mono text-3xs text-slate-400 space-y-1 overflow-y-auto max-h-24">
                <span className="text-slate-500 block">NHẬT KÝ LIVE TRUY VẤN:</span>
                {auto.logs.map((log, lidx) => (
                  <p key={lidx}>{log}</p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
