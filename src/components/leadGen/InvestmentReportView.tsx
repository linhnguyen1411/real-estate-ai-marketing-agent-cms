import type { InvestmentReportContent, ReportChapterBlock } from '../../types/leadMagnetContent';

function ProseBlock({ heading, paragraphs }: { heading?: string; paragraphs: string[] }) {
  return (
    <div className="space-y-4">
      {heading && <h3 className="text-base font-bold text-slate-900">{heading}</h3>}
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="text-[15px] leading-[1.75] text-slate-700">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function ZoneFocusBlock({ zone, paragraphs }: { zone: string; paragraphs: string[] }) {
  return (
    <div className="border-l-4 border-slate-900 pl-5">
      <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900">{zone}</h3>
      <div className="mt-3 space-y-3">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="text-[15px] leading-[1.75] text-slate-700">
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}

function ProductSegmentBlock({
  name,
  buyerProfile,
  renterProfile,
  liquidity,
  strengths,
  limitations,
  strategyFit,
}: Extract<ReportChapterBlock, { kind: 'product-segment' }>) {
  const rows = [
    { label: 'Khách mua', value: buyerProfile },
    { label: 'Khách thuê', value: renterProfile },
    { label: 'Thanh khoản', value: liquidity },
    { label: 'Ưu điểm', value: strengths },
    { label: 'Hạn chế', value: limitations },
    { label: 'Chiến lược phù hợp', value: strategyFit },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-900 px-4 py-3">
        <h3 className="text-sm font-extrabold tracking-wide text-white">{name}</h3>
      </div>
      <dl className="divide-y divide-slate-100">
        {rows.map(row => (
          <div key={row.label} className="grid gap-2 px-4 py-3 sm:grid-cols-[140px_1fr]">
            <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{row.label}</dt>
            <dd className="text-sm leading-relaxed text-slate-700">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function FactorBlock({ factor, analysis }: Extract<ReportChapterBlock, { kind: 'factor' }>) {
  return (
    <div>
      <h3 className="text-sm font-extrabold text-slate-900">{factor}</h3>
      <p className="mt-2 text-[15px] leading-[1.75] text-slate-700">{analysis}</p>
    </div>
  );
}

function DueDiligenceBlock({ topic, guidance }: Extract<ReportChapterBlock, { kind: 'due-diligence' }>) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-4">
      <h3 className="text-sm font-extrabold text-slate-900">{topic}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{guidance}</p>
    </div>
  );
}

function ChapterBlock({ block }: { block: ReportChapterBlock }) {
  switch (block.kind) {
    case 'prose':
      return <ProseBlock heading={block.heading} paragraphs={block.paragraphs} />;
    case 'zone-focus':
      return <ZoneFocusBlock zone={block.zone} paragraphs={block.paragraphs} />;
    case 'product-segment':
      return <ProductSegmentBlock {...block} />;
    case 'factor':
      return <FactorBlock {...block} />;
    case 'due-diligence':
      return <DueDiligenceBlock {...block} />;
    default:
      return null;
  }
}

export default function InvestmentReportView({ content }: { content: InvestmentReportContent }) {
  return (
    <div className="investment-report">
      <header className="border-b-2 border-slate-900 pb-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Investment Report</p>
        <p className="mt-2 text-sm text-slate-600">{content.publisher}</p>
        <p className="mt-1 text-xs text-slate-500">{content.edition}</p>
        <nav className="mt-8 hidden border-t border-slate-200 pt-6 lg:block">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Mục lục</p>
          <ol className="mt-3 space-y-2">
            {content.chapters.map(chapter => (
              <li key={chapter.number}>
                <a
                  href={`#report-chapter-${chapter.number}`}
                  className="text-sm text-slate-700 hover:text-slate-950"
                >
                  <span className="font-mono text-slate-400">0{chapter.number}.</span> {chapter.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <div className="mt-10 space-y-16">
        {content.chapters.map(chapter => (
          <section
            key={chapter.number}
            id={`report-chapter-${chapter.number}`}
            className="scroll-mt-8"
          >
            <div className="mb-8 flex items-baseline gap-4 border-b border-slate-200 pb-4">
              <span className="font-mono text-3xl font-light text-slate-300">
                {String(chapter.number).padStart(2, '0')}
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Chương {chapter.number}
                </p>
                <h2 className="mt-1 text-xl font-extrabold leading-snug text-slate-950 sm:text-2xl">
                  {chapter.title}
                </h2>
              </div>
            </div>
            <div className="space-y-8">
              {chapter.blocks.map(block => (
                <ChapterBlock key={block.id} block={block} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
