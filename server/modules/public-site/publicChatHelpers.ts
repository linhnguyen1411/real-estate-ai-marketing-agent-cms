import type { Customer, Property } from '../../../src/types';
import { generateText } from '../../aiService';
import { getPropertyPath } from './propertyPaths';

export function normalizeText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

export function extractQueryTokens(message: string) {
  const normalized = normalizeText(message);
  // Expand common real estate abbreviations & colloquial phrases
  const expanded = normalized
    .replace(/\bmt\b/g, 'mat tien')
    .replace(/\bdt\b/g, 'dien tich')
    .replace(/\bnhk\b/g, 'nam hoa xuan')
    .replace(/\bhx\b/g, 'hoa xuan')
    .replace(/\bsh\b/g, 'shophouse');

  const rawTokens = expanded
    .split(/[^a-z0-9]+/i)
    .filter(token => token.length >= 2 && ![
      'toi', 'can', 'tim', 'cho', 'hoi', 've', 'co', 'khong', 'duoc',
      'anh', 'chi', 'em', 'muon', 'chao', 'alo', 'ban', 'nhe', 'a'
    ].includes(token));

  // Also include 2-word and 3-word n-grams for proper locations, streets, and names
  const ngrams: string[] = [];
  const words = expanded.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length - 1; i++) {
    const pair = `${words[i]} ${words[i + 1]}`;
    ngrams.push(pair);
  }
  for (let i = 0; i < words.length - 2; i++) {
    const triplet = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    ngrams.push(triplet);
  }

  return Array.from(new Set([...ngrams, ...rawTokens])).slice(0, 35);
}

export function extractBudget(message: string) {
  const normalized = normalizeText(message);
  const mixedBudget = normalized.match(/(\d+)\s*(?:ty|ti)\s*(\d+)/);
  if (mixedBudget) {
    return Number(`${mixedBudget[1]}.${mixedBudget[2]}`);
  }
  const matches = [...normalized.matchAll(/(\d+(?:[.,]\d+)?)\s*(ty|ti|billion)?/g)]
    .map(match => Number(match[1].replace(',', '.')))
    .filter(value => Number.isFinite(value) && value > 0);
  return matches.length ? Math.max(...matches) : null;
}

export function textScore(record: any, tokens: string[]) {
  if (!tokens.length) return 0;
  const haystack = normalizeText(JSON.stringify(record));
  return tokens.reduce((score, token) => {
    if (token.includes(' ') && haystack.includes(token)) return score + 4;
    return score + (haystack.includes(token) ? 1 : 0);
  }, 0);
}

export function detectQueryIntent(message: string) {
  const normalized = normalizeText(message);
  if (/(dang tin|tao tin|lam sao|huong dan|cach|quy dinh|chinh sach|tai tool|desktop tool|phan quyen|vai tro|referral|ma gioi thieu|duyet|thanh vien|pending|dang ky|cai dat|license|key|ho tro|website|web nay|san nay|bdsdanang)/.test(normalized)) return 'knowledge';
  if (/(khach|lead|crm|so dien thoai|phone)/.test(normalized)) return 'customers';
  if (/(bai dang|post|content|facebook|zalo|tiktok)/.test(normalized)) return 'posts';
  if (/(inbox|tin nhan|phan hoi)/.test(normalized)) return 'inbox';
  if (/(automation|tu dong|kich ban)/.test(normalized)) return 'automations';
  return 'properties';
}

export function isGreetingOnlyMessage(message: string) {
  const normalized = normalizeText(message).replace(/\s+/g, ' ').trim();
  if (!normalized) return false;

  const hasSearchIntent = /(gia|bao nhieu|ty|trieu|m2|dien tich|phap ly|so hong|so do|vi tri|o dau|dia chi|nha|dat|can ho|shophouse|shop house|du an|dau tu|mua bds|ban nha|ban dat|thue|xem|tu van|hoa xuan|sonata|song han|bien)/.test(normalized);
  if (hasSearchIntent) return false;

  const asksIdentity = /(^|\s)(ban|em)?\s*(ten gi|la ai|la ai vay|ten la gi)(\s|$)/.test(normalized);
  const startsWithGreeting = /^(xin chao|chao|hello|hi|alo|aloo)\b/.test(normalized);
  if (startsWithGreeting && (asksIdentity || normalized.split(/\s+/).length <= 8)) return true;

  return /^(test|ok|cam on|thanks|thank you)(\s+(em|anh|chi|ban|shop|ad|admin|nhe|a|nha))*[.!?]*$/.test(normalized);
}

