import { GoogleGenAI } from "@google/genai";
import { AppSettings } from "../src/types";
import { getSettings as getSettingsFromDB } from "./dbHelper";

type ProviderName = "ollama" | "openai" | "gemini";

interface AIProviderStatus {
  provider: ProviderName;
  ok: boolean;
  model?: string;
  endpoint?: string;
  message: string;
}

interface GenerationOptions {
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  ai_mode: process.env.DEFAULT_AI_MODE === "openai"
    ? "openai"
    : process.env.DEFAULT_AI_MODE === "gemini"
      ? "gemini"
      : process.env.DEFAULT_AI_MODE === "ollama"
        ? "ollama"
        : "auto",
  ollama_endpoint: process.env.OLLAMA_ENDPOINT || "http://localhost:11434",
  ollama_model: process.env.OLLAMA_MODEL || "qwen2.5",
  openai_model: process.env.OPENAI_MODEL || "gpt-4",
  agent_tone: process.env.AGENT_TONE || "chuyên nghiệp"
};

// Get settings from Prisma database
async function getAppSettings(): Promise<AppSettings> {
  try {
    const settings = await getSettingsFromDB();
    return { ...DEFAULT_SETTINGS, ...settings };
  } catch (error) {
    console.error("Error loading app settings from database, using defaults:", error);
    return DEFAULT_SETTINGS;
  }
}

function normalizeEndpoint(endpoint: string) {
  return endpoint.replace(/\/+$/, "");
}

function buildSystemInstruction(systemInstruction: string) {
  return [
    "Bạn là AI assistant cho hệ thống CRM/CMS marketing bất động sản Việt Nam.",
    "Luôn trả lời bằng tiếng Việt tự nhiên, rõ ràng, ngắn gọn, đúng nghiệp vụ.",
    "Chỉ sử dụng dữ liệu được cung cấp trong prompt; nếu thiếu dữ liệu thì nói rõ phần còn thiếu.",
    "Không tự bịa giá, pháp lý, vị trí, số điện thoại hoặc cam kết giao dịch.",
    "Khi được yêu cầu JSON, chỉ trả JSON hợp lệ, không markdown, không giải thích thêm.",
    "Nếu dùng Ollama model có xu hướng suy luận dài, không in chain-of-thought hoặc nội dung trong thẻ <think>.",
    "",
    systemInstruction
  ].join("\n");
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timeout) };
}

function stripThinking(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function extractJson(text: string) {
  const cleaned = stripThinking(text).replace(/```json/g, "").replace(/```/g, "").trim();
  const firstObject = cleaned.indexOf("{");
  const lastObject = cleaned.lastIndexOf("}");

  if (firstObject >= 0 && lastObject > firstObject) {
    return cleaned.slice(firstObject, lastObject + 1);
  }

  return cleaned;
}

function compactSeoText(value: unknown) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateSeoText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const truncated = value.slice(0, maxLength - 3);
  const wordBoundary = truncated.lastIndexOf(' ');
  return `${truncated.slice(0, wordBoundary > 20 ? wordBoundary : truncated.length).trim()}...`;
}

function toHashtag(value: unknown) {
  const normalized = compactSeoText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, match => match === 'Đ' ? 'D' : 'd')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join('');
  return normalized ? `#${normalized}` : '';
}

export function buildPropertySeo(property: any) {
  const location = compactSeoText(property.location);
  const primaryLocation = location.split(',')[0] || 'Đà Nẵng';
  const shortLocation = primaryLocation.split(/\s+-\s+/)[0] || primaryLocation;
  const type = compactSeoText(property.type || 'bất động sản');
  const title = truncateSeoText(
    `Bán ${type} ${shortLocation}, ${property.area}m2, ${property.price} tỷ | Estoria`,
    60
  );
  const metaDescription = truncateSeoText(
    `Bán ${type} tại ${location}, diện tích ${property.area}m2, giá ${property.price} tỷ, pháp lý ${property.legal_status}. Xem chi tiết và đặt lịch cùng Estoria.`,
    155
  );
  const keywords = Array.from(new Set([
    `bán ${type} ${primaryLocation}`,
    `${type} ${location}`,
    `bất động sản ${primaryLocation}`,
    'bất động sản Đà Nẵng',
    property.legal_status
  ].map(compactSeoText).filter(Boolean)));
  const hashtags = Array.from(new Set([
    '#BatDongSan',
    '#BatDongSanDaNang',
    toHashtag(type),
    toHashtag(primaryLocation),
    toHashtag(`Ban ${type}`),
    toHashtag(property.legal_status),
    '#NhaDatDaNang'
  ].filter(Boolean)));

  return { title, meta_description: metaDescription, keywords, hashtags };
}

