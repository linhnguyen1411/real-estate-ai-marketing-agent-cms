import { extractLeadData, toRawExtracted } from '../../../agent/extractors';
import type { WorkflowStepHandler } from './stepContract';
import { requireScannedContent } from './stepHelpers';

export const extractStructuredDataStep: WorkflowStepHandler = {
  type: 'extract_structured_data',
  async execute(ctx) {
    const content = await requireScannedContent(ctx);
    const extracted = extractLeadData(content.contentText);
    const compact = toRawExtracted(extracted);

    return {
      status: 'completed',
      output: {
        status: extracted.status,
        primaryPhone: compact.primaryPhone,
        classification: compact.classification,
        intent: compact.intent,
        location: compact.location?.primary ?? null,
        propertyTypes: compact.propertyTypes,
        budgetMin: compact.budgetMin,
        budgetMax: compact.budgetMax,
        askingPrice: compact.askingPrice,
        extracted: compact,
      },
    };
  },
};
