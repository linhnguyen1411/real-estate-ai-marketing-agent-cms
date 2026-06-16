export interface BgResponse<T = unknown> {
  ok: boolean;
  error?: string;
  storageAvailable?: boolean;
  context?: string;
  data?: T;
}

export function safeSendMessage(message: object): void {
  try {
    if (!chrome?.runtime?.id) return;
    chrome.runtime.sendMessage(message).catch(error => {
      console.warn('Extension message failed', error);
    });
  } catch (error) {
    console.warn('Extension message failed', error);
  }
}

export async function sendToBackground<T = unknown>(message: object): Promise<BgResponse<T>> {
  if (!chrome?.runtime?.id) {
    return { ok: false, error: 'Extension context unavailable' };
  }

  try {
    const response = (await chrome.runtime.sendMessage(message)) as BgResponse<T>;
    return response ?? { ok: false, error: 'Empty background response' };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}

export async function bgGet<T>(type: string): Promise<T | null> {
  const res = await sendToBackground<T>({ type });
  if (!res.ok) return null;
  return (res.data as T) ?? null;
}

export async function bgSave(type: string, payload: unknown): Promise<boolean> {
  const res = await sendToBackground({ type, payload });
  return res.ok;
}
