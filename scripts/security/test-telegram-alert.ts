/**
 * TEST SCRIPT: VERIFY TELEGRAM NOTIFICATION ON VPS
 *
 * Tests bot credentials and sends a test message to TELEGRAM_LEAD_CHAT_ID.
 *
 * Usage:
 *   npx tsx scripts/security/test-telegram-alert.ts
 */

import 'dotenv/config';
import { sendTelegramMessage } from '../../server/notifications/telegramNotificationService';

async function main() {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const leadChatId = String(
    process.env.TELEGRAM_LEAD_CHAT_ID ||
    process.env.TELEGRAM_CHAT_ID ||
    process.env.TELEGRAM_OPS_CHAT_ID ||
    ''
  ).trim();

  console.log('==> Kiểm tra cấu hình Telegram trên VPS:');
  console.log(`- Bot Token: ${botToken ? botToken.slice(0, 8) + '...' + botToken.slice(-4) : '(Chưa có)'}`);
  console.log(`- Chat ID:   ${leadChatId || '(Chưa có)'}`);

  if (!botToken) {
    console.error('\n❌ LỖI: Thiếu TELEGRAM_BOT_TOKEN trong file .env');
    process.exit(1);
  }

  if (!leadChatId) {
    console.error('\n❌ LỖI: Thiếu TELEGRAM_LEAD_CHAT_ID (hoặc TELEGRAM_CHAT_ID) trong file .env');
    process.exit(1);
  }

  console.log('\n==> Đang gửi tin nhắn thử nghiệm tới Telegram...');

  const result = await sendTelegramMessage({
    botToken,
    chatId: leadChatId,
    text: `🚀 [House & Life AI Agent] Test kết nối VPS -> Telegram thành công!\n⏰ Thời gian: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\n✅ VPS đã sẵn sàng nhận Hot Leads từ Desktop Agent để bắn về nhóm.`,
  });

  if (result.ok) {
    console.log('\n======================================================');
    console.log('🎉 GỬI THÀNH CÔNG!');
    console.log(`Message ID: ${result.messageId}`);
    console.log('Kiểm tra ngay trong Telegram để xác nhận tin nhắn đã xuất hiện.');
    console.log('======================================================\n');
  } else {
    console.error('\n======================================================');
    console.error('❌ GỬI THẤT BẠI:');
    console.error(`Chi tiết lỗi: ${result.error}`);
    console.error('Hướng xử lý:');
    console.error('1. Đảm bảo bot đã được thêm vào Group/Channel.');
    console.error('2. Nếu là Group/Channel, đảm bảo Bot có quyền gửi tin nhắn (Admin).');
    console.error('3. Chat ID cho Group thường có dấu trừ đầu tiên (ví dụ: -1001234567890).');
    console.error('======================================================\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[FATAL] Lỗi không xác định:', err?.message || err);
  process.exit(1);
});
