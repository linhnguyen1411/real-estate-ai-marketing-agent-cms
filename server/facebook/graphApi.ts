import { getFacebookConfig, getGraphBaseUrl } from './config';

export interface FacebookConnectionTestResult {
  ok: boolean;
  pageId?: string;
  pageName?: string;
  testedAt: string;
  error?: {
    message: string;
    code?: number;
    type?: string;
    subcode?: number;
  };
  hint?: string;
}

export async function testFacebookPageConnection(): Promise<FacebookConnectionTestResult> {
  const cfg = getFacebookConfig();
  const testedAt = new Date().toISOString();

  if (!cfg.pageId || !cfg.pageAccessToken) {
    return {
      ok: false,
      testedAt,
      error: { message: 'Thiếu FACEBOOK_PAGE_ID hoặc FACEBOOK_PAGE_ACCESS_TOKEN trong env' },
      hint: 'Thêm token Page long-lived vào file .env rồi restart server.',
    };
  }

  const url = `${getGraphBaseUrl()}/${encodeURIComponent(cfg.pageId)}?fields=id,name&access_token=${encodeURIComponent(cfg.pageAccessToken)}`;

  try {
    const response = await fetch(url);
    const data = await response.json() as {
      id?: string;
      name?: string;
      error?: { message: string; code?: number; type?: string; error_subcode?: number };
    };

    if (!response.ok || data.error) {
      const err = data.error || { message: `HTTP ${response.status}` };
      let hint = 'Kiểm tra Page Access Token còn hiệu lực và đúng Fanpage.';
      if (err.code === 190) {
        hint = 'Token hết hạn hoặc user logout — tạo Page Access Token mới trong Meta Developer Console.';
      } else if (err.code === 10 || err.code === 200) {
        hint = 'Thiếu quyền pages_read_engagement / pages_messaging trên token.';
      }
      return {
        ok: false,
        pageId: cfg.pageId,
        testedAt,
        error: {
          message: err.message,
          code: err.code,
          type: err.type,
          subcode: err.error_subcode,
        },
        hint,
      };
    }

    return {
      ok: true,
      pageId: data.id,
      pageName: data.name,
      testedAt,
    };
  } catch (error) {
    return {
      ok: false,
      pageId: cfg.pageId,
      testedAt,
      error: { message: error instanceof Error ? error.message : 'Network error' },
      hint: 'Không kết nối được Graph API — kiểm tra mạng hoặc FACEBOOK_GRAPH_VERSION.',
    };
  }
}

export { getFacebookMessengerUrl, getFacebookPostUrl } from './facebookApi';