export function appendStandardHashtags(content: string, hashtags: string[]) {
  const missingHashtags = hashtags.filter(hashtag => !content.toLowerCase().includes(hashtag.toLowerCase()));
  return missingHashtags.length ? `${content.trim()}\n\n${missingHashtags.join(' ')}` : content.trim();
}

async function callOllama(systemInstruction: string, prompt: string, options: GenerationOptions = {}): Promise<string> {
  const settings = await getAppSettings();
  const endpoint = `${normalizeEndpoint(settings.ollama_endpoint)}/api/chat`;
  const timeout = withTimeout(options.timeoutMs || Number(process.env.OLLAMA_TIMEOUT_MS || 45000));

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal: timeout.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: settings.ollama_model,
        think: false,
        messages: [
          { role: "system", content: buildSystemInstruction(systemInstruction) },
          { role: "user", content: prompt }
        ],
        stream: false,
        options: {
          temperature: options.temperature ?? 0.2,
          num_ctx: 8192,
          num_predict: options.maxOutputTokens || 700
        }
      })
    });
  } finally {
    timeout.cancel();
  }

  if (!response.ok) {
    throw new Error(`Ollama HTTP ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  const content = json.message?.content || json.response;
  if (!content) throw new Error("Ollama không trả về nội dung.");
  return stripThinking(content);
}

async function callOpenAI(systemInstruction: string, prompt: string, options: GenerationOptions = {}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY chưa được cấu hình.");
  }

  const settings = await getAppSettings();
  const timeout = withTimeout(options.timeoutMs || Number(process.env.OPENAI_TIMEOUT_MS || 60000));
  let response: Response;

  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: timeout.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: settings.openai_model || process.env.OPENAI_MODEL || "gpt-5-mini",
        input: [
          { role: "system", content: buildSystemInstruction(systemInstruction) },
          { role: "user", content: prompt }
        ]
      })
    });
  } finally {
    timeout.cancel();
  }

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error?.message || `OpenAI HTTP ${response.status}: ${response.statusText}`);
  }

  if (json.output_text) return stripThinking(json.output_text);

  const outputText = json.output
    ?.flatMap((item: any) => item.content || [])
    ?.map((content: any) => content.text)
    ?.filter(Boolean)
    ?.join("\n")
    ?.trim();

  if (!outputText) throw new Error("OpenAI không trả về nội dung text.");
  return stripThinking(outputText);
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { "User-Agent": "aistudio-build" }
    }
  });
}

async function callGemini(systemInstruction: string, prompt: string, options: GenerationOptions = {}): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error("GEMINI_API_KEY chưa được cấu hình.");
  }

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction: buildSystemInstruction(systemInstruction),
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: options.maxOutputTokens
    }
  });

  return stripThinking(response.text || "");
}

function providerOrder(mode: AppSettings["ai_mode"]): ProviderName[] {
  if (mode === "ollama") return ["ollama", "openai", "gemini"];
  if (mode === "openai") return ["openai", "ollama", "gemini"];
  if (mode === "gemini") return ["gemini", "openai", "ollama"];
  return ["ollama", "openai", "gemini"];
}

async function callProvider(provider: ProviderName, systemInstruction: string, prompt: string, options: GenerationOptions = {}) {
  if (provider === "ollama") return callOllama(systemInstruction, prompt, options);
  if (provider === "openai") return callOpenAI(systemInstruction, prompt, options);
  return callGemini(systemInstruction, prompt, options);
}

export async function generateText(systemInstruction: string, prompt: string, options: GenerationOptions = {}): Promise<string> {
  const settings = await getAppSettings();
  const errors: string[] = [];

  for (const provider of providerOrder(settings.ai_mode)) {
    try {
      const result = await callProvider(provider, systemInstruction, prompt, options);
      if (result.trim()) return result;
      errors.push(`${provider}: empty response`);
    } catch (error: any) {
      errors.push(`${provider}: ${error.message || error}`);
      console.warn(`[AI fallback] ${provider} failed:`, error.message || error);
    }
  }

  throw new Error(`Không gọi được AI provider nào. ${errors.join(" | ")}`);
}

export async function getAIProviderStatus(): Promise<AIProviderStatus[]> {
  const settings = await getAppSettings();
  const statuses: AIProviderStatus[] = [];

  try {
    const response = await fetch(`${normalizeEndpoint(settings.ollama_endpoint)}/api/tags`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const models = json.models || [];
    const hasConfiguredModel = models.some((model: any) => model.name === settings.ollama_model || model.model === settings.ollama_model);
    statuses.push({
      provider: "ollama",
      ok: hasConfiguredModel,
      model: settings.ollama_model,
      endpoint: settings.ollama_endpoint,
      message: hasConfiguredModel
        ? `Ollama local sẵn sàng với model ${settings.ollama_model}.`
        : `Ollama đang chạy nhưng chưa thấy model ${settings.ollama_model}. Models hiện có: ${models.map((model: any) => model.name || model.model).join(", ") || "none"}.`
    });
  } catch (error: any) {
    statuses.push({
      provider: "ollama",
      ok: false,
      model: settings.ollama_model,
      endpoint: settings.ollama_endpoint,
      message: `Không kết nối được Ollama: ${error.message || error}`
    });
  }

  statuses.push({
    provider: "openai",
    ok: Boolean(process.env.OPENAI_API_KEY),
    model: settings.openai_model || process.env.OPENAI_MODEL || "gpt-5-mini",
    message: process.env.OPENAI_API_KEY
      ? "OpenAI/ChatGPT fallback đã cấu hình OPENAI_API_KEY."
      : "Thiếu OPENAI_API_KEY; fallback ChatGPT chưa sẵn sàng."
  });

  statuses.push({
    provider: "gemini",
    ok: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    message: process.env.GEMINI_API_KEY
      ? "Gemini fallback đã cấu hình GEMINI_API_KEY."
      : "Thiếu GEMINI_API_KEY."
  });

  return statuses;
}

function jsonOnlyInstruction() {
  return "Chỉ trả về một JSON object hợp lệ. Không markdown. Không thêm giải thích ngoài JSON.";
}

const UNSUPPORTED_MARKETING_CLAIMS = [
  "an ninh tốt",
  "an ninh đảm bảo",
  "tiện ích đầy đủ",
  "vị trí vàng",
  "vị trí chiến lược",
  "cơ hội vàng",
  "cơ hội tuyệt vời",
  "siêu phẩm",
  "sinh lời",
  "tăng giá",
  "tiềm năng phát triển",
  "giá trị bền vững",
  "vượt thời gian",
  "không gian sống lý tưởng",
  "lợi thế sinh thái",
  "đầu tư thông minh",
  "sống chất lượng",
  "tài sản tiềm năng",
  "an tâm sở hữu",
  "cam kết sinh lời",
  "thanh khoản",
  "giá tốt nhất",
  "khan hiếm"
];

function findUnsupportedMarketingClaim(value: unknown) {
  const normalized = JSON.stringify(value).toLowerCase();
  return UNSUPPORTED_MARKETING_CLAIMS.find(pattern => normalized.includes(pattern));
}

function buildFallbackMarketingStrategy(property: any) {
  const audienceByType: Record<string, string> = {
    "đất": "Người mua muốn tự xây nhà theo nhu cầu và người đang tìm tài sản có pháp lý rõ ràng",
    "nhà phố": "Gia đình cần chỗ ở hoàn thiện và người mua muốn kết hợp ở với kinh doanh",
    "căn hộ": "Gia đình trẻ hoặc người mua ưu tiên không gian ở gọn, dễ sử dụng",
    "shophouse": "Người mua cần mặt bằng có thể khai thác kinh doanh",
    "kho xưởng": "Doanh nghiệp cần mặt bằng phục vụ vận hành, lưu kho hoặc sản xuất",
    "nhà hàng": "Người kinh doanh F&B cần mặt bằng có công năng phù hợp"
  };
  const sellingPoints = (property.selling_points || []).filter(Boolean);
  return {
    target_customer: audienceByType[property.type] || `Người đang tìm ${property.type} tại ${property.location}`,
    customer_insight: `Khách cần kiểm tra sự phù hợp giữa mức giá ${property.price} tỷ, công năng thực tế và pháp lý ${property.legal_status} trước khi đi xem.`,
    campaign_angle: sellingPoints.length
      ? `Biến ${sellingPoints.slice(0, 2).join(" và ")} thành lý do chính để khách đặt lịch xem`
      : `Giúp khách đánh giá nhanh tài sản dựa trên công năng và thông tin minh bạch`,
    creative_concept: `Một buổi đi xem có chuẩn bị: cho khách biết chính xác điều gì đáng kiểm tra tại tài sản này`,
    key_message: `${property.title}: xem đúng nhu cầu, kiểm tra đúng thông tin, quyết định dựa trên thực tế.`
  };
}

function buildMarketingImagePrompts(property: any, strategy: any) {
  const shared = [
    "Tôi đã đính kèm ảnh thật của bất động sản. Hãy dùng ảnh đó làm reference chính để tạo MỘT ẢNH MỚI, không chỉ thêm chữ hoặc bộ lọc lên ảnh cũ.",
    `Bất động sản: ${property.title}. Loại hình: ${property.type}. Vị trí: ${property.location}.`,
    `Creative concept: ${strategy.creative_concept}. Thông điệp hình ảnh: ${strategy.key_message}.`,
    `Các đặc điểm được phép thể hiện: ${(property.selling_points || []).join(", ") || property.description}.`,
    "Giữ đúng nhận diện, kiến trúc, số tầng, mặt tiền, tỷ lệ và bối cảnh có thật của tài sản trong ảnh reference.",
    "Được phép cải thiện ánh sáng, thời tiết, góc máy, bố cục, màu sắc và độ chỉn chu thương mại nhưng kết quả vẫn phải chân thực.",
    "Không tự thêm hồ bơi, biển, công viên, nội thất, người, xe, tầng nhà, tòa nhà hoặc tiện ích không xuất hiện trong ảnh reference.",
    "Không chữ, không logo, không watermark, không khung poster. Chừa khoảng trống hợp lý để có thể thêm headline sau."
  ];
  return {
    facebook: [
      ...shared,
      "Kênh sử dụng: Facebook feed. Tỷ lệ dọc 4:5.",
      "Bố cục: ảnh quảng cáo bất động sản cao cấp, tài sản là chủ thể chính, góc nhìn rộng vừa đủ và có chiều sâu; ánh sáng tự nhiên thu hút khi xem trên mobile."
    ].join("\n"),
    zalo: [
      ...shared,
      "Kênh sử dụng: Zalo. Tỷ lệ vuông 1:1.",
      "Bố cục: rõ ràng, gần gũi, tài sản nằm ở trung tâm, dễ nhận diện ngay trên màn hình nhỏ; ưu tiên cảm giác xem nhà thực tế, đáng tin cậy."
    ].join("\n"),
    tiktok: [
      ...shared,
      "Kênh sử dụng: TikTok/Reels cover. Tỷ lệ dọc 9:16.",
      "Bố cục: cinematic vertical cover, góc máy giàu chiều sâu, tài sản nằm ở vùng trung tâm an toàn; chừa khoảng trống phía trên và dưới cho UI/caption."
    ].join("\n")
  };
}

function buildCtaKeyword(property: any) {
  return String(property.location || property.type || "XEM NHÀ")
    .split(",")[0]
    .trim()
    .toUpperCase();
}

function buildGroundedBenefits(property: any) {
  const points = (property.selling_points || []).filter(Boolean);
  const benefits = points.map((point: string) => {
    const normalized = point.toLowerCase();
    if (normalized.includes("lô góc")) return `${point}: có nhiều mặt thoáng để cân nhắc khi lên phương án sử dụng`;
    if (normalized.includes("đường")) return `${point}: thuận tiện quan sát và kiểm tra lối tiếp cận khi đi xem`;
    if (normalized.includes("công viên")) return `${point}: phù hợp với người ưu tiên khả năng tiếp cận không gian công cộng`;
    if (normalized.includes("dân cư")) return `${point}: có thể trực tiếp khảo sát môi trường xung quanh khi đi xem`;
    if (normalized.includes("hoàn công") || normalized.includes("pháp lý") || normalized.includes("sổ")) return `${point}: thông tin quan trọng để kiểm tra hồ sơ trước khi quyết định`;
    if (normalized.includes("kinh doanh") || normalized.includes("thương mại")) return `${point}: đáng khảo sát nếu cần công năng kết hợp kinh doanh`;
    if (normalized.includes("xe tải")) return `${point}: đáng kiểm tra với nhu cầu vận chuyển và vận hành`;
    if (normalized.includes("ban công") || normalized.includes("thoáng")) return `${point}: tạo lợi thế về độ mở của không gian`;
    return point;
  });
  return benefits.length ? benefits : [property.description];
}

function buildMarketingFallbacks(property: any, strategy: any) {
  const keyword = buildCtaKeyword(property);
  const benefits = buildGroundedBenefits(property);
  const facts = `${property.area}m² • ${property.price} tỷ • ${property.legal_status} • đường ${property.road_width}m • hướng ${property.direction}`;
  return {
    facebook: `CÓ NHỮNG BẤT ĐỘNG SẢN CHỈ CẦN XEM ẢNH. CÓ NHỮNG BẤT ĐỘNG SẢN NÊN ĐẾN TẬN NƠI.\n\n${property.title} thuộc nhóm thứ hai, bởi giá trị đáng chú ý nằm ở cách các đặc điểm thực tế kết hợp với nhau:\n\n${benefits.map((item: string) => `✓ ${item}`).join("\n")}\n\nThông tin chính: ${facts}.\n\nNếu bạn đang tìm ${property.type} tại ${property.location}, đây là một lựa chọn đáng đưa vào lịch khảo sát để tự đánh giá độ phù hợp.\n\nNhắn "${keyword}" để nhận vị trí chi tiết, hồ sơ tài sản và khung giờ xem thuận tiện. Xem đúng thông tin trước, rồi mới quyết định bước tiếp theo.\n\n#batdongsan #nhadat #${keyword.replace(/\s+/g, "")}`,
    zalo: `Em gửi anh/chị ${property.title} tại ${property.location}.\n\nĐiểm đáng xem trực tiếp:\n${benefits.slice(0, 3).map((item: string) => `• ${item}`).join("\n")}\n\nThông tin chính: ${facts}.\n\nAnh/chị nhắn "${keyword}", em gửi ngay vị trí chi tiết, hồ sơ tài sản và sắp xếp lịch xem phù hợp.`,
    tiktok: `HOOK: "Vì sao ${property.title} đáng để đến xem tận nơi?"\n\nCẢNH 1 - Toàn cảnh tài sản\nVOICE-OVER: "Không chỉ là ${property.area}m² với mức giá ${property.price} tỷ. Điều cần xem là các lợi thế này kết hợp ra sao ngoài thực tế."\n\nCẢNH 2 - Quay điểm nổi bật thứ nhất\nTEXT: "${benefits[0]}"\n\nCẢNH 3 - Quay điểm nổi bật thứ hai\nTEXT: "${benefits[1] || property.legal_status}"\n\nCẢNH 4 - Chốt thông tin\nTEXT: "${property.legal_status} • Đường ${property.road_width}m • Hướng ${property.direction}"\n\nCTA: "Comment hoặc inbox từ khóa ${keyword} để nhận vị trí và lịch xem."\n\nCAPTION: Đừng quyết định chỉ từ ảnh. Nhắn "${keyword}" để nhận hồ sơ và xem thực tế.\n#batdongsan #reviewnhadat #nhadat`
  };
}

