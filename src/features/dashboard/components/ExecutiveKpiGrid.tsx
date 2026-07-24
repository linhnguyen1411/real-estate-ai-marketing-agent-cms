import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData, ExecutiveKpiCard } from '../../../services/api';

type Props = {
  data: DashboardData;
};

const TITLE_EMOJI: Record<string, string> = {
  ai_status: '🤖',
  todays_buyers: '🎯',
  sales_pipeline: '📈',
  active_campaigns: '🚀',
  content_engine: '📝',
  publishing: '📢',
  lead_acquisition: '🔎',
  attention: '⚠',
};

function trendClass(dir: ExecutiveKpiCard['trendDirection']) {
  if (dir === 'up') return 'text-emerald-400';
  if (dir === 'down') return 'text-rose-400';
  return 'text-slate-500';
}

function openLabel(href: string) {
  if (href.includes('lead-center')) return 'Open Lead Center';
  if (href.includes('campaign-center')) return 'Open Campaign Center';
  if (href.includes('publishing')) return 'Open Publishing';
  if (href.includes('decision-center')) return 'Open Decision';
  if (href.includes('agents')) return 'Open Executive';
  return 'Open module';
}

export default function ExecutiveKpiGrid({ data }: Props) {
  const navigate = useNavigate();
  const kpis = data.kpis || [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Executive Dashboard</h2>
          <p className="text-sm text-slate-400">
            AI Sales Employee — buyers, pipeline, campaign, content, publishing.
          </p>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-950/40 px-4 py-2 font-mono text-xs text-rose-300">
          {data.generatedAt
            ? new Date(data.generatedAt).toLocaleString('vi-VN')
            : new Date().toLocaleString('vi-VN')}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {kpis.map(card => (
          <button
            key={card.id}
            type="button"
            onClick={() => navigate(card.href)}
            className="flex min-h-[168px] flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-left transition hover:border-rose-500/30 hover:bg-slate-900/80"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                <span className="mr-1.5" aria-hidden>
                  {TITLE_EMOJI[card.id] || '•'}
                </span>
                {card.title}
              </span>
            </div>

            <div className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              {card.bigNumber}
            </div>

            {card.trend ? (
              <div className={`mt-1 text-xs font-medium ${trendClass(card.trendDirection)}`}>
                {card.trend}
              </div>
            ) : (
              <div className="mt-1 text-xs text-slate-600">—</div>
            )}

            <ul className="mt-3 space-y-0.5 text-[11px] leading-snug text-slate-500">
              {card.miniStatus.slice(0, 4).map(line => (
                <li key={line} className="truncate">
                  {line}
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-3 text-[11px] font-semibold text-rose-300/90">
              {openLabel(card.href)} →
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
