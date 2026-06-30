import { getGraphBaseUrl, getFacebookConfig } from './config';
import { getActivePageAccessToken } from './facebookDb';

export async function fetchFacebookUserProfile(psid: string, pageId?: string) {
  const token = await getActivePageAccessToken(pageId);
  if (!token) return null;

  const fields = 'first_name,last_name,profile_pic';
  const url = `${getGraphBaseUrl()}/${encodeURIComponent(psid)}?fields=${fields}&access_token=${encodeURIComponent(token)}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json() as {
    first_name?: string;
    last_name?: string;
    profile_pic?: string;
  };
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
  return {
    name: name || undefined,
    profilePic: data.profile_pic,
  };
}

export function getFacebookPostUrl(postId?: string) {
  if (!postId) return null;
  const cfg = getFacebookConfig();
  if (cfg.pageId) {
    return `https://www.facebook.com/${cfg.pageId}/posts/${postId}`;
  }
  return `https://www.facebook.com/${postId}`;
}

export function getFacebookMessengerUrl(psid?: string) {
  if (!psid) return null;
  return `https://www.facebook.com/messages/t/${psid}`;
}
