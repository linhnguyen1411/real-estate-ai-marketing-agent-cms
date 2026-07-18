/**
 * Inline keyboard builders for Telegram Smart Operations.
 * Supports callback_data buttons and url buttons (mobile permalinks).
 * callback_data kept ≤64 bytes.
 */

export type CallbackButton = { text: string; callback_data: string };
export type UrlButton = { text: string; url: string };
export type InlineButton = CallbackButton | UrlButton;
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

function truncId(id: string, max = 28): string {
  return id.length <= max ? id : id.slice(0, max);
}

function isUrlButton(btn: InlineButton): btn is UrlButton {
  return 'url' in btn && typeof (btn as UrlButton).url === 'string';
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
      [
        { text: 'Pause', callback_data: `p:p:${id}` },
        { text: 'Resume', callback_data: `p:u:${id}` },
      ],
      [{ text: 'Refresh', callback_data: `p:f:${id}` }],
    ],
  };
}

/** Job notifications — Retry / Cancel / Pause / Resume / Refresh */
export function agentJobKeyboard(jobId: string): InlineKeyboard {
  const id = truncId(jobId);
  return {
    inline_keyboard: [
      [
        { text: 'Retry', callback_data: `j:r:${id}` },
        { text: 'Cancel', callback_data: `j:c:${id}` },
      ],
      [
        { text: 'Pause', callback_data: `j:p:${id}` },
        { text: 'Resume', callback_data: `j:u:${id}` },
      ],
      [{ text: 'Refresh', callback_data: `j:f:${id}` }],
    ],
  };
}

export type LeadKeyboardInput = {
  findingId: string;
  postUrl?: string | null;
  groupUrl?: string | null;
};

/**
 * Lead alert keyboard:
 * [Mở bài viết] [Mở Group]
 * [Retry] [Bỏ qua]
 * [Tạo Mission]
 */
export function leadAlertKeyboard(input: LeadKeyboardInput): InlineKeyboard {
  const id = truncId(input.findingId);
  const rows: InlineButton[][] = [];
  const linkRow: InlineButton[] = [];
  if (input.postUrl && /^https:\/\//i.test(input.postUrl)) {
    linkRow.push({ text: 'Mở bài viết', url: input.postUrl });
  }
  if (input.groupUrl && /^https:\/\//i.test(input.groupUrl)) {
    linkRow.push({ text: 'Mở Group', url: input.groupUrl });
  }
  if (linkRow.length) rows.push(linkRow);
  rows.push([
    { text: 'Retry', callback_data: `l:r:${id}` },
    { text: 'Bỏ qua', callback_data: `l:s:${id}` },
  ]);
  rows.push([{ text: 'Tạo Mission', callback_data: `l:m:${id}` }]);
  return { inline_keyboard: rows };
}

/** Interactive approval: Approve / Reject / Edit / Create Mission */
export function approvalKeyboard(findingId: string): InlineKeyboard {
  const id = truncId(findingId);
  return {
    inline_keyboard: [
      [
        { text: 'Approve', callback_data: `a:a:${id}` },
        { text: 'Reject', callback_data: `a:j:${id}` },
      ],
      [
        { text: 'Edit', callback_data: `a:e:${id}` },
        { text: 'Create Mission', callback_data: `a:m:${id}` },
      ],
    ],
  };
}

/** Incident: Acknowledge / Retry / Mute / Escalate */
export function incidentKeyboard(entityId: string): InlineKeyboard {
  const id = truncId(entityId);
  return {
    inline_keyboard: [
      [
        { text: 'Acknowledge', callback_data: `i:a:${id}` },
        { text: 'Retry', callback_data: `i:r:${id}` },
      ],
      [
        { text: 'Mute', callback_data: `i:m:${id}` },
        { text: 'Escalate', callback_data: `i:e:${id}` },
      ],
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
    if (action === 'p') return `/mission pause ${id}`;
    if (action === 'u') return `/mission resume ${id}`;
    if (action === 'f') return `/publish queue`;
  }
  if (scope === 'j') {
    if (action === 'r') return `/retry ${id}`;
    if (action === 'c') return `/mission cancel ${id}`;
    if (action === 'p') return `/mission pause ${id}`;
    if (action === 'u') return `/mission resume ${id}`;
    if (action === 'f') return `/jobs running`;
  }
  if (scope === 'l') {
    if (action === 'r') return `/lead retry ${id}`;
    if (action === 's') return `/lead skip ${id}`;
    if (action === 'm') return `/lead mission ${id}`;
  }
  if (scope === 'a') {
    if (action === 'a') return `/approval approve ${id}`;
    if (action === 'j') return `/approval reject ${id}`;
    if (action === 'e') return `/approval edit ${id}`;
    if (action === 'm') return `/approval mission ${id}`;
  }
  if (scope === 'i') {
    if (action === 'a') return `/incident ack ${id}`;
    if (action === 'r') return `/incident retry ${id}`;
    if (action === 'm') return `/incident mute ${id}`;
    if (action === 'e') return `/incident escalate ${id}`;
  }
  return null;
}

export { isUrlButton };
