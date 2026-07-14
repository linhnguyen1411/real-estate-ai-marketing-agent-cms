import React, { FormEvent } from 'react';
import type { AppSettings } from '../../../types';
import { useSystemSettings, type SettingsNotify } from '../hooks/useSystemSettings';

type Props = {
  onNotify: SettingsNotify;
  onSettingsSaved?: (settings: AppSettings) => void;
};

export default function SystemSettingsPage({ onNotify, onSettingsSaved }: Props) {
  const {
    settings,
    setSettings,
    loading,
    error,
    actionLoading,
    save,
    testTelegram,
    testAgentSync,
    syncNow,
    showOutboxStatus,
  } = useSystemSettings(onSettingsSaved);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await save(onNotify);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Đang tải cấu hình…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-5 text-sm text-rose-200">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          Cổng cấu hình hệ thống AI Agent
        </h2>
        <p className="text-slate-400 text-sm">
          Chuyển đổi phương thức xử lý AI thông minh qua Gemini API hoặc Ollama local chạy cục bộ.
        </p>
      </div>

      <form onSubmit={onSubmit} className="bg-slate-900/40 p-6 rounded-2xl border border-slate-900 space-y-6 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300">Chế độ vận hành AI chính</label>
            <select
              value={settings.ai_mode}
              onChange={(e) => setSettings({ ...settings, ai_mode: e.target.value as AppSettings['ai_mode'] })}
              className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
            >
              <option value="auto">Auto: Ollama local, fallback ChatGPT</option>
              <option value="ollama">Ollama Local API Client</option>
              <option value="openai">OpenAI / ChatGPT API</option>
              <option value="gemini">Google Gemini API</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300">Giọng văn Agent định chuẩn Việt Nam</label>
            <input
              type="text"
              value={settings.agent_tone}
              onChange={(e) => setSettings({ ...settings, agent_tone: e.target.value })}
              placeholder="Mặc định: sang trọng và chuyên nghiệp"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300">Ollama API Endpoint (Nếu chọn Ollama)</label>
            <input
              type="text"
              value={settings.ollama_endpoint}
              onChange={(e) => setSettings({ ...settings, ollama_endpoint: e.target.value })}
              placeholder="Mặc định: http://localhost:11434"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300">Default Model Target (Ollama)</label>
            <input
              type="text"
              value={settings.ollama_model}
              onChange={(e) => setSettings({ ...settings, ollama_model: e.target.value })}
              placeholder="Mặc định: qwen3:8b"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300">OpenAI / ChatGPT Model Fallback</label>
            <input
              type="text"
              value={settings.openai_model}
              onChange={(e) => setSettings({ ...settings, openai_model: e.target.value })}
              placeholder="Mặc định: gpt-5-mini"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
          </div>
        </div>

        <div className="border-t border-slate-800 pt-6 space-y-4">
          <h3 className="text-sm font-bold text-white">Telegram</h3>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(settings.telegram_enabled)}
              onChange={e => setSettings({ ...settings, telegram_enabled: e.target.checked })}
              className="rounded border-slate-700 bg-slate-950"
            />
            Bật thông báo Telegram
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">Bot token</label>
              <input
                type="password"
                autoComplete="off"
                value={settings.telegram_bot_token || ''}
                onChange={e => setSettings({ ...settings, telegram_bot_token: e.target.value })}
                placeholder="•••••••• (không hiện lại sau lưu nếu mask)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">Chat ID</label>
              <input
                type="text"
                value={settings.telegram_chat_id || ''}
                onChange={e => setSettings({ ...settings, telegram_chat_id: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">Điểm tối thiểu</label>
              <input
                type="number"
                value={settings.telegram_min_score ?? 70}
                onChange={e => setSettings({ ...settings, telegram_min_score: Number(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={settings.telegram_only_with_phone !== false}
              onChange={e => setSettings({ ...settings, telegram_only_with_phone: e.target.checked })}
              className="rounded border-slate-700 bg-slate-950"
            />
            Chỉ gửi khi có số điện thoại
          </label>
          <div className="flex flex-wrap gap-4 text-xs text-slate-300">
            {([
              { key: 'telegram_include_phone' as const, label: 'Gồm SĐT' },
              { key: 'telegram_include_budget' as const, label: 'Gồm ngân sách' },
              { key: 'telegram_include_location' as const, label: 'Gồm vị trí' },
              { key: 'telegram_include_link' as const, label: 'Gồm link bài' },
            ]).map(item => (
              <label key={item.key} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings[item.key] !== false}
                  onChange={e => setSettings({ ...settings, [item.key]: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-950"
                />
                {item.label}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void testTelegram(onNotify)}
            disabled={actionLoading === 'test-telegram'}
            className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-900 disabled:opacity-50"
          >
            {actionLoading === 'test-telegram' ? 'Đang gửi…' : 'Test Telegram'}
          </button>
        </div>

        <div className="border-t border-slate-800 pt-6 space-y-4">
          <h3 className="text-sm font-bold text-white">AI Agent — Đồng bộ VPS</h3>
          {settings.agent_sync_enabled ? (
            <p className="rounded-lg border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100">
              Dữ liệu mới (Source + Nội dung quét + Finding) sẽ được lưu local và đồng bộ lên VPS production.
              Máy này là bot quét / cache; CMS production lấy dữ liệu từ VPS.
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(settings.agent_sync_enabled)}
              onChange={e => setSettings({ ...settings, agent_sync_enabled: e.target.checked })}
              className="rounded border-slate-700 bg-slate-950"
            />
            Bật đồng bộ VPS
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300">VPS URL</label>
              <input
                type="text"
                value={settings.agent_sync_vps_url || ''}
                onChange={e => setSettings({ ...settings, agent_sync_vps_url: e.target.value })}
                placeholder="https://…"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">Key ID</label>
              <input
                type="text"
                value={settings.agent_sync_key_id || ''}
                onChange={e => setSettings({ ...settings, agent_sync_key_id: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">Secret</label>
              <input
                type="password"
                autoComplete="off"
                value={settings.agent_sync_secret || ''}
                onChange={e => setSettings({ ...settings, agent_sync_secret: e.target.value })}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">Company ID</label>
              <input
                type="text"
                value={settings.agent_sync_company_id || ''}
                onChange={e => setSettings({ ...settings, agent_sync_company_id: e.target.value })}
                placeholder="comp-da-nang"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">Worker ID</label>
              <input
                type="text"
                value={settings.agent_sync_worker_id || ''}
                onChange={e => setSettings({ ...settings, agent_sync_worker_id: e.target.value })}
                placeholder="local-worker-1"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">Batch size</label>
              <input
                type="number"
                value={settings.agent_sync_batch_size ?? 20}
                onChange={e => setSettings({ ...settings, agent_sync_batch_size: Number(e.target.value) || 1 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">Timeout (ms)</label>
              <input
                type="number"
                value={settings.agent_sync_timeout_ms ?? 15000}
                onChange={e => setSettings({ ...settings, agent_sync_timeout_ms: Number(e.target.value) || 1000 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Secret không hiển thị lại sau lưu (mask). Để trống secret nếu không đổi.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void testAgentSync(onNotify)}
              disabled={actionLoading === 'test-agent-sync'}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-900 disabled:opacity-50"
            >
              {actionLoading === 'test-agent-sync' ? 'Đang kiểm tra…' : 'Test connection'}
            </button>
            <button
              type="button"
              onClick={() => void syncNow(onNotify)}
              disabled={actionLoading === 'flush-agent-sync'}
              className="rounded-xl border border-emerald-800/60 px-4 py-2 text-xs font-bold text-emerald-200 hover:bg-slate-900 disabled:opacity-50"
            >
              {actionLoading === 'flush-agent-sync' ? 'Đang sync…' : 'Sync now'}
            </button>
            <button
              type="button"
              onClick={() => void showOutboxStatus(onNotify)}
              disabled={actionLoading === 'status-agent-sync'}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-900 disabled:opacity-50"
            >
              Xem outbox status
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Backfill dữ liệu cũ:{' '}
            <code className="text-slate-300">npm run agent:enqueue-unsynced-data -- --apply --limit 20</code>
          </p>
        </div>

        <div className="p-4 bg-slate-950 rounded-xl border border-slate-900/80 text-xs text-slate-400 leading-relaxed space-y-1.5">
          <strong className="text-rose-400 block font-bold">LỜI KHUYÊN DÀNH CHO DEVELOPERS:</strong>
          <p>
            Hệ thống tự động đồng bộ hóa cấu hình về file{' '}
            <span className="text-white font-mono font-bold">db.json</span> vĩnh viễn khóa gối đầu ở server side.
          </p>
          <p>
            Sử dụng phím Settings Secrets ở ngoài thanh bên AI Studio để ghi đè{' '}
            <span className="text-white font-mono font-bold">GEMINI_API_KEY</span> chính xác khi chạy production.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-900">
          <button
            type="submit"
            disabled={actionLoading === 'save-settings'}
            className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs py-2.5 px-6 rounded-xl shadow-md transition-all"
          >
            {actionLoading === 'save-settings' ? 'Đang lưu thiết lập...' : 'Cập nhật thiết lập'}
          </button>
        </div>
      </form>
    </div>
  );
}
