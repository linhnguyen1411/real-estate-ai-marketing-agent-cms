export type SitePolicy = {
  id: 'facebook' | 'masked-portal' | 'generic';
  label: string;
  autoScrollSupported: boolean;
  manualScanHint: string;
};

const MASKED_PORTAL_HOSTS = [
  'chotot.com',
  'batdongsan.com.vn',
  'alonhadat.com.vn',
  'mogi.vn',
  'homedy.com',
  'nhatot.com'
];

export function getSitePolicy(pageUrl: string): SitePolicy {
  let host = '';
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, '');
  } catch {
    host = '';
  }

  if (host.includes('facebook.com')) {
    return {
      id: 'facebook',
      label: 'Facebook',
      autoScrollSupported: true,
      manualScanHint:
        'Facebook Group: quét từng post block trong viewport — không dùng body.innerText.'
    };
  }

  if (MASKED_PORTAL_HOSTS.some(h => host.includes(h))) {
    return {
      id: 'masked-portal',
      label: host,
      autoScrollSupported: false,
      manualScanHint:
        'Trang này thường che SĐT trên danh sách. Mở chi tiết tin → bấm "Hiện số"/"Liên hệ" → Quét trang hiện tại.'
    };
  }

  return {
    id: 'generic',
    label: host || 'Website',
    autoScrollSupported: false,
    manualScanHint:
      'Auto Scroll chỉ dùng cho Facebook Group. Trang khác: mở bài đã hiện SĐT rồi dùng Quét thủ công.'
  };
}

export function isFacebookFeedUrl(pageUrl: string): boolean {
  try {
    return new URL(pageUrl).hostname.includes('facebook.com');
  } catch {
    return false;
  }
}
