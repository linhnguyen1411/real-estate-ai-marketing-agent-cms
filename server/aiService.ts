import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

// Initialize standard Gemini client
// Note: User-Agent set to 'aistudio-build' is required for SDK telemetry
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARN: GEMINI_API_KEY is not defined in environment variables. Falling back...");
  }
  return new GoogleGenAI({
    apiKey: apiKey || "MOCK_KEY",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

const ai = getGeminiClient();

// Load settings from db.json securely
function getAppSettings() {
  try {
    const dbPath = path.join(process.cwd(), "db.json");
    if (fs.existsSync(dbPath)) {
      const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
      return db.settings || {
        ai_mode: "gemini",
        ollama_endpoint: "http://localhost:11434",
        ollama_model: "qwen2.5",
        agent_tone: "sang trọng và chuyên nghiệp"
      };
    }
  } catch (error) {
    console.error("Error loading app settings for AI Service:", error);
  }
  return {
    ai_mode: "gemini",
    ollama_endpoint: "http://localhost:11434",
    ollama_model: "qwen2.5",
    agent_tone: "sang trọng và chuyên nghiệp"
  };
}

// Call Ollama local service
async function callOllama(systemInstruction: string, prompt: string): Promise<string> {
  const settings = getAppSettings();
  const endpoint = `${settings.ollama_endpoint}/api/chat`;
  
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.ollama_model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ],
        stream: false
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP Error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    return json.message?.content || JSON.stringify(json);
  } catch (err: any) {
    console.error("Ollama client connection failed:", err);
    throw new Error(
      `Không thể kết nối tới Ollama tại '${settings.ollama_endpoint}' (${err.message}). ` +
      `Hãy chắc chắn rằng Ollama đang chạy cục bộ (ollama serve) và bạn đã pull model '${settings.ollama_model}' thành công. Đang fallback hoặc hiển thị demo.`
    );
  }
}

// Generate text helper supporting both modes
export async function generateText(systemInstruction: string, prompt: string): Promise<string> {
  const settings = getAppSettings();
  
  if (settings.ai_mode === "ollama") {
    try {
      return await callOllama(systemInstruction, prompt);
    } catch (error: any) {
      // Fallback or bubble clear message
      return `[LỖI OLLAMA] ${error.message}\n\n[Hệ thống tự động sử dụng Gemini 3.5 làm phương án dự phòng cho demo]:\n\n` + 
             await callGemini(systemInstruction, prompt);
    }
  } else {
    return await callGemini(systemInstruction, prompt);
  }
}

// Concrete Gemini Call
async function callGemini(systemInstruction: string, prompt: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      },
    });
    
    return response.text || "Không nhận được phản hồi từ AI.";
  } catch (error: any) {
    console.error("Gemini Generation Error:", error);
    return `[LỖI KHỞI TẠO AI] Không thể tạo nội dung qua Gemini API (${error.message || error}). Vui lòng kiểm tra GEMINI_API_KEY ở Settings > Secrets.`;
  }
}

