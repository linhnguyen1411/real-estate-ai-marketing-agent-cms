import { AppSettings, ChatMessage } from '../types';

export const DEFAULT_SETTINGS: AppSettings = {
  ai_mode: 'auto',
  ollama_endpoint: 'http://localhost:11434',
  ollama_model: 'qwen3:8b',
  openai_model: 'gpt-5-mini',
  agent_tone: 'chuyên nghiệp'
};

export const ASSISTANT_WELCOME_MESSAGE: ChatMessage = {
  role: 'model',
  content: 'Xin chào! Tôi là Trợ lý Real Estate AI Marketing Agent. Tôi nắm bắt toàn bộ danh sách khách hàng CRM và giỏ hàng bất động sản. Bạn cần tôi trợ giúp gì hôm nay?',
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
};
