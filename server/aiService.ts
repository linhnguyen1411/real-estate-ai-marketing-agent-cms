import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { AppSettings } from "../src/types";

type ProviderName = "ollama" | "openai" | "gemini";

interface AIProviderStatus {
  provider: ProviderName;
  ok: boolean;
  model?: string;
  endpoint?: string;
  message: string;
}

const DB_PATH = path.join(process.cwd(), "db.json");

const DEFAULT_SETTINGS: AppSettings = {
  ai_mode: process.env.DEFAULT_AI_MODE === "openai"
    ? "openai"
    : process.env.DEFAULT_AI_MODE === "gemini"
      ? "gemini"
      : process.env.DEFAULT_AI_MODE === "ollama"
        ? "ollama"
        : "auto",
  ollama_endpoint: process.env.OLLAMA_ENDPOINT || "http://localhost:11434",
  ollama_model: process.env.OLLAMA_MODEL || "qwen3:8b",
  openai_model: process.env.OPENAI_MODEL || "gpt-5-mini",
  agent_tone: process.env.AGENT_TONE || "sang trọng và chuyên nghiệp"
};

function getAppSettings(): AppSettings {
  try {
    if (fs.existsSync(DB_PATH)) {
      const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
      return { ...DEFAULT_SETTINGS, ...(db.settings || {}) };
    }
  } catch (error) {
    console.error("Error loading app settings for AI Service:", error);
  }

  return DEFAULT_SETTINGS;
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

async function callOllama(systemInstruction: string, prompt: string): Promise<string> {
  const settings = getAppSettings();
  const endpoint = `${normalizeEndpoint(settings.ollama_endpoint)}/api/chat`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.ollama_model,
      messages: [
        { role: "system", content: buildSystemInstruction(systemInstruction) },
        { role: "user", content: prompt }
      ],
      stream: false,
      options: {
        temperature: 0.2,
        num_ctx: 8192
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama HTTP ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  const content = json.message?.content || json.response;
  if (!content) throw new Error("Ollama không trả về nội dung.");
  return stripThinking(content);
}

async function callOpenAI(systemInstruction: string, prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY chưa được cấu hình.");
  }

  const settings = getAppSettings();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
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

async function callGemini(systemInstruction: string, prompt: string): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error("GEMINI_API_KEY chưa được cấu hình.");
  }

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction: buildSystemInstruction(systemInstruction),
      temperature: 0.2
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

async function callProvider(provider: ProviderName, systemInstruction: string, prompt: string) {
  if (provider === "ollama") return callOllama(systemInstruction, prompt);
  if (provider === "openai") return callOpenAI(systemInstruction, prompt);
  return callGemini(systemInstruction, prompt);
}

export async function generateText(systemInstruction: string, prompt: string): Promise<string> {
  const settings = getAppSettings();
  const errors: string[] = [];

  for (const provider of providerOrder(settings.ai_mode)) {
    try {
      const result = await callProvider(provider, systemInstruction, prompt);
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
  const settings = getAppSettings();
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
  const settings = getAppSettings();
  const tone = customTone || settings.agent_tone;
  const systemInstruction = [
    "Bạn là AI marketing assistant chuyên bất động sản Việt Nam.",
    `Giọng văn: ${tone}.`,
    "Viết đúng sự thật theo dữ liệu tài sản được cung cấp, không phóng đại pháp lý/lợi nhuận.",
    jsonOnlyInstruction()
  ].join("\n");

  const prompt = `
Tạo bộ nội dung marketing cho bất động sản:
- Tiêu đề: ${property.title}
- Loại hình: ${property.type}
- Vị trí: ${property.location}
- Diện tích: ${property.area} m2
- Giá: ${property.price} tỷ VND
- Pháp lý: ${property.legal_status}
- Hướng: ${property.direction}
- Đường: ${property.road_width} m
- Mô tả: ${property.description}
- Điểm bán hàng: ${(property.selling_points || []).join(", ")}

Trả đúng schema:
{
  "facebook": "Bài Facebook có CTA inbox/đặt lịch xem",
  "zalo": "Tin Zalo ngắn, rõ giá trị và pháp lý",
  "tiktok": "Kịch bản video ngắn + hashtag",
  "website": "Bài SEO có heading HTML cơ bản",
  "image_prompt": "English photorealistic image generation prompt",
  "video_prompt": "English short real estate video prompt"
}
`;

  try {
    const rawResult = await generateText(systemInstruction, prompt);
    return JSON.parse(extractJson(rawResult));
  } catch (error) {
    console.error("AI marketing generator failed, falling back to static templates:", error);
    return {
      facebook: `Hàng mới: ${property.title}\n\nVị trí: ${property.location}\nDiện tích: ${property.area}m2 - Giá: ${property.price} tỷ\nPháp lý: ${property.legal_status}. Đường ${property.road_width}m, hướng ${property.direction}.\n\nInbox để nhận sổ, vị trí chi tiết và lịch xem thực tế.`,
      zalo: `${property.title} - ${property.price} tỷ. ${property.area}m2 tại ${property.location}. Pháp lý: ${property.legal_status}. Nhắn em để nhận thông tin chi tiết.`,
      tiktok: `Mở cảnh tuyến đường trước nhà, lia sang vị trí ${property.location}, nhấn mạnh diện tích ${property.area}m2 và pháp lý ${property.legal_status}. CTA: inbox nhận vị trí và lịch xem. #bdsdanang #nhadat`,
      website: `<h2>${property.title}</h2><p>${property.description}</p><p>Diện tích ${property.area}m2, giá ${property.price} tỷ, pháp lý ${property.legal_status}.</p>`,
      image_prompt: `Photorealistic real estate exterior in ${property.location}, natural daylight, wide angle, clean street, high detail architectural photography.`,
      video_prompt: `Cinematic vertical real estate walkthrough, slow street approach, reveal property frontage, natural daylight, professional real estate tour style.`
    };
  }
}

export async function generateAILiveChatReply(message: string, contextData: { customers: any[]; properties: any[]; posts: any[] }): Promise<string> {
  const settings = getAppSettings();
  const systemInstruction = [
    "Bạn là AI Assistant nội bộ cho công ty bất động sản.",
    `Giọng văn: ${settings.agent_tone}.`,
    "Bạn chỉ được dựa trên dữ liệu CRM/CMS được cung cấp bên dưới.",
    "Nếu câu hỏi yêu cầu dữ liệu ngoài phạm vi được cấp quyền, hãy nói rõ là chưa có dữ liệu trong hệ thống."
  ].join("\n");

  const prompt = `
Dữ liệu user hiện được phép truy cập:
- Khách hàng (${contextData.customers.length}): ${contextData.customers.map(c => `${c.name} | ${c.phone} | ${c.property_type} | ${c.interested_area} | ${c.budget} tỷ | score ${c.lead_score} | ${c.ai_summary}`).join("; ")}
- Bất động sản (${contextData.properties.length}): ${contextData.properties.map(p => `${p.title} | ${p.location} | ${p.price} tỷ | ${p.area}m2 | ${p.legal_status}`).join("; ")}
- Posts (${contextData.posts.length}): ${contextData.posts.map(p => `[${p.platform}] ${p.title} | ${p.status}`).join("; ")}

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
