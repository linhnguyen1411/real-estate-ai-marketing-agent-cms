import type { OpportunityGroup } from '../../types/leadMagnetContent';
import { formatOpportunityGroupLabel } from '../../types/leadMagnetContent';
import { hasOpportunityFieldValue } from '../../leadGen/normalizeOpportunityGroup';

interface OpportunityGroupViewProps {
  group: OpportunityGroup;
}

const DETAIL_FIELDS: Array<{
  key: keyof Pick<OpportunityGroup, 'area' | 'assetType' | 'whyWatch' | 'risks' | 'suitableBudget'>;
  label: string;
  wide?: boolean;
}> = [
  { key: 'area', label: 'Khu vực' },
  { key: 'assetType', label: 'Loại tài sản' },
  { key: 'whyWatch', label: 'Vì sao đáng theo dõi', wide: true },
  { key: 'risks', label: 'Rủi ro cần lưu ý', wide: true },
  { key: 'suitableBudget', label: 'Phù hợp ngân sách', wide: true },
];

export default function OpportunityGroupView({ group }: OpportunityGroupViewProps) {
  const visibleFields = DETAIL_FIELDS.filter(field => hasOpportunityFieldValue(group[field.key]));

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start gap-2">
        <span className="inline-flex shrink-0 items-center rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
          {formatOpportunityGroupLabel(group.rank)}
        </span>
        <h3 className="flex-1 text-lg font-bold text-slate-950">{group.name}</h3>
      </div>

      {visibleFields.length > 0 ? (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          {visibleFields.map(field => (
            <div key={field.key} className={field.wide ? 'sm:col-span-2' : undefined}>
              <dt className="font-semibold text-slate-500">{field.label}</dt>
              <dd
                className={
                  field.wide
                    ? 'mt-1 leading-relaxed text-slate-700'
                    : 'text-slate-800'
                }
              >
                {group[field.key]}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}