async function generateChannelMarketingCopy(
  channel: "facebook" | "zalo" | "tiktok",
  property: any,
  strategy: any,
  tone: string,
  fallback: string
) {
  const keyword = buildCtaKeyword(property);
  const frameworks = {
    facebook: "Dùng AIDA: hook gây chú ý -> khơi gợi nhu cầu -> chứng minh bằng đặc điểm thật -> CTA mạnh.",
    zalo: "Dùng direct response: vào thẳng lý do nên xem -> lợi ích chính -> thông tin đủ tin cậy -> CTA một bước.",
    tiktok: "Dùng hook-retention-CTA: hook 3 giây -> cảnh quay giữ người xem -> payoff -> CTA bình luận/inbox."
  };
  try {
    const result = await generateText(
      [
        `Bạn là copywriter performance marketing bất động sản, chuyên viết cho ${channel}.`,
        `Giọng văn: ${tone}.`,
        frameworks[channel],
        "Viết có sức bán, nhịp câu tự nhiên, tạo mong muốn đi xem và hành động ngay.",
        "Không chỉ liệt kê thông số. Phải chuyển đặc điểm thành ý nghĩa/lợi ích hợp lý cho người mua.",
        "Không bịa tiện ích, khoảng cách, lợi nhuận, độ khan hiếm, ưu đãi hoặc cam kết đầu tư.",
        "Chỉ trả nội dung hoàn chỉnh để đăng, không giải thích."
      ].join("\n"),
      `
CAMPAIGN ANGLE: ${strategy.campaign_angle}
CREATIVE CONCEPT: ${strategy.creative_concept}
TARGET CUSTOMER: ${strategy.target_customer}

FACTS:
${JSON.stringify({
  title: property.title,
  transaction_type: property.transaction_type || "bán",
  type: property.type,
  location: property.location,
  area: property.area,
  floor_area: property.floor_area,
  price: property.price,
  legal_status: property.legal_status,
  direction: property.direction,
  road_width: property.road_width,
  floors: property.floors,
  bedrooms: property.bedrooms,
  bathrooms: property.bathrooms,
  garage: property.garage,
  pool: property.pool,
  description: property.description,
  selling_points: property.selling_points
}, null, 2)}

CTA bắt buộc: kêu gọi nhắn từ khóa "${keyword}" để nhận vị trí chi tiết, hồ sơ và lịch xem.
${channel === "facebook" ? "Độ dài 160-240 từ, dễ đọc trên mobile, có 4-6 hashtag." : ""}
${channel === "zalo" ? "Độ dài 90-140 từ, thân thiện và trực tiếp, không hashtag." : ""}
${channel === "tiktok" ? "Viết kịch bản 30-45 giây gồm hook, cảnh quay, voice-over/text, caption và CTA." : ""}
`,
      { temperature: 0.65, maxOutputTokens: channel === "tiktok" ? 850 : 650, timeoutMs: 90000 }
    );
    if (result.trim().length < 120 || findUnsupportedMarketingClaim(result)) return fallback;
    return result.trim();
  } catch (error) {
    console.warn(`[Marketing copy fallback] ${channel}:`, error);
    return fallback;
  }
}