// AI Service API Operations
export async function analyzeCustomerWithAI(customer: any): Promise<{ ai_summary: string; lead_score: number }> {
  const systemInstruction = "Bạn là Giám đốc Marketing và Chuyên viên phân tích khách hàng kỳ cựu trong ngành bất động sản Việt Nam. Hãy đọc phân khúc khách hàng, ghi chú ban đầu của chuyên viên và tiến hành đánh giá khách hàng.";
  const prompt = `
Hãy phân tích khách hàng sau đây một cách sâu sắc để tạo tóm tắt gợi ý hành động chăm sóc bán hàng và cho điểm tiềm năng (lead score từ 0 đến 100).

Thông tin khách hàng:
- Tên: ${customer.name}
- Nguồn thu thập: ${customer.source}
- Ngân sách: ${customer.budget} tỷ VND
- Khu vực quan tâm: ${customer.interested_area}
- Loại hình quan tâm: ${customer.property_type}
- Trạng thái hiện tại: ${customer.status}
- Ghi chú hiện tại: ${customer.notes}

Yêu cầu xuất ra định dạng JSON chính xác như sau:
{
  "summary": "Tóm tắt khoảng 2-3 câu ngắn gọn phân tích động cơ mua bds, chất lượng tài chính, các đề xuất cụ thể bước tiếp theo phải làm gì để chốt giao dịch nhanh chóng.",
  "score": <một số nguyên hợp lệ từ 0 đến 100 phản ánh độ sẵn sàng cọc và thiện chí của khách>
}
  `;

  try {
    const rawResult = await generateText(
      systemInstruction, 
      prompt + "\n\nLƯU Ý: CHỈ TRẢ VỀ JSON KHÔNG THÊM BẤT KỲ CHỮ NÀO KHÁC NGOÀI CÚ PHÁP JSON SẠCH."
    );
    
    // Parse JSON safely
    const cleanerJson = rawResult.replace(/```json/g, "").replace(/```/g, "").trim();
    const resultObj = JSON.parse(cleanerJson);
    return {
      ai_summary: resultObj.summary || "Khách hàng tốt cần sắp xếp cuộc hẹn.",
      lead_score: typeof resultObj.score === 'number' ? resultObj.score : 70
    };
  } catch (e) {
    console.error("JSON parsing error on AI customer analysis, using regex or defaults...", e);
    // Rough regex lookup or fallback
    return {
      ai_summary: `Khách hàng tiềm năng mảng ${customer.property_type} tại khu ${customer.interested_area} với ngân sách ${customer.budget} tỷ. Cần liên hệ hẹn đi xem mặt bằng ngay và hướng dẫn tài chính vay mua ngân hàng.`,
      lead_score: Math.min(95, Math.max(20, Math.floor(customer.budget * 8 + (customer.status === 'hot' ? 30 : customer.status === 'warm' ? 15 : 5))))
    };
  }
}