export function isWeatherQuestion(message: string) {
  const normalized = normalizeText(message).replace(/\s+/g, ' ').trim();
  return /(thoi tiet|du bao|weather|troi hom nay|hom nay troi|troi.*(mua|nang|lanh|nong)|ti.t)/.test(normalized);
}

export function hasPublicRealEstateIntent(message: string) {
  const normalized = normalizeText(message).replace(/\s+/g, ' ').trim();
  if (!normalized) return false;

  const phraseIntent = /(bds|bat dong san|can ho|chung cu|shophouse|shop house|du an|mat tien|mat bang|kho bai|o dau|vi tri|dia chi|khu vuc|hoa xuan|hoa quy|son tra|lien chieu|ngu hanh son|sonata|song han|phao hoa|bao nhieu|ngan sach|dien tich|phap ly|so hong|so do|hoan cong|ban nha|ban dat|cho thue|dau tu|kinh doanh|homestay|xem nha|xem dat|lich xem|tu van)/.test(normalized);
  const wordIntent = /\b(nha|dat|lo|nen|xay|bien|gia|ty|ti|trieu|m2|mua|thue|spa)\b/.test(normalized);
  return phraseIntent || wordIntent;
}

export async function generatePublicSmallTalkReply(message: string, recentHistory: string) {
  try {
    return await generateText(
      [
        'Bạn là Lily, trợ lý tư vấn bất động sản Đà Nẵng trên website House & Life (Vững tâm an cư - kiến tạo tương lai).',
        'Tin nhắn hiện tại không có intent bất động sản rõ ràng.',
        'Hãy trả lời tự nhiên, vui vẻ, ngắn gọn bằng tiếng Việt trong 2-4 câu.',
        'Nếu người dùng hỏi chuyện thường thức, thời tiết, chào hỏi, đùa vui hoặc hỏi bâng quơ thì trả lời ở mức hữu ích vừa đủ.',
        'Không bịa dữ liệu realtime, tin tức mới, giá thị trường realtime, y tế/pháp lý/tài chính chuyên sâu. Nếu thiếu dữ liệu realtime thì nói rõ là em chưa có dữ liệu realtime.',
        'Luôn kết thúc bằng một câu chuyển hướng mềm về mua bán BĐS Đà Nẵng, ví dụ hỏi khách đang quan tâm nhà phố, đất nền, căn hộ, shophouse, khu vực hoặc ngân sách nào.',
        'Không giới thiệu sản phẩm cụ thể khi chưa có intent BĐS.'
      ].join('\n'),
      [
        `Lịch sử gần nhất:\n${recentHistory || 'Chưa có lịch sử.'}`,
        '',
        `Tin nhắn khách:\n${message}`
      ].join('\n'),
      { temperature: 0.7, timeoutMs: 12000 }
    );
  } catch (error) {
    console.error('Public small talk AI failed, using static redirect:', error instanceof Error ? error.message : error);
    return [
      'Dạ, câu này em trả lời nhanh trong phạm vi hỗ trợ được thôi ạ.',
      'Hiện em phù hợp nhất để hỗ trợ lọc BĐS Đà Nẵng theo khu vực, ngân sách, pháp lý và lịch xem thực tế.',
      'Anh/chị đang quan tâm nhà phố, đất nền, căn hộ hay shophouse để em tư vấn đúng hơn ạ?'
    ].join('\n\n');
  }
}

export function compactProperty(property: Property) {
  return {
    id: property.id,
    title: property.title,
    type: property.type,
    location: property.location,
    area: property.area,
    price: property.price,
    legal_status: property.legal_status,
    direction: property.direction,
    road_width: property.road_width,
    project_name: property.project_name || '',
    sale_status: property.sale_status || 'available',
    path: getPropertyPath(property),
    description: String(property.rich_description || property.description || '').slice(0, 700),
    selling_points: (property.selling_points || []).slice(0, 6),
  };
}

export function compactCustomer(customer: Customer) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    source: customer.source,
    budget: customer.budget,
    interested_area: customer.interested_area,
    property_type: customer.property_type,
    status: customer.status,
    lead_score: customer.lead_score,
    notes: String(customer.notes || '').slice(0, 400),
    ai_summary: String(customer.ai_summary || '').slice(0, 400)
  };
}

