import type { AppSettings, Property } from '../../../src/types';
import { buildPropertySeo } from '../../aiService';
import {
  collectSiteSeoKeywords as buildSiteSeoKeywords,
  getPropertyContentForHashtags,
  mergeKeywordLists,
  mergePostHashtags,
} from '../../../src/utils/hashtags';

export const DEFAULT_SEO_KEYWORDS = [
  'bất động sản sun group đà nẵng',
  'căn hộ cao cấp đà nẵng',
  'bất động sản nam đà nẵng',
  'shophouse kinh doanh đà nẵng',
  'giá đất đà nẵng 2026'
];

export function syncSiteSeoKeywords(db: { properties?: Property[]; settings?: AppSettings }) {
  const seoKeywords = buildSiteSeoKeywords(db.properties || [], DEFAULT_SEO_KEYWORDS);
  db.settings = {
    ...(db.settings || {}),
    seo_keywords: seoKeywords
  } as AppSettings;
  return seoKeywords;
}

export function applyPropertyHashtagSeo(property: Property): Property {
  const contentText = getPropertyContentForHashtags(property);
  const { hashtags, keywords: parsedKeywords } = mergePostHashtags(contentText);
  const baseSeo = buildPropertySeo(property);
  const existingSeo = property.ai_posts?.seo;

  const seo = {
    title: existingSeo?.title || baseSeo.title,
    meta_description: existingSeo?.meta_description || baseSeo.meta_description,
    keywords: parsedKeywords.length
      ? mergeKeywordLists(parsedKeywords, existingSeo?.keywords || baseSeo.keywords)
      : (existingSeo?.keywords || baseSeo.keywords),
    hashtags: hashtags.length
      ? hashtags
      : (existingSeo?.hashtags || baseSeo.hashtags)
  };

  return {
    ...property,
    ai_posts: {
      facebook: property.ai_posts?.facebook || '',
      zalo: property.ai_posts?.zalo || '',
      tiktok: property.ai_posts?.tiktok || '',
      website: property.ai_posts?.website || '',
      image_prompt: property.ai_posts?.image_prompt || '',
      video_prompt: property.ai_posts?.video_prompt || '',
      strategy: property.ai_posts?.strategy,
      image_prompts: property.ai_posts?.image_prompts,
      seo
    }
  };
}
