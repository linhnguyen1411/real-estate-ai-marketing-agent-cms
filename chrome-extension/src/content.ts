import type { MessageType } from './types';
import { scanVisibleBlocks } from './lib/multiLeadCollector';
import { runAutoScrollLoop, requestStopAutoScroll } from './lib/autoScrollLoop';
import { highlightBlock, scrollToBlock, getScanDebugInfo } from './lib/postBlockScanner';
import { getSitePolicy } from './lib/sitePolicy';
import { safeSendMessage } from './lib/messaging';

export const EXTENSION_VERSION = '3.1.4';

declare global {
  interface Window {
    __estoriaLeadCollectorInit?: boolean;
  }
}

const HIGHLIGHT_STYLE_ID = 'estoria-highlight-style';

function injectHighlightStyle(): void {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
    .estoria-block-highlight {
      outline: 3px solid #e11d48 !important;
      outline-offset: 2px;
      background: rgba(225, 29, 72, 0.08) !important;
    }
  `;
  document.head.appendChild(style);
}

if (window.top !== window.self) {
  // skip iframe
} else if (!window.__estoriaLeadCollectorInit) {
  window.__estoriaLeadCollectorInit = true;
  injectHighlightStyle();
  console.info(`[Estoria] v${EXTENSION_VERSION} loaded`);

  const isTopFrame = window.top === window.self;

  chrome.runtime.onMessage.addListener((message: MessageType, _sender, sendResponse) => {
    try {
      if (message.type === 'PING') {
        sendResponse({ ok: true, isTopFrame, version: EXTENSION_VERSION, debug: getScanDebugInfo() });
        return false;
      }

      if (message.type === 'SCAN_VISIBLE_BLOCKS') {
        const round = scanVisibleBlocks(new Set<string>());
        sendResponse(round);
        return false;
      }

      if (message.type === 'START_AUTO_SCROLL') {
        runAutoScrollLoop(message.config).catch(err => console.warn('[Estoria]', err));
        sendResponse({ ok: true });
        return false;
      }

      if (message.type === 'STOP_AUTO_SCROLL') {
        requestStopAutoScroll();
        sendResponse({ ok: true });
        return false;
      }

      if (message.type === 'HIGHLIGHT_BLOCK') {
        sendResponse({ ok: highlightBlock(message.blockId) });
        return false;
      }

      if (message.type === 'SCROLL_TO_BLOCK') {
        sendResponse({ ok: scrollToBlock(message.blockId) });
        return false;
      }

      if (message.type === 'GET_SITE_POLICY') {
        sendResponse(getSitePolicy(location.href));
        return false;
      }
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
    return false;
  });

  safeSendMessage({
    type: 'SAVE_DEBUG_STATE',
    payload: { context: 'content', isTopFrame, updatedAt: new Date().toISOString() }
  });
}