export function rankProperties(properties: Property[], message: string, limit = 5) {
  const tokens = extractQueryTokens(message);
  const budget = extractBudget(message);
  const normalizedMsg = normalizeText(message);
  const isGeneralListingQuery = /(gio hang|danh sach|tat ca|co nhung|bds|san pham|can nao|lo nao|cho toi xem)/.test(normalizedMsg);

  return properties
    .map(property => {
      const tokenScore = textScore(compactProperty(property), tokens);
      const propPrice = Number(property.price);
      let budgetScore = 0;
      if (budget && Number.isFinite(propPrice) && propPrice > 0) {
        const diffRatio = Math.abs(propPrice - budget) / budget;
        if (diffRatio <= 0.15) {
          budgetScore = 25; // Very close to budget
        } else if (diffRatio <= 0.35) {
          budgetScore = 12;
        } else if (propPrice <= budget) {
          budgetScore = 8;
        } else {
          budgetScore = -Math.min(diffRatio * 15, 25);
        }
      }

      // Check type match (đất nền, nhà phố, căn hộ, biệt thự, shophouse)
      let typeScore = 0;
      const propType = normalizeText(property.type || '');
      if (
        (normalizedMsg.includes('dat') && (propType.includes('dat') || propType.includes('nen'))) ||
        (normalizedMsg.includes('nha') && (propType.includes('nha') || propType.includes('pho'))) ||
        (normalizedMsg.includes('can ho') && propType.includes('can ho')) ||
        (normalizedMsg.includes('chung cu') && propType.includes('can ho')) ||
        (normalizedMsg.includes('shophouse') && propType.includes('shophouse'))
      ) {
        typeScore = 15;
      }

      // Check location & street match dynamically
      let locScore = 0;
      const propLoc = normalizeText(`${property.location || ''} ${property.project_name || ''}`);
      if (propLoc) {
        const locWords = propLoc.split(/\s+/).filter(w => w.length >= 3);
        for (const lw of locWords) {
          if (normalizedMsg.includes(lw)) {
            locScore += 12;
          }
        }
      }

      // Direct multi-word phrase matching on haystack (title, location, project_name, rich_description)
      const haystack = normalizeText(`${property.title || ''} ${property.location || ''} ${property.project_name || ''} ${property.rich_description || property.description || ''}`);
      let phraseScore = 0;
      const msgWords = normalizedMsg.split(/[^a-z0-9]+/i).filter(w => w.length >= 2);
      for (let len = Math.min(msgWords.length, 4); len >= 2; len--) {
        for (let i = 0; i <= msgWords.length - len; i++) {
          const phrase = msgWords.slice(i, i + len).join(' ');
          if (haystack.includes(phrase)) {
            phraseScore += len * 20; // 3-word match = 60 pts, 2-word match = 40 pts
          }
        }
      }

      const availableBonus = property.sale_status === 'sold' ? -50 : 5;
      const totalScore = tokenScore * 10 + phraseScore + budgetScore + typeScore + locScore + availableBonus;

      return {
        property,
        score: totalScore,
        tokenScore,
        phraseScore,
        locScore,
        typeScore,
      };
    })
    .filter(item => {
      // Must have actual matching signal or be an explicit listing request
      return item.phraseScore > 0 || item.tokenScore > 0 || item.locScore > 0 || isGeneralListingQuery;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.property);
}

export function formatPublicPropertySuggestions(properties: Property[]) {
  if (!properties.length) {
    return 'Hiện danh sách BĐS chưa có sản phẩm công khai phù hợp để em gửi anh/chị.';
  }

  return properties.map((property, index) => {
    const cleanSnippet = (value: unknown, maxLength: number) => {
      const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
      return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trim()}...` : cleaned;
    };
    const sellingPoints = (property.selling_points || [])
      .map(point => cleanSnippet(point, 90))
      .filter(Boolean)
      .slice(0, 3);
    const description = cleanSnippet(property.description, 220);
    return [
      `### ${index + 1}. ${property.title}`,
      `- 📍 **Vị trí:** ${property.location}`,
      `- 💰 **Giá:** ${property.price} tỷ`,
      `- 📐 **Diện tích:** ${property.area}m²`,
      `- 📄 **Pháp lý:** ${property.legal_status}`,
      sellingPoints.length ? `- ✨ **Điểm đáng chú ý:** ${sellingPoints.join(' • ')}` : '',
      description ? `- 📝 **Mô tả nhanh:** ${description}` : '',
      `- 🔗 [**Xem chi tiết sản phẩm**](${getPropertyPath(property)})`
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}
