/**
 * Canonical page classification for the SEO Engine.
 * `404` is the not-found page type (string enum member).
 */
export enum PageType {
  HOME = 'HOME',
  CATALOG = 'CATALOG',
  PROJECT = 'PROJECT',
  PROPERTY = 'PROPERTY',
  ARTICLE = 'ARTICLE',
  COMPARISON = 'COMPARISON',
  FINANCIAL = 'FINANCIAL',
  LEGAL = 'LEGAL',
  LOCATION = 'LOCATION',
  SEARCH = 'SEARCH',
  /** Not found — enum member name is invalid as bare `404`, value is `'404'`. */
  NOT_FOUND = '404',
}
