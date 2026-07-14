import React from 'react';
import { X } from 'lucide-react';
import type { AgentFinding } from '../../../../types/agentPlatform';

export type MatchResultData = {
  official: Array<Record<string, unknown>>;
  external: Array<Record<string, unknown>>;
  missingReason: string | null;
};

type Props = {
  finding: AgentFinding;
  matchData: MatchResultData | null;
  onClose: () => void;
};

export default function MatchingPanel({ finding, matchData, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Matching — {finding.title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {!matchData ? (
          <p className="text-xs text-slate-500">Đang tìm khớp…</p>
        ) : (
          <div className="space-y-4">
            {matchData.missingReason && (
              <p className="text-xs text-amber-400">{matchData.missingReason}</p>
            )}
            <section>
              <h4 className="mb-2 text-xs font-bold uppercase text-emerald-400">
                Giỏ hàng chính thức
              </h4>
              {matchData.official.length === 0 ? (
                <p className="text-xs text-slate-600">Không có kết quả</p>
              ) : (
                <ul className="space-y-2">
                  {matchData.official.map(item => (
                    <li
                      key={String(item.itemId)}
                      className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs"
                    >
                      <div className="font-semibold text-slate-200">{String(item.title)}</div>
                      <div className="mt-1 text-slate-500">
                        Điểm {String(item.matchScore)} · {String(item.location || '—')}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h4 className="mb-2 text-xs font-bold uppercase text-amber-400">
                Giỏ hàng ngoài — chưa xác minh
              </h4>
              {matchData.external.length === 0 ? (
                <p className="text-xs text-slate-600">Không có kết quả</p>
              ) : (
                <ul className="space-y-2">
                  {matchData.external.map(item => (
                    <li
                      key={String(item.itemId)}
                      className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-xs"
                    >
                      <div className="font-semibold text-slate-200">{String(item.title)}</div>
                      <div className="mt-1 text-slate-500">
                        Điểm {String(item.matchScore)} · {String(item.location || '—')} ·{' '}
                        {String(item.contact || '—')}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
