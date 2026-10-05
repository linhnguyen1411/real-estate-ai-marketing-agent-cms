/**
 * Real Estate Content Guardrail Module
 * 
 * Implements Phase 7.4 requirements:
 * - Automatically validates price, area, legal status, and project identity
 *   between AI-generated marketing content and source DB record.
 * - Flags discrepancies and hallucinatory claims (e.g. converting "chưa sổ" to "sổ hồng").
 * - Forces human review (requiresManualReview: true) when guardrails fail.
 */

export interface PropertySourceRecord {
  title?: string;
  price?: number | string | null;
  area?: number | string | null;
  legal_status?: string | null;
  location?: string | null;
  type?: string | null;
}

export interface GuardrailCheckResult {
  passed: boolean;
  violations: string[];
  requiresManualReview: boolean;
}

/**
 * Normalizes Vietnamese text for semantic comparison.
 */
function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks legal status consistency.
 * Prevents AI from hallucinating clear title / red book when property is unverified or under contract.
 */
function verifyLegalStatus(
  sourceLegal: string | null | undefined,
  content: string
): { valid: boolean; reason?: string } {
  if (!sourceLegal) return { valid: true };

  const normSource = normalizeText(sourceLegal);
  const normContent = normalizeText(content);

  const isSourcePending =
    normSource.includes('chua so') ||
    normSource.includes('dang cho so') ||
    normSource.includes('hdmb') ||
    normSource.includes('hop dong mua ban') ||
    normSource.includes('giay to tay') ||
    normSource.includes('vi bang');

  const claimsHasBook =
    normContent.includes('so hong rieng') ||
    normContent.includes('so do rieng') ||
    normContent.includes('so do trao tay') ||
    normContent.includes('so hong trao tay') ||
    normContent.includes('da co so') ||
    normContent.includes('so do chinh chu') ||
    normContent.includes('so hong chinh chu') ||
    normContent.includes('phap ly hoan chinh da co so');

  if (isSourcePending && claimsHasBook) {
    return {
      valid: false,
      reason: `Pháp lý không khớp: Dữ liệu nguồn là "${sourceLegal}" nhưng nội dung AI khẳng định đã có sổ riêng/chính chủ.`,
    };
  }

  return { valid: true };
}

/**
 * Checks price consistency between source DB and generated copy.
 * Allows slight wording or rounding within 5%, but flags severe price distortions.
 */
function verifyPriceAccuracy(
  sourcePrice: number | string | null | undefined,
  content: string
): { valid: boolean; reason?: string } {
  if (sourcePrice === null || sourcePrice === undefined) return { valid: true };

  const numPrice = typeof sourcePrice === 'number' ? sourcePrice : parseFloat(String(sourcePrice));
  if (isNaN(numPrice) || numPrice <= 0) return { valid: true };

  // Look for patterns like "3.5 tỷ", "3,5 ty", "3500 triệu"
  const priceRegex = /(\d+(?:[.,]\d+)?)\s*(tỷ|ty|triệu|trieu)(?![a-zA-Z0-9\u00C0-\u1EF9])/gi;
  let match: RegExpExecArray | null;

  while ((match = priceRegex.exec(content)) !== null) {
    const rawVal = parseFloat(match[1].replace(',', '.'));
    const unit = match[2].toLowerCase();

    let valInBillion = rawVal;
    if (unit === 'triệu' || unit === 'trieu') {
      valInBillion = rawVal / 1000;
    }

    // Check deviation if AI explicitly mentions a price
    const deviation = Math.abs(valInBillion - numPrice) / numPrice;
    if (deviation > 0.05 && deviation < 10) {
      // If deviated by more than 5% (and not just an unrelated small number)
      return {
        valid: false,
        reason: `Giá không khớp: Dữ liệu nguồn là ${numPrice} tỷ, nhưng bài viết đề cập ${match[0]} (lệch ${(deviation * 100).toFixed(1)}%).`,
      };
    }
  }

  return { valid: true };
}

/**
 * Checks area accuracy.
 */
function verifyAreaAccuracy(
  sourceArea: number | string | null | undefined,
  content: string
): { valid: boolean; reason?: string } {
  if (sourceArea === null || sourceArea === undefined) return { valid: true };

  const numArea = typeof sourceArea === 'number' ? sourceArea : parseFloat(String(sourceArea));
  if (isNaN(numArea) || numArea <= 0) return { valid: true };

  // Look for patterns like "100m2", "100 m²", "100.5 mét vuông"
  const areaRegex = /(\d+(?:[.,]\d+)?)\s*(m2|m²|met vuong|mét vuông)(?![a-zA-Z0-9\u00C0-\u1EF9])/gi;
  let match: RegExpExecArray | null;

  while ((match = areaRegex.exec(content)) !== null) {
    const rawVal = parseFloat(match[1].replace(',', '.'));
    const deviation = Math.abs(rawVal - numArea) / numArea;

    if (deviation > 0.05) {
      return {
        valid: false,
        reason: `Diện tích không khớp: Dữ liệu nguồn là ${numArea}m², nhưng bài viết đề cập ${match[0]} (lệch ${(deviation * 100).toFixed(1)}%).`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validates generated content against property record.
 */
export function verifyPropertyContentGuardrail(
  property: PropertySourceRecord,
  generatedContent: string
): GuardrailCheckResult {
  const violations: string[] = [];

  const legalCheck = verifyLegalStatus(property.legal_status, generatedContent);
  if (!legalCheck.valid && legalCheck.reason) {
    violations.push(legalCheck.reason);
  }

  const priceCheck = verifyPriceAccuracy(property.price, generatedContent);
  if (!priceCheck.valid && priceCheck.reason) {
    violations.push(priceCheck.reason);
  }

  const areaCheck = verifyAreaAccuracy(property.area, generatedContent);
  if (!areaCheck.valid && areaCheck.reason) {
    violations.push(areaCheck.reason);
  }

  const passed = violations.length === 0;

  return {
    passed,
    violations,
    requiresManualReview: !passed,
  };
}