async function generateMarketingStrategy(property: any, tone: string) {
  const fallback = buildFallbackMarketingStrategy(property);
  try {
    const raw = await generateText(
      [
        "Bạn là strategist marketing bất động sản Việt Nam.",
        "Không viết lại thông số listing. Hãy tìm một góc tiếp cận mới nhưng phải suy ra hợp lý từ dữ liệu.",
        "Không bịa tiện ích, hành vi khu vực, lợi nhuận, độ khan hiếm hoặc cam kết đầu tư.",
        jsonOnlyInstruction()
      ].join("\n"),
      `
Dữ liệu listing:
${JSON.stringify({
  title: property.title,
  type: property.type,
  location: property.location,
  area: property.area,
  price: property.price,
  legal_status: property.legal_status,
  direction: property.direction,
  road_width: property.road_width,
  description: property.description,
  selling_points: property.selling_points
}, null, 2)}

Giọng điệu mong muốn: ${tone}

Tạo campaign brief. Phải đưa ra insight/góc bán có giá trị hơn việc nhắc lại thông số, nhưng mọi lập luận phải dựa trên dữ liệu listing.
Trả JSON:
{
  "target_customer": "chân dung khách cụ thể",
  "customer_insight": "mối quan tâm hoặc câu hỏi thật sự của khách trước khi đi xem",
  "campaign_angle": "góc bán duy nhất của chiến dịch",
  "creative_concept": "ý tưởng kể chuyện hoặc trải nghiệm nội dung",
  "key_message": "thông điệp chủ đạo một câu"
}
`,
      { temperature: 0.45, maxOutputTokens: 700, timeoutMs: 90000 }
    );
    const parsed = JSON.parse(extractJson(raw));
    if (!Object.keys(fallback).every(key => typeof parsed[key] === "string" && parsed[key].trim().length > 15)) {
      return fallback;
    }
    const unsupportedClaim = findUnsupportedMarketingClaim(parsed);
    if (unsupportedClaim) {
      console.warn(`AI campaign strategy contained unsupported claim "${unsupportedClaim}", using grounded strategy.`);
      return fallback;
    }
    return parsed;
  } catch (error) {
    console.warn("AI campaign strategy failed, using grounded strategy:", error);
    return fallback;
  }
}

