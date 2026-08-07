export type ResolveRobotsInput = {
  noindex?: boolean;
};

/**
 * Robots directives — single place only.
 * Preserves historical strings used by SeoHead / SSR.
 */
export function resolveRobots(input: ResolveRobotsInput = {}): string {
  if (input.noindex) return 'noindex, nofollow';
  return 'index, follow, max-image-preview:large';
}
