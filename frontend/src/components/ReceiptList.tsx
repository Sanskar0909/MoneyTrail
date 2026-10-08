import type { Receipt, ReceiptStatus } from '../api';
import { formatDate, formatMoney, formatMonth, formatPaise, formatTimestamp } from '../format';
import {
  ADD_HREF,
  RECEIPT_FILTERS,
  receiptsHref,
  reviewHref,
  spendingHref,
  type ReceiptFilter,
} from '../hooks/useRoute';
import { groupByMonth, mainCurrency } from '../spending';
import { ArrowRightIcon } from './icons';
import { StatusBadge } from './StatusBadge';

interface ReceiptListProps {
  receipts: Receipt[];
  isLoading: boolean;
  isPolling: boolean;
  error: string | null;
  /** Which receipts to show, from the address. */
  filter: ReceiptFilter;
  onRefresh: () => void;
}

const FILTER_LABELS: Record<ReceiptFilter, string> = {
  all: 'All',
  waiting: 'Needs review',
  confirmed: 'Confirmed',
  failed: 'Failed',
};

/** What the page says when a filter has nothing to show. */
const EMPTY_MESSAGES: Record<ReceiptFilter, string> = {
  all: 'No receipts yet.',
  waiting: 'Nothing is waiting for review.',
  confirmed: 'Nothing is confirmed yet.',
  failed: 'Nothing has failed.',
};

function matchesFilter(receipt: Receipt, filter: ReceiptFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'waiting':
      return receipt.status === 'NEEDS_REVIEW';
    case 'confirmed':
      return receipt.status === 'CONFIRMED';
    case 'failed':
      return receipt.status === 'FAILED';
  }
}

/**
 * Every receipt, filed by month.
 *
 * A receipt is filed under the date printed on it, or the day it was uploaded if none was read —
 * the same rule the spending overview uses, so a month here and a month there hold the same slips.
 */
export function ReceiptList({ receipts, isLoading, isPolling, error, filter, onRefresh }: ReceiptListProps) {
  const waiting = receipts.filter((receipt) => receipt.status === 'NEEDS_REVIEW');
  const shown = receipts.filter((receipt) => matchesFilter(receipt, filter));
  const currency = mainCurrency(receipts);
  const groups = groupByMonth(shown, currency);

  return (
    <section className="receipts" aria-labelledby="receipts-heading">
      <div className="page-head">
        <h1 id="receipts-heading" className="page-title">
          Receipts
        </h1>
        <div className="receipts-actions">
          {isPolling && <span className="live-hint">Updating automatically</span>}
          <button type="button" className="button-secondary" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {receipts.length > 0 && (
        <nav className="filter-row" aria-label="Show">
          {RECEIPT_FILTERS.map((option) => (
            <a key={option} href={receiptsHref(option)} aria-current={option === filter ? 'true' : undefined}>
              {FILTER_LABELS[option]}
              <span className="filter-count">
                {receipts.filter((receipt) => matchesFilter(receipt, option)).length}
              </span>
            </a>
          ))}
        </nav>
      )}

      {error && (
        <p className="feedback feedback-error" role="alert">
          {error}
        </p>
      )}

      {waiting.length > 0 && filter !== 'confirmed' && filter !== 'failed' && (
        <div className="queue-callout">
          <p>
            <strong>{waiting.length}</strong> {waiting.length === 1 ? 'receipt is' : 'receipts are'} waiting
            for you to check.
          </p>
          <a className="button-primary" href={reviewHref(waiting[0].id)}>
            Start reviewing <ArrowRightIcon />
          </a>
        </div>
      )}

      {!error && shown.length === 0 && !isLoading && (
        <div className="empty">
          <p>{EMPTY_MESSAGES[filter]}</p>
          {receipts.length === 0 && (
            <a className="button-primary" href={ADD_HREF}>
              Add a receipt
            </a>
          )}
        </div>
      )}

      {groups.map((group) => (
        <section key={group.month} className="month-group" aria-labelledby={`month-${group.month}`}>
          <header className="month-head">
            <h2 id={`month-${group.month}`} className="month-title">
              {formatMonth(group.month)}
            </h2>
            <p className="month-summary">
              <span>{group.receipts.length === 1 ? '1 receipt' : `${group.receipts.length} receipts`}</span>
              {group.confirmedPaise > 0 && (
                <a href={spendingHref(group.month)}>{formatPaise(group.confirmedPaise, currency)} confirmed</a>
              )}
            </p>
          </header>

          <ul className="receipt-grid">
            {group.receipts.map((receipt) => (
              <li key={receipt.id} className="receipt">
                <ReceiptSlip receipt={receipt} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}

/** What the header says before the pipeline has put a merchant name on the receipt. */
const UNREAD_MERCHANT: Record<ReceiptStatus, string> = {
  UPLOADED: 'Waiting to be read',
  PROCESSING: 'Reading receipt…',
  EXTRACTED: 'Unknown merchant',
  NEEDS_REVIEW: 'Unknown merchant',
  CONFIRMED: 'Unknown merchant',
  FAILED: 'Could not be read',
};

/**
 * One receipt drawn as a printed paper slip.
 *
 * The torn edges are a CSS mask on `.receipt-paper`. The drop shadow lives on the parent `<li>`
 * because a mask clips anything painted outside the element, shadows included.
 *
 * The whole slip opens the review screen, but only the merchant name is the link: its `::after`
 * is stretched over the slip in CSS. Wrapping the whole slip in `<a>` would make a screen reader
 * read every line of it as the link's name.
 */
function ReceiptSlip({ receipt }: { receipt: Receipt }) {
  const isUnread = receipt.merchantName === null;
  const titleId = `receipt-${receipt.id}-title`;

  return (
    <article className="receipt-paper" aria-labelledby={titleId}>
      <header className="receipt-head">
        <h3 id={titleId} className="receipt-merchant" data-unread={isUnread || undefined}>
          <a className="receipt-link" href={reviewHref(receipt.id)}>
            {receipt.merchantName ?? UNREAD_MERCHANT[receipt.status]}
          </a>
        </h3>
        <p className="receipt-file" title={receipt.originalFilename}>
          {receipt.originalFilename}
        </p>
      </header>

      <dl className="receipt-lines">
        <div className="receipt-line">
          <dt>Date</dt>
          <dd>{formatDate(receipt.receiptDate)}</dd>
        </div>
        <div className="receipt-line receipt-total">
          <dt>Total</dt>
          <dd>{formatMoney(receipt.totalAmount, receipt.currency)}</dd>
        </div>
      </dl>

      <footer className="receipt-foot">
        <StatusBadge status={receipt.status} />
        <p className="receipt-meta">
          <span>No. {String(receipt.id).padStart(4, '0')}</span>
          <time dateTime={receipt.uploadedAt}>{formatTimestamp(receipt.uploadedAt)}</time>
        </p>
      </footer>
    </article>
  );
}