export async function analyzeCustomerWithAI(customer: any): Promise<{ ai_summary: string; lead_score: number }> {
  const systemInstruction = [
    "Bạn là chuyên gia CRM bất động sản Việt Nam.",
    "Nhiệm vụ: đọc hồ sơ khách hàng, tóm tắt insight bán hàng và chấm lead score.",
    jsonOnlyInstruction()
  ].join("\n");

  const prompt = `
Phân tích khách hàng:
- Tên: ${customer.name}
- Nguồn: ${customer.source}
- Ngân sách: ${customer.budget} tỷ VND
- Khu vực quan tâm: ${customer.interested_area}
- Loại hình quan tâm: ${customer.property_type}
- Trạng thái: ${customer.status}
- Ghi chú: ${customer.notes}

Trả đúng schema:
{
  "summary": "2-3 câu ngắn, nêu động cơ mua, chất lượng tài chính và hành động sale nên làm tiếp",
  "score": 0
}

Quy tắc score:
- 85-100: khách rất nóng, có nhu cầu rõ, tài chính rõ, có khả năng chốt.
- 65-84: khách tiềm năng, cần nuôi dưỡng hoặc thêm thông tin.
- 35-64: lead còn mới/chưa rõ.
- 0-34: thấp hoặc không phù hợp.
`;

  try {
    const rawResult = await generateText(systemInstruction, prompt);
    const resultObj = JSON.parse(extractJson(rawResult));

    return {
      ai_summary: resultObj.summary || "Khách cần được tư vấn thêm trước khi chốt.",
      lead_score: typeof resultObj.score === "number" ? Math.max(0, Math.min(100, resultObj.score)) : 70
    };
  } catch (error) {
    console.error("AI customer analysis failed, using deterministic fallback:", error);
    return {
      ai_summary: `Khách quan tâm ${customer.property_type} tại ${customer.interested_area}, ngân sách khoảng ${customer.budget} tỷ. Sale nên xác minh thời điểm mua, khả năng đặt cọc và gửi 2 lựa chọn phù hợp nhất.`,
      lead_score: Math.min(95, Math.max(20, Math.floor(customer.budget * 8 + (customer.status === "hot" ? 30 : customer.status === "warm" ? 15 : 5))))
    };
  }
}