export async function generatePropertyMarketingContent(property: any, targetPlatform?: string, customTone?: string): Promise<any> {
  const settings = getAppSettings();
  const tone = customTone || settings.agent_tone;
  const sysInst = `Bạn là Trợ lý AI Marketing chuyên sâu về thị trường bất động sản Đà Nẵng, Quảng Nam nói riêng và Việt Nam nói chung. Giọng văn của bạn: ${tone}.`;
  
  const prompt = `
Hãy viết nội dung truyền thông tuyệt vời cho bất động sản sau đây:

Tiêu đề: ${property.title}
Loại hình: ${property.type}
Vị trí: ${property.location}
Diện tích: ${property.area} m2
Giá: ${property.price} tỷ VND
Pháp lý: ${property.legal_status}
Hướng: ${property.direction}
Độ rộng mặt đường: ${property.road_width} m
Mô tả chi tiết: ${property.description}
Điểm nhấn bán hàng chính: ${property.selling_points ? property.selling_points.join(", ") : "View sông, tiềm năng kinh doanh"}

Hãy phát sinh ra các phần nội dung tiếp thị tương ứng bao gồm:
1. Bài đăng Facebook (dài đẹp, có emo, kêu gọi gọi hotline và đặt lịch đi xem thực tế)
2. Bài đăng quảng cáo Zalo ngắn gọn, xúc tích, sổ sách rõ nét
3. Bài viết Tiktok (bản kịch bản lời bình luận thuyết minh video ngắn và tập hợp hashtag)
4. Bài viết Website SEO chuyên sâu (có chia subheadings, thuyết phục nhà đầu tư bằng lập luận, tăng sự thèm khát và có ích cho tối ưu từ khóa tìm kiếm)
5. Prompt sinh ảnh minh họa (viết bằng Tiếng Anh chi tiết để tạo ảnh đẹp, chất lượng nhiếp ảnh photographic, render 8k cho biệt thự/nhà phố này)
6. Prompt sinh video ngắn (mô tả góc quay drone hoặc panning tuyệt đẹp để render AI video)

Hãy phản hồi DUY NHẤT một chuỗi JSON có cấu trúc chính xác không sai lệch:
{
  "facebook": "Nội dung bài viết Facebook ở đây...",
  "zalo": "Nội dung đăng Zalo ở đây...",
  "tiktok": "Kịch bản và hashtags Tiktok ở đây...",
  "website": "Bài viết website SEO ở đây...",
  "image_prompt": "Chi tiết photographic prompt bằng tiếng Anh ở đây...",
  "video_prompt": "Chi tiết video production prompt bằng tiếng Anh ở đây..."
}
  `;

  try {
    const rawResult = await generateText(
      sysInst, 
      prompt + "\n\nLƯU Ý: CHỈ TRẢ VỀ JSON KHÔNG THÊM BẤT KỲ CHỮ NÀO KHÁC NGOÀI CÚ PHÁP JSON SẠCH."
    );
    const cleanerJson = rawResult.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanerJson);
  } catch (error) {
    console.error("AI marketing generator failed, falling back to static templates...", error);
    return {
      facebook: `💎 SIÊU PHẨM MỚI COONG: ${property.title} 💎\n\n📍 Vị trí đắc địa: ${property.location}\n📐 Diện tích: ${property.area}m2 - Giá chỉ: ${property.price} Tỷ\n✨ Sổ hồng sạch tinh tươm. Đường vào ${property.road_width}m cực thoáng dã.\n🌟 Giao thông thuận tiện, khu dân cư vô cùng an ninh.\n\n☎️ Liên hệ ngay để check sổ đỏ và thương lượng trực tiếp!`,
      zalo: `🔥 Bán nhanh ${property.title} - ${property.price} Tỷ\n- Diện tích ${property.area}m2, vị trí cực vip tại ${property.location}.\n- Pháp lý: ${property.legal_status} chính chủ.\nNhắn tin ngay để nhận sơ đồ thửa đất!`,
      tiktok: `Đất đẹp Đà Nẵng giá trị cao lên sóng! Diện tích ${property.area}m2 tại ${property.location} giá chỉ ${property.price} tỷ cực hot. Pháp lý sổ hồng sang tên liền tay. Xem đất ngay nào quý vị! #bdsdanang #nhadatdanang`,
      website: `<h3>Bài Viết SEO: Đánh Giá Đất Nền Cực Tiềm Năng Tại ${property.location}</h3><p>${property.description}</p><p>Sở hữu pháp lý ${property.legal_status} hoàn chỉnh cùng mức giá ${property.price} tỷ đồng, đây là cơ hội tích sản sinh lời tuyệt đối có một không hai tại thị trường bất động sản Đà Nẵng giữa năm nay.</p>`,
      image_prompt: `Photorealistic architecture capture of a modern real estate house located at ${property.location}, sun rays warming visual look, drone angle view, high fidelity photorealism 8k, ultra-detailed architectural concept design.`,
      video_prompt: `Drone cinematic vertical video starting with dynamic sunrise over a water stream, turning round slowly over a newly laid road to reveal clean luxury real estate development.`
    };
  }
}

