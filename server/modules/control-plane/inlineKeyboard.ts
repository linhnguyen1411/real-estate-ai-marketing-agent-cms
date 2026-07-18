/**
 * Inline keyboard builders for Telegram Operations Center.
 * callback_data kept ≤64 bytes.
 */

export type InlineButton = { text: string; callback_data: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

function truncId(id: string, max = 28): string {
  return id.length <= max ? id : id.slice(0, max);
}

export function missionActionKeyboard(missionOrRunId: string): InlineKeyboard {
  const id = truncId(missionOrRunId);
  return {
    inline_keyboard: [
      [
        { text: 'Retry', callback_data: `m:r:${id}` },
        { text: 'Cancel', callback_data: `m:c:${id}` },
      ],
      [
        { text: 'Pause', callback_data: `m:p:${id}` },
        { text: 'Resume', callback_data: `m:u:${id}` },
      ],
      [{ text: 'Refresh', callback_data: `m:f:${id}` }],
    ],
  };
}

export function publishJobKeyboard(jobId: string): InlineKeyboard {
  const id = truncId(jobId);
  return {
    inline_keyboard: [
      [
        { text: 'Retry', callback_data: `p:r:${id}` },
        { text: 'Cancel', callback_data: `p:c:${id}` },
      ],
      [{ text: 'Refresh', callback_data: `p:f:${id}` }],
    ],
  };
}

export function agentJobKeyboard(jobId: string): InlineKeyboard {
  const id = truncId(jobId);
  return {
    inline_keyboard: [
      [
        { text: 'Retry Mission', callback_data: `j:r:${id}` },
        { text: 'Cancel', callback_data: `j:c:${id}` },
      ],
      [{ text: 'Refresh', callback_data: `j:f:${id}` }],
    ],
  };
}

/** Map callback_data → console command text */
export function callbackDataToCommand(data: string): string | null {
  const raw = String(data || '').trim();
  const parts = raw.split(':');
  if (parts.length < 3) return null;
  const [scope, action, ...rest] = parts;
  const id = rest.join(':');
  if (!id) return null;

  if (scope === 'm') {
    if (action === 'r') return `/mission retry ${id}`;
    if (action === 'c') return `/mission cancel ${id}`;
    if (action === 'p') return `/mission pause ${id}`;
    if (action === 'u') return `/mission resume ${id}`;
    if (action === 'f') return `/mission ${id}`;
  }
  if (scope === 'p') {
    if (action === 'r') return `/publish retry ${id}`;
    if (action === 'c') return `/publish cancel ${id}`;
    if (action === 'f') return `/publish queue`;
  }
  if (scope === 'j') {
    if (action === 'r') return `/jobs`;
    if (action === 'c') return `/mission cancel ${id}`;
    if (action === 'f') return `/jobs running`;
  }
  return null;
}