export async function generatePropertyMarketingContent(property: any, targetPlatform?: string, customTone?: string): Promise<any> {
  const settings = await getAppSettings();
  const tone = customTone || settings.agent_tone;
  const strategy = await generateMarketingStrategy(property, tone);
  const fallbacks = buildMarketingFallbacks(property, strategy);
  const [facebook, zalo, tiktok] = await Promise.all([
    generateChannelMarketingCopy("facebook", property, strategy, tone, fallbacks.facebook),
    generateChannelMarketingCopy("zalo", property, strategy, tone, fallbacks.zalo),
    generateChannelMarketingCopy("tiktok", property, strategy, tone, fallbacks.tiktok)
  ]);
  const imagePrompts = buildMarketingImagePrompts(property, strategy);
  const seo = buildPropertySeo(property);
  return {
    strategy,
    seo,
    facebook: appendStandardHashtags(facebook, seo.hashtags),
    zalo,
    tiktok: appendStandardHashtags(tiktok, seo.hashtags),
    website: `<h1>${seo.title}</h1><p>${seo.meta_description}</p><h2>${property.title}</h2><p>${property.description}</p><p>${strategy.key_message}</p>`,
    image_prompts: imagePrompts,
    image_prompt: imagePrompts.facebook,
    video_prompt: tiktok
  };
}

