import { useSyncExternalStore } from 'react';

/** Which receipts the Receipts page shows. */
export const RECEIPT_FILTERS = ['all', 'waiting', 'confirmed', 'failed'] as const;

export type ReceiptFilter = (typeof RECEIPT_FILTERS)[number];

/** The pages the app has. */
export type Route =
  /** `month` is null for "whatever month it is today". */
  | { page: 'spending'; month: string | null }
  | { page: 'receipts'; filter: ReceiptFilter }
  | { page: 'add' }
  | { page: 'review'; receiptId: number };

export const SPENDING_HREF = '#/';
export const RECEIPTS_HREF = '#/receipts';
export const ADD_HREF = '#/add';

/** The spending overview with one month picked out, `2026-10`. */
export function spendingHref(month: string): string {
  return `#/month/${month}`;
}

export function receiptsHref(filter: ReceiptFilter): string {
  return filter === 'all' ? RECEIPTS_HREF : `${RECEIPTS_HREF}/${filter}`;
}

export function reviewHref(receiptId: number): string {
  return `${RECEIPTS_HREF}/${receiptId}`;
}

function isReceiptFilter(value: string): value is ReceiptFilter {
  return (RECEIPT_FILTERS as readonly string[]).includes(value);
}

/**
 * `#/receipts/17` → the review page for receipt 17, `#/receipts/waiting` → the list, filtered,
 * `#/month/2026-10` → the overview for October. Anything unrecognised is the overview.
 */
export function parseRoute(hash: string): Route {
  const [, section = '', detail = ''] = hash.replace(/\/$/, '').split('/');

  if (section === 'receipts') {
    if (/^\d+$/.test(detail)) return { page: 'review', receiptId: Number(detail) };
    return { page: 'receipts', filter: isReceiptFilter(detail) ? detail : 'all' };
  }
  if (section === 'add') return { page: 'add' };
  if (section === 'month' && /^\d{4}-(0[1-9]|1[0-2])$/.test(detail)) {
    return { page: 'spending', month: detail };
  }
  return { page: 'spending', month: null };
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
 * What a page is showing — the month picked on the overview, the filter on the list — lives in the
 * address too, so going Back from a receipt returns to the same view rather than a reset one.
 *
 * A handful of flat pages don't justify a router library. When there are nested layouts or many
 * parameters, React Router is the usual next step.
 */
export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, readHash));
}
