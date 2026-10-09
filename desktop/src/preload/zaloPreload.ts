/**
 * Preload script for Zalo Web (chat.zalo.me).
 * Monitors DOM mutations to extract real-time messages from Zalo chat groups.
 */

import { ipcRenderer } from 'electron';
import type { ZaloIncomingMessage } from '../shared/types';

console.log('[Zalo-Preload] Preload script injected into chat.zalo.me');

const processedMessageHashes = new Set<string>();

function getActiveGroupName(): string {
  // Try common header selectors in Zalo Web
  const headerElem =
    document.querySelector('.header-title') ||
    document.querySelector('#header-title') ||
    document.querySelector('.chat-box-header__name') ||
    document.querySelector('.conv-item.active .conv-item__name') ||
    document.querySelector('.conv-item--active .truncate') ||
    document.querySelector('[data-id="header-title"]');

  if (headerElem && headerElem.textContent?.trim()) {
    return headerElem.textContent.trim();
  }

  // Fallback to title tag if it contains group/chat name
  const docTitle = document.title || '';
  if (docTitle.includes('Zalo -')) {
    const parts = docTitle.split('Zalo -');
    if (parts[1]?.trim()) {
      return parts[1].trim();
    }
  }

  return 'Zalo Group';
}

function extractPhone(text: string): string | undefined {
  const match = text.match(/(?:0|\+84)(?:3|5|7|8|9)\d{8}\b/);
  return match ? match[0] : undefined;
}

function getSenderName(el: HTMLElement): string {
  // Look up ancestor or siblings for sender name
  const card = el.closest('.msg-item, .card, .chat-message, [data-id]');
  if (card) {
    const senderElem =
      card.querySelector('.card-sender-name') ||
      card.querySelector('.sender-name') ||
      card.querySelector('.chat-message__author') ||
      card.querySelector('.author-name') ||
      card.querySelector('[data-name]');

    if (senderElem && senderElem.textContent?.trim()) {
      return senderElem.textContent.trim();
    }
  }
  return 'Thành viên Zalo';
}

function processTextMessage(text: string, sender: string, group: string): void {
  const trimmed = text.trim();
  if (trimmed.length < 20 || trimmed.length > 5000) return;

  // Filter out Zalo UI action words
  if (/^(Thu hồi|Đã ghim|Đã xóa|Tin nhắn mới|Trả lời|Bình chọn|Chuyển tiếp)$/i.test(trimmed)) {
    return;
  }

  // Real estate or contact keyword check
  const hasKeywords =
    /(?:tỷ|ty|triệu|bán|cần mua|tìm mua|cho thuê|cần thuê|đất|nhà|bất động sản|nam hòa xuân|hòa xuân|đà nẵng|lô|block|b2|m2|sđt|zalo|liên hệ|\d{9,11})/i.test(
      trimmed
    );

  if (!hasKeywords) return;

  // Deduplicate
  const hash = `${group}_${sender}_${trimmed.slice(0, 60)}`;
  if (processedMessageHashes.has(hash)) return;
  processedMessageHashes.add(hash);

  if (processedMessageHashes.size > 2000) {
    const first = processedMessageHashes.values().next().value;
    if (first) processedMessageHashes.delete(first);
  }

  const payload: ZaloIncomingMessage = {
    groupName: group,
    senderName: sender,
    senderPhone: extractPhone(trimmed),
    content: trimmed,
    timestamp: new Date().toLocaleTimeString('vi-VN'),
  };

  console.log('[Zalo-Preload] Captured real-time message:', {
    group,
    sender,
    phone: payload.senderPhone,
    length: trimmed.length,
  });

  ipcRenderer.send('zalo:new-message', payload);
}

function scanContainer(): void {
  const groupName = getActiveGroupName();

  // Query message bubbles
  const messageElements = document.querySelectorAll<HTMLElement>(
    '.card--text, .bubble-text, .content, .msg-info, .text, [data-content]'
  );

  for (const el of messageElements) {
    const text = el.innerText || el.textContent || '';
    if (text.length >= 20) {
      const sender = getSenderName(el);
      processTextMessage(text, sender, groupName);
    }
  }
}

// Setup MutationObserver
let scanDebounceTimer: NodeJS.Timeout | null = null;

function setupObserver(): void {
  if (!document.body) {
    setTimeout(setupObserver, 500);
    return;
  }

  const observer = new MutationObserver((mutations) => {
    let hasRelevantMutation = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        hasRelevantMutation = true;
        break;
      }
    }

    if (hasRelevantMutation) {
      if (scanDebounceTimer) clearTimeout(scanDebounceTimer);
      scanDebounceTimer = setTimeout(() => {
        scanContainer();
      }, 300);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log('[Zalo-Preload] MutationObserver attached to document.body');

  // Initial scan after 3s
  setTimeout(scanContainer, 3000);
}

window.addEventListener('DOMContentLoaded', setupObserver);
setTimeout(setupObserver, 2000);