export async function generateAILiveChatReply(message: string, contextData: { customers: any[]; properties: any[]; posts: any[] }): Promise<string> {
  const settings = await getAppSettings();
  const systemInstruction = [
    "Bạn là AI Assistant nội bộ cho công ty bất động sản.",
    `Giọng văn: ${settings.agent_tone}.`,
    "Bạn chỉ được dựa trên dữ liệu CRM/CMS được cung cấp bên dưới.",
    "Nếu câu hỏi yêu cầu dữ liệu ngoài phạm vi được cấp quyền, hãy nói rõ là chưa có dữ liệu trong hệ thống."
  ].join("\n");

  const topCustomers = contextData.customers
    .slice()
    .sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0))
    .slice(0, 5);
  const topProperties = contextData.properties.slice(0, 5);
  const recentPosts = contextData.posts.slice(0, 5);

  const prompt = `
Dữ liệu user hiện được phép truy cập:
- Tổng khách hàng được phép xem: ${contextData.customers.length}. Top khách ưu tiên: ${topCustomers.map(c => `${c.name} | ${c.phone} | ${c.property_type} | ${c.interested_area} | ${c.budget} tỷ | score ${c.lead_score} | ${c.ai_summary}`).join("; ")}
- Tổng bất động sản được phép xem: ${contextData.properties.length}. Sản phẩm tiêu biểu: ${topProperties.map(p => `${p.title} | ${p.location} | ${p.price} tỷ | ${p.area}m2 | ${p.legal_status} | ${p.sale_status === "sold" ? "đã bán" : "đang bán"} | ghi chú: ${p.internal_notes || "không có"}`).join("; ")}
- Tổng posts được phép xem: ${contextData.posts.length}. Posts gần đây: ${recentPosts.map(p => `[${p.platform}] ${p.title} | ${p.status}`).join("; ")}

Câu hỏi của người dùng:
${message}

Yêu cầu trả lời:
- Ngắn gọn, có cấu trúc nếu cần.
- Nêu tên khách/tài sản cụ thể khi có dữ liệu.
- Nếu đề xuất hành động sale/marketing, ưu tiên việc có thể làm ngay.
`;

  return generateText(systemInstruction, prompt);
}

