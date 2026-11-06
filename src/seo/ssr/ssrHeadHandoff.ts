const SSR_ATTRIBUTE = 'data-seo-ssr';

const TRACKED_SELECTOR = 'title, meta, link[rel], script[type="application/ld+json"]';

function headKey(element: Element): string | null {
  switch (element.tagName) {
    case 'TITLE':
      return 'title';
    case 'META': {
      const name = element.getAttribute('name');
      if (name) return `meta:name:${name.toLowerCase()}`;
      const property = element.getAttribute('property');
      if (property) return `meta:property:${property.toLowerCase()}`;
      return null;
    }
    case 'LINK': {
      const rel = element.getAttribute('rel');
      return rel ? `link:${rel.toLowerCase()}` : null;
    }
    case 'SCRIPT':
      return element.getAttribute('type') === 'application/ld+json' ? 'script:ld+json' : null;
    default:
      return null;
  }
}

/**
 * SSR writes crawler-facing tags then the SPA mounts the same tags via React 19
 * hoisting, which does not dedupe pre-existing head nodes. Drop each SSR tag
 * once a client-rendered counterpart with the same identity exists.
 */
export function dropSupersededSsrHeadTags(): void {
  const head = document.head;
  if (!head) return;

  const clientKeys = new Set<string>();
  head.querySelectorAll(TRACKED_SELECTOR).forEach(element => {
    if (element.hasAttribute(SSR_ATTRIBUTE)) return;
    const key = headKey(element);
    if (key) clientKeys.add(key);
  });
  if (!clientKeys.size) return;

  head.querySelectorAll(`[${SSR_ATTRIBUTE}]`).forEach(element => {
    const key = headKey(element);
    if (key && clientKeys.has(key)) element.remove();
  });
}

export function installSsrHeadHandoff(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }

  let scheduled = false;
  const run = () => {
    scheduled = false;
    dropSupersededSsrHeadTags();
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.head, { childList: true });
  schedule();
  return () => observer.disconnect();
}