export async function generateAILiveChatReply(message: string, contextData: { customers: any[]; properties: any[]; posts: any[] }): Promise<string> {
  const settings = getAppSettings();
  const sysHeader = `Bạn là Trợ lý AI Giám đốc Marketing của văn phòng Bất động sản miền Trung phong cách ${settings.agent_tone}. 
Bạn nắm trong lòng bàn tay toàn bộ cơ sở dữ liệu của văn phòng bao gồm thông tin khách hàng tiềm năng CRM, các rổ hàng dự án bất động sản mở bán, và kế hoạch bài viết chiến dịch CMS.

DƯ LIỆU SẴN CÓ CỦA VĂN PHÒNG:
- Tổng số khách hàng CRM: ${contextData.customers.length} khách hàng. Danh sách sơ bộ: ${contextData.customers.map(c => `${c.name} (${c.phone}, thích ${c.property_type} ở ${c.interested_area}, ngân sách ${c.budget}tỷ, độ tiềm năng Lead Score: ${c.lead_score}, ai tóm tắt: ${c.ai_summary})`).join("; ")}
- Rổ hàng Bất động sản đang bán: ${contextData.properties.length} căn/lô. Danh sách: ${contextData.properties.map(p => `${p.title} tại ${p.location} giá ${p.price}tỷ m2: ${p.area}`).join("; ")}
- Bài viết CMS Marketing: ${contextData.posts.length} bài. Danh sách: ${contextData.posts.map(p => `[${p.platform}] ${p.title} (trạng thái: ${p.status})`).join("; ")}

Nhiệm vụ của bạn là hãy giải quyết câu hỏi và cung cấp tư vấn thực sự khôn ngoan, súc tích, đậm chất Việt Nam. 
Ví dụ khách hỏi 'Khách nào đang nóng nhất?' hay 'Tóm tắt khách hàng Nguyễn Văn Anh' hoặc 'Viết hộ bài đăng bán lô đất...', hãy lục ngay dữ liệu cấu trúc bên trên để sinh ra phản hồi chính xác hoàn hảo đầy chuyên nghiệp. Nếu người dùng hỏi viết bài mới phát sinh không nằm trong DB, cứ mặc sức dựa trên tài năng sáng tạo của bạn để thiết kế bài quảng bá vô cùng lôi cuốn.`;

  return await generateText(sysHeader, message);
}

export async function generateAIConsultantReply(customerMessage: string, assignedCustomer: any, relatedProperty: any) {
  const sysInstruction = `Bạn là Chuyên viên tư vấn chăm sóc khách hàng bất động sản cao cấp, tinh tế, thông minh và cực kỳ thấu cảm tâm lý người mua hàng.`;
  const contextPrompt = `
Chào ad, khách hàng tên ${assignedCustomer ? assignedCustomer.name : "Ẩn danh"} đang chat trực tiếp hỏi thăm bất động sản.
Nội dung tin nhắn khách gửi: "${customerMessage}"

Thời điểm quan hệ khách hàng trong CRM:
${assignedCustomer ? `- Ngân sách khách: ${assignedCustomer.budget} tỷ VND\n- Khu vực muốn mua: ${assignedCustomer.interested_area}\n- Ghi chú: ${assignedCustomer.notes}` : "Chưa liên kết hồ sơ khách hàng cụ thể."}

Thông tin bất động sản liên đới nếu có:
${relatedProperty ? `- Tiêu đề: ${relatedProperty.title}\n- Giá bán: ${relatedProperty.price} tỷ\n- Pháp lý: ${relatedProperty.legal_status}\n- Vị trí: ${relatedProperty.location}\n- Mô tả nhanh: ${relatedProperty.description}` : "Sản phẩm đang được quan tâm thảo luận chung hoặc hỏi định vị chung."}

Nhiệm vụ: Hãy lập đề thi tuyển soạn thảo một câu trả lời hoàn hảo cho Admin dùng để phản hồi inbox của khách hàng này ngay. Câu trả lời phải đạt chuẩn:
- Rất lịch sự, súc tích và giải quyết chính xác câu hỏi của khách (VD: có sổ hoàn công chưa, có vay mượn được không, bớt lộc ra sao).
- Chìa khóa vàng: Kích thích tò mò lôi kéo khách hàng cho số điện thoại tạo cuộc hẹn gặp trực tiếp ngoài đời đi xem dự án (hoặc cọc thiện chí).
- Giữ giọng văn ngọt ngào, mộc mạc đậm chất tư vấn viên cao cấp Việt Nam.

Hãy chỉ trả về nội dung câu trả lời soạn thảo hoàn chỉnh, không kèm chú thích hay râu ria khác.
  `;

  return await generateText(sysInstruction, contextPrompt);
}
