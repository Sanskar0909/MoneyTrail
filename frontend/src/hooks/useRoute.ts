import { useSyncExternalStore } from 'react';

/** The pages the app has. */
export type Route = { page: 'receipts' } | { page: 'review'; receiptId: number };

export const RECEIPTS_HREF = '#/';

export function reviewHref(receiptId: number): string {
  return `#/receipts/${receiptId}`;
}

/** `#/receipts/17` → the review page for receipt 17. Anything else is the receipt list. */
export function parseRoute(hash: string): Route {
  const match = /^#\/receipts\/(\d+)\/?$/.exec(hash);
  return match ? { page: 'review', receiptId: Number(match[1]) } : { page: 'receipts' };
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function readHash(): string {
  return window.location.hash;
}

/**
 * Which page to show, read from the hash part of the URL.
 *
 * A hash rather than a path because the server never sees it: `/#/receipts/17` loads index.html
 * from any static host, whereas `/receipts/17` would need a fallback rule on every server that
 * ever serves the app. Links, back and forward, bookmarks and new tabs all work either way.
 *
 * Two pages don't justify a router library. When there are nested layouts or many parameters,
 * React Router is the usual next step.
 */
export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, readHash));
}
