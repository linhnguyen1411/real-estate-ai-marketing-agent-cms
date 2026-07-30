/**
 * Campaign planning intent recognition (Planning NLP).
 * Pure heuristics — no Runtime / Worker / Browser coupling.
 */

/** Known projects / asset cues used for campaign routing + extraction. */
export const CAMPAIGN_ASSET_CUE_RE =
  /sun\s*(?:cora|spana|symphony|cosmo|group)?|\bsun\b|s-?light|fpt\s*plaza|mai\s*đăng\s*chơn|mai\s*dang\s*chon|shophouse|khối\s*đế|khoi\s*de|retail\s*podium|tòa\s*nhà|toa\s*nha/i;

const MARKET_RESEARCH_ONLY_RE =
  /research\s*(?:giá|gia|thị\s*trường|thi\s*truong)|market\s*report|giá\s*thị\s*trường|gia\s*thi\s*truong|khảo\s*sát\s*thị\s*trường|khao\s*sat\s*thi\s*truong|market\s*intelligence/i;

const WORKSPACE_QA_RE =
  /workspace\s*campaign|campaign\s*workspace|tóm\s*tắt\s*campaign|tom\s*tat\s*campaign|campaign\s*dashboard|đang\s*tới\s*đâu|dang\s*toi\s*dau|tới\s*đâu\s*rồi|toi\s*dau\s*roi|buyer\s*tốt\s*nhất|buyer\s*tot\s*nhat|tại\s*sao\s*campaign\s*chậm|tai\s*sao\s*campaign\s*cham/i;

const EXISTING_CONTENT_FLOW_RE =
  /(?:viết|viet|soạn|soan)\s+content|content\s+cho\s+campaign\s+(?:này|nay)|cho\s+campaign\s+(?:này|nay)|content\s+plan|lịch\s+đăng|lich\s+dang/i;

const EXPLICIT_CAMPAIGN_RE =
  /bán\s*mạnh|ban\s*manh|cần\s*bán|can\s*ban|lập\s*campaign|lap\s*campaign|campaign\s*board|chiến\s*dịch|chien\s*dich|tạo\s*campaign|tao\s*campaign|tạo\s*chiến\s*dịch|tao\s*chien\s*dich|làm\s*chiến\s*dịch|lam\s*chien\s*dich|khởi\s*động\s*campaign|khoi\s*dong\s*campaign|chạy\s*campaign|chay\s*campaign/i;

const CREATE_MISSION_SELL_RE =
  /(?:tạo|tao|làm|lam)\s+(?:mission|nhiệm\s*vụ|nhiem\s*vu).{0,40}(?:bán|ban)|(?:mission|nhiệm\s*vụ|nhiem\s*vu).{0,20}(?:bán|ban)/i;

const ACTION_WITH_ASSET_RE =
  /(?:marketing|tìm\s*buyer|tim\s*buyer|(?:làm|lam)\s*content|research)\b/i;

const SELL_WITH_ASSET_RE = /(?:^|\s)(?:bán|ban)\s+/i;

/**
 * True when utterance is Campaign Planning (createAndRunCampaign),
 * not ops chat / workspace Q&A / pure market research.
 */
export function isCampaignPlanningUtterance(text: string): boolean {
  const t = String(text || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[?.!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return false;
  if (MARKET_RESEARCH_ONLY_RE.test(t)) return false;
  if (WORKSPACE_QA_RE.test(t)) return false;
  if (EXISTING_CONTENT_FLOW_RE.test(t)) return false;

  if (EXPLICIT_CAMPAIGN_RE.test(t)) return true;
  if (CREATE_MISSION_SELL_RE.test(t)) return true;

  if (ACTION_WITH_ASSET_RE.test(t) && CAMPAIGN_ASSET_CUE_RE.test(t)) return true;
  if (SELL_WITH_ASSET_RE.test(t) && CAMPAIGN_ASSET_CUE_RE.test(t)) return true;

  // Any concrete sell request → campaign path; AssetValidator fail-closes if vague
  if (SELL_WITH_ASSET_RE.test(t) && !/\bbrowser\b|máy nào|may nao/.test(t)) return true;

  // bare "campaign <asset|anything>" except week-report / content-for-this-campaign
  if (
    /\bcampaign\b/.test(t) &&
    !/week.?report|health|funnel|omnichannel|viết\s+content|viet\s+content|content\s+cho|cho\s+campaign\s+(?:này|nay)/i.test(
      t,
    )
  ) {
    return true;
  }

  return false;
}
