import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { InvestmentPlaybookContent, PlaybookChapter, PlaybookSubsection } from '../../types/leadMagnetContent';

function PlaybookTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: { label: string; cells: string[] }[];
}) {
  if (rows.length === 0) return null;

  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-900 text-xs uppercase tracking-wide text-white">
          <tr>
            <th className="px-4 py-3 font-bold">Phân khúc</th>
            {headers.map(header => (
              <th key={header} className="px-4 py-3 font-bold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} className="border-t border-slate-100 odd:bg-slate-50/50">
              <td className="px-4 py-3 font-semibold text-slate-900">{row.label}</td>
              {row.cells.map((cell, index) => (
                <td key={index} className="px-4 py-3 align-top leading-relaxed text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubsectionPanel({ subsection, defaultOpen }: { subsection: PlaybookSubsection; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-slate-50"
      >
        <span className="text-sm font-extrabold text-slate-900">{subsection.title}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 pb-5 pt-4">
          <div className="space-y-4">
            {subsection.analysis.map((paragraph, index) => (
              <p key={index} className="text-[15px] leading-[1.75] text-slate-700">
                {paragraph}
              </p>
            ))}
          </div>

          <PlaybookTable headers={subsection.tableHeaders} rows={subsection.tableRows} />

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg bg-slate-900 px-4 py-3 text-sm leading-relaxed text-white">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Điểm then chốt</p>
              <p className="mt-2">{subsection.keyInsight}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Ai phù hợp</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{subsection.whoFits}</p>
            </div>
          </div>

          {subsection.watchPoints.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Điểm cần quan sát</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-relaxed text-slate-700">
                {subsection.watchPoints.map(point => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChapterSection({ chapter }: { chapter: PlaybookChapter }) {
  return (
    <section id={`playbook-${chapter.id}`} className="scroll-mt-24">
      <div className="mb-6 flex items-baseline gap-4 border-b border-slate-200 pb-4">
        <span className="font-mono text-3xl font-light text-slate-300">
          {String(chapter.number).padStart(2, '0')}
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Chương {chapter.number}</p>
          <h2 className="mt-1 text-xl font-extrabold text-slate-950 sm:text-2xl">{chapter.title}</h2>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tóm tắt</p>
        <p className="mt-2 text-[15px] leading-[1.75] text-slate-800">{chapter.executiveSummary}</p>
      </div>

      <div className="mt-6 space-y-3">
        {chapter.subsections.map((subsection, index) => (
          <SubsectionPanel key={subsection.id} subsection={subsection} defaultOpen={index === 0} />
        ))}
      </div>
    </section>
  );
}

export default function InvestmentPlaybookView({ content }: { content: InvestmentPlaybookContent }) {
  return (
    <div className="investment-playbook">
      <header className="border-b-2 border-slate-900 pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Sổ tay đầu tư BĐS</p>
        <p className="mt-2 text-sm text-slate-600">{content.publisher}</p>
        <p className="mt-1 text-xs text-slate-500">{content.edition}</p>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Mục lục</p>
            {content.chapters.map(chapter => (
              <a
                key={chapter.id}
                href={`#playbook-${chapter.id}`}
                className="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              >
                <span className="font-mono text-slate-400">{String(chapter.number).padStart(2, '0')}.</span>{' '}
                {chapter.title}
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-16">
          {content.chapters.map(chapter => (
            <ChapterSection key={chapter.id} chapter={chapter} />
          ))}

          <div className="rounded-xl border border-slate-900 bg-slate-950 px-5 py-6 text-center text-white">
            <p className="text-sm leading-relaxed text-slate-200">{content.closingMessage}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