export async function generateAIConsultantReply(customerMessage: string, assignedCustomer: any, relatedProperty: any) {
  const systemInstruction = [
    "Bạn là chuyên viên tư vấn inbox bất động sản cao cấp.",
    "Soạn câu trả lời lịch sự, rõ ý, có CTA đặt lịch xem hoặc xin số điện thoại nếu cần.",
    "Không cam kết sai về giá, pháp lý, chiết khấu hoặc lợi nhuận."
  ].join("\n");

  const contextPrompt = `
Tin nhắn khách gửi:
"${customerMessage}"

Hồ sơ khách liên quan:
${assignedCustomer ? `- Tên: ${assignedCustomer.name}
- Ngân sách: ${assignedCustomer.budget} tỷ
- Khu vực muốn mua: ${assignedCustomer.interested_area}
- Nhu cầu: ${assignedCustomer.property_type}
- Ghi chú: ${assignedCustomer.notes}` : "Chưa có hồ sơ khách cụ thể."}

Bất động sản liên quan:
${relatedProperty ? `- Tiêu đề: ${relatedProperty.title}
- Giá: ${relatedProperty.price} tỷ
- Pháp lý: ${relatedProperty.legal_status}
- Vị trí: ${relatedProperty.location}
- Mô tả: ${relatedProperty.description}` : "Chưa xác định sản phẩm cụ thể."}

Hãy chỉ trả về nội dung tin nhắn admin có thể gửi ngay cho khách.
`;

  return generateText(systemInstruction, contextPrompt);
}
