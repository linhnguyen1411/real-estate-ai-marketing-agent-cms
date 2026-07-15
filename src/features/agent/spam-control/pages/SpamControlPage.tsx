import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createSpamRule,
  deleteSpamRule,
  fetchSpamRules,
  normalizeSpamPhone,
  patchSpamRule,
  testSpamPolicy,
} from '../../../../services/agentPlatformApi';
import type { AgentSpamRule } from '../../../../types/agentPlatform';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from '../../shared/AgentPlatformUi';

type TabId = 'phone' | 'author' | 'keyword' | 'domain' | 'source' | 'whitelist' | 'history';

const TABS: { id: TabId; label: string; types: string[]; action?: string }[] = [
  { id: 'phone', label: 'Số điện thoại', types: ['phone'] },
  { id: 'author', label: 'Người đăng / Profile', types: ['author_name', 'author_profile_url', 'page_url'] },
  { id: 'keyword', label: 'Từ khóa', types: ['keyword', 'keyword_phrase', 'regex'] },
  { id: 'domain', label: 'Domain / URL', types: ['domain', 'canonical_url', 'content_hash'] },
  { id: 'source', label: 'Source', types: ['source'] },
  { id: 'whitelist', label: 'Whitelist', types: [], action: 'allow' },
  { id: 'history', label: 'Lịch sử chặn', types: [], action: 'block' },
];

type Props = { canManage: boolean };

