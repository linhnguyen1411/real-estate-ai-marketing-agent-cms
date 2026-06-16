import { scanVisibleBlocks, mergeScanLeads } from './multiLeadCollector';
import { enrichLeadsWithServer } from './leadApiClient';
import {
  takeScrollSnapshot,
  scrollFeedDown,
  didScrollAdvance,
  detectCheckpointOrCaptcha
} from './scrollHelper';
import { sendToBackground } from './messaging';
import type { AutoScrollConfig, AutoScrollState } from '../types';

let stopRequested = false;
let running = false;

export function requestStopAutoScroll(): void {
  stopRequested = true;
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  return new Promise(resolve => setTimeout(resolve, ms));
}

function defaultState(config: AutoScrollConfig): AutoScrollState {
  return {
    running: true,
    targetPosts: config.targetPosts,
    collectedLeads: [],
    skippedItems: [],
    loopCount: 0,
    currentScrollY: 0,
    previousScrollY: 0,
    visibleBlocksCount: 0,
    scannedBlocksTotal: 0,
    phonesFoundTotal: 0,
    leadsCreatedTotal: 0,
    newMergedLeads: 0,
    totalCollectedLeads: 0,
    dedupedCount: 0,
    skippedNoiseCount: 0,
    skippedNoBdsContextCount: 0,
    noNewBlockRounds: 0,
    unchangedScrollRounds: 0,
    stopReason: '',
    message: 'Đang bắt đầu Auto Scroll...',
    sessionId: config.sessionId,
    startedAt: new Date().toISOString()
  };
}

async function saveState(state: AutoScrollState): Promise<void> {
  await sendToBackground({ type: 'SAVE_AUTO_SCROLL_STATE', payload: state });
}

export async function runAutoScrollLoop(config: AutoScrollConfig): Promise<void> {
  if (running) {
    stopRequested = true;
    await randomDelay(300, 500);
  }

  running = true;
  stopRequested = false;

  const state = defaultState(config);
  const seenBlockIds = new Set<string>();
  let unchangedScrollRounds = 0;
  let scrollAttempt = 0;

  try {
    await saveState(state);

    while (!stopRequested) {
      if (detectCheckpointOrCaptcha()) {
        state.running = false;
        state.stopReason = 'checkpoint/captcha';
        state.message = 'Dừng: checkpoint/captcha.';
        await saveState(state);
        break;
      }

      state.loopCount += 1;
      const round = scanVisibleBlocks(seenBlockIds, 'loaded');
      const blockIds = Array.from(seenBlockIds);
      const scrollSnap = takeScrollSnapshot(blockIds);
      state.previousScrollY = state.currentScrollY;
      state.currentScrollY = scrollSnap.windowY;
      let incoming = round.leads;
      if (incoming.length) {
        incoming = await enrichLeadsWithServer(incoming);
      }

      const { merged, added, dedupedCount } = mergeScanLeads(state.collectedLeads, incoming);

      state.collectedLeads = merged;
      state.skippedItems = [...state.skippedItems, ...round.skipped].slice(-200);
      state.visibleBlocksCount = round.stats.visibleBlocksCount;
      state.scannedBlocksTotal = seenBlockIds.size;
      state.phonesFoundTotal += round.stats.phonesFoundTotal;
      state.leadsCreatedTotal += round.stats.leadsCreated;
      state.newMergedLeads = added;
      state.totalCollectedLeads = merged.length;
      state.dedupedCount += round.stats.dedupedCount + dedupedCount;
      state.skippedNoiseCount += round.stats.skippedNoiseCount;

      if (round.stats.newBlocksCount === 0 && added === 0) {
        state.noNewBlockRounds += 1;
      } else {
        state.noNewBlockRounds = 0;
        unchangedScrollRounds = 0;
        scrollAttempt = 0;
      }

      state.message = `Vòng ${state.loopCount}: ${round.stats.visibleBlocksCount} block · +${added} lead · tổng ${state.totalCollectedLeads}/${config.targetPosts}`;
      await saveState(state);

      if (state.totalCollectedLeads >= config.targetPosts) {
        state.running = false;
        state.stopReason = 'target_reached';
        state.message = `Hoàn tất: ${state.totalCollectedLeads} lead.`;
        await saveState(state);
        break;
      }

      if (stopRequested) {
        state.running = false;
        state.stopReason = 'user_stop';
        state.message = `Đã dừng: ${state.totalCollectedLeads} lead.`;
        await saveState(state);
        break;
      }

      if (state.noNewBlockRounds >= 6) {
        state.running = false;
        state.stopReason = 'no_new_blocks';
        state.message = `Dừng: 6 vòng không lead mới (${state.totalCollectedLeads} lead).`;
        await saveState(state);
        break;
      }

      const beforeScroll = takeScrollSnapshot(blockIds);
      scrollFeedDown(scrollAttempt, seenBlockIds);
      await randomDelay(2500, 4500);

      let afterScroll = takeScrollSnapshot(blockIds);
      let advanced = didScrollAdvance(beforeScroll, afterScroll);

      if (!advanced && scrollAttempt < 2) {
        scrollAttempt += 1;
        scrollFeedDown(scrollAttempt, seenBlockIds);
        await randomDelay(2000, 3000);
        afterScroll = takeScrollSnapshot(blockIds);
        advanced = didScrollAdvance(beforeScroll, afterScroll);
      }

      state.previousScrollY = beforeScroll.windowY;
      state.currentScrollY = afterScroll.windowY;

      if (advanced) {
        unchangedScrollRounds = 0;
        scrollAttempt = 0;
      } else {
        unchangedScrollRounds += 1;
      }
      state.unchangedScrollRounds = unchangedScrollRounds;

      const stuckLimit = state.totalCollectedLeads < config.targetPosts ? 8 : 5;
      if (unchangedScrollRounds >= stuckLimit && state.noNewBlockRounds >= 3) {
        state.running = false;
        state.stopReason = 'scroll_stuck';
        state.message = `Dừng: scroll kẹt (${state.totalCollectedLeads} lead). Scroll tay xuống feed rồi Start lại.`;
        await saveState(state);
        break;
      }

      await saveState(state);
    }

    if (stopRequested && state.running) {
      state.running = false;
      state.stopReason = 'user_stop';
      state.message = `Đã dừng: ${state.totalCollectedLeads} lead.`;
      await saveState(state);
    }
  } finally {
    running = false;
    stopRequested = false;
  }
}
