export function getFacebookConfig() {
  return {
    appId: process.env.FACEBOOK_APP_ID || '',
    appSecret: process.env.FACEBOOK_APP_SECRET || '',
    verifyToken: process.env.FACEBOOK_VERIFY_TOKEN || '',
    pageId: process.env.FACEBOOK_PAGE_ID || '',
    pageAccessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '',
    graphVersion: process.env.FACEBOOK_GRAPH_VERSION || 'v25.0',
  };
}

export function getGraphBaseUrl() {
  const { graphVersion } = getFacebookConfig();
  return `https://graph.facebook.com/${graphVersion}`;
}

export function isFacebookConfigured() {
  const cfg = getFacebookConfig();
  return Boolean(cfg.verifyToken && (cfg.pageAccessToken || cfg.pageId));
}