export default function SpamControlPage({ canManage }: Props) {
  const [tab, setTab] = useState<TabId>('phone');
  const [rows, setRows] = useState<AgentSpamRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [phoneRaw, setPhoneRaw] = useState('');
  const [phonePreview, setPhonePreview] = useState<{ normalizedValue: string; e164Value: string } | null>(null);
  const [label, setLabel] = useState('');
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<'block' | 'allow'>('block');
  const [expiresAt, setExpiresAt] = useState('');
  const [genericRaw, setGenericRaw] = useState('');
  const [genericType, setGenericType] = useState('keyword_phrase');
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);

  const activeTab = TABS.find(t => t.id === tab)!;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number | boolean | undefined> = {
        page: 1,
        limit: 100,
        search: search || undefined,
      };
      if (activeTab.action) params.action = activeTab.action;
      if (activeTab.types.length === 1) params.type = activeTab.types[0];
      const res = await fetchSpamRules(params);
      let data = res.data;
      if (activeTab.types.length > 1) {
        data = data.filter(r => activeTab.types.includes(r.type));
      }
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được rules');
    } finally {
      setLoading(false);
    }
  }, [activeTab, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab !== 'phone' || !phoneRaw.trim()) {
      setPhonePreview(null);
      return;
    }
    const t = setTimeout(() => {
      void normalizeSpamPhone(phoneRaw)
        .then(setPhonePreview)
        .catch(() => setPhonePreview(null));
    }, 250);
    return () => clearTimeout(t);
  }, [phoneRaw, tab]);

  const onCreatePhone = async () => {
    if (!canManage || !phoneRaw.trim()) return;
    setSaving(true);
    try {
      await createSpamRule({
        type: 'phone',
        action,
        rawValue: phoneRaw.trim(),
        label: label || undefined,
        reason: reason || undefined,
        expiresAt: expiresAt || null,
      });
      setPhoneRaw('');
      setLabel('');
      setReason('');
      setExpiresAt('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tạo rule thất bại');
    } finally {
      setSaving(false);
    }
  };

  const onCreateGeneric = async () => {
    if (!canManage || !genericRaw.trim()) return;
    setSaving(true);
    try {
      await createSpamRule({
        type: genericType,
        action: tab === 'whitelist' ? 'allow' : action,
        rawValue: genericRaw.trim(),
        label: label || undefined,
        reason: reason || undefined,
        expiresAt: expiresAt || null,
      });
      setGenericRaw('');
      setLabel('');
      setReason('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tạo rule thất bại');
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (row: AgentSpamRule) => {
    await patchSpamRule(row.id, { isActive: !row.isActive });
    await load();
  };

  const onArchive = async (row: AgentSpamRule) => {
    if (!confirm('Ẩn (soft-delete) rule này?')) return;
    await deleteSpamRule(row.id);
    await load();
  };

  const onTest = async () => {
    try {
      const data = await testSpamPolicy({ contentText: testText });
      setTestResult(
        `${data.decision.decision} | ${data.decision.primaryReason || '—'} | hardGate=${data.decision.hardGate} | rules=${data.rulesLoaded}`,
      );
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : 'Test lỗi');
    }
  };

  const typeOptions = useMemo(() => {
    if (tab === 'author') return ['author_name', 'author_profile_url', 'page_url'];
    if (tab === 'keyword') return ['keyword_phrase', 'keyword'];
    if (tab === 'domain') return ['domain', 'canonical_url', 'content_hash'];
    if (tab === 'source') return ['source'];
    return ['keyword_phrase'];
  }, [tab]);

  useEffect(() => {
    setGenericType(typeOptions[0]);
  }, [typeOptions]);

  return (
    <div className="space-y-4">
      <AgentPanelHeader
        title="Spam & Block Rules"
        subtitle="Chặn số điện thoại, người đăng, từ khóa trước khi AI / Finding / Telegram."
      />

      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              tab === t.id
                ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                : 'text-slate-500 border border-transparent hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {canManage && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
          <div className="text-xs font-semibold text-slate-300">Thêm rule</div>
          {tab === 'phone' ? (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs text-slate-400">
                Số điện thoại
                <input
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  value={phoneRaw}
                  onChange={e => setPhoneRaw(e.target.value)}
                  placeholder="0905 777 594 / +84905777594"
                />
                {phonePreview && (
                  <span className="mt-1 block text-[11px] text-emerald-400">
                    Preview: {phonePreview.normalizedValue} · {phonePreview.e164Value}
                  </span>
                )}
              </label>
              <label className="block text-xs text-slate-400">
                Hành động
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  value={action}
                  onChange={e => setAction(e.target.value as 'block' | 'allow')}
                >
                  <option value="block">Block</option>
                  <option value="allow">Allow (whitelist)</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs text-slate-400">
                Loại
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  value={genericType}
                  onChange={e => setGenericType(e.target.value)}
                >
                  {typeOptions.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-400">
                Giá trị
                <input
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  value={genericRaw}
                  onChange={e => setGenericRaw(e.target.value)}
                  placeholder={tab === 'keyword' ? 'tuyển sale' : 'giá trị rule'}
                />
              </label>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block text-xs text-slate-400">
              Nhãn
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                value={label}
                onChange={e => setLabel(e.target.value)}
              />
            </label>
            <label className="block text-xs text-slate-400">
              Lý do
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </label>
            <label className="block text-xs text-slate-400">
              Hết hạn (optional)
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void (tab === 'phone' ? onCreatePhone() : onCreateGeneric())}
            className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {saving ? 'Đang lưu…' : 'Lưu rule'}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-xs text-slate-400">
          Tìm kiếm
          <input
            className="mt-1 block w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="số / nhãn / lý do"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300"
        >
          Làm mới
        </button>
      </div>

      {error && <AgentPanelError message={error} />}
      {loading ? (
        <AgentPanelLoader />
      ) : rows.length === 0 ? (
        <AgentPanelEmpty title="Chưa có rule nào." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-t border-slate-800 text-slate-200">
                  <td className="px-3 py-2">{row.type}</td>
                  <td className="px-3 py-2">{row.action}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">
                    {row.normalizedValue || row.rawValue}
                    {row.e164Value ? (
                      <span className="block text-slate-500">{row.e164Value}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{row.label || row.reason || '—'}</td>
                  <td className="px-3 py-2">{row.isActive ? 'yes' : 'no'}</td>
                  <td className="px-3 py-2">{formatAgentDate(row.updatedAt)}</td>
                  <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                    {canManage && (
                      <>
                        <button type="button" className="text-amber-300" onClick={() => void onToggle(row)}>
                          {row.isActive ? 'Tắt' : 'Bật'}
                        </button>
                        <button type="button" className="text-rose-300" onClick={() => void onArchive(row)}>
                          Xóa
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
        <div className="text-xs font-semibold text-slate-300">Test policy</div>
        <textarea
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white min-h-[80px]"
          value={testText}
          onChange={e => setTestText(e.target.value)}
          placeholder="Dán nội dung bài viết để thử…"
        />
        <button
          type="button"
          onClick={() => void onTest()}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200"
        >
          Chạy test
        </button>
        {testResult && <div className="text-xs text-emerald-300 font-mono">{testResult}</div>}
      </div>
    </div>
  );
}
