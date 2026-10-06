import type { Receipt, ReceiptStatus } from '../api';
import { formatDate, formatMoney, formatTimestamp } from '../format';
import { reviewHref } from '../hooks/useRoute';
import { ArrowRightIcon } from './icons';
import { StatusBadge } from './StatusBadge';

interface ReceiptListProps {
  receipts: Receipt[];
  isLoading: boolean;
  isPolling: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function ReceiptList({ receipts, isLoading, isPolling, error, onRefresh }: ReceiptListProps) {
  const waiting = receipts.filter((receipt) => receipt.status === 'NEEDS_REVIEW');

  return (
    <section className="receipts" aria-labelledby="receipts-heading">
      <div className="panel-header">
        <h2 id="receipts-heading" className="panel-heading">
          Receipts
          {receipts.length > 0 && <span className="count">{receipts.length}</span>}
        </h2>
        <div className="receipts-actions">
          {isPolling && <span className="live-hint">Updating automatically</span>}
          <button type="button" className="button-secondary" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <p className="feedback feedback-error" role="alert">
          {error}
        </p>
      )}

      {waiting.length > 0 && (
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

      {!error && receipts.length === 0 && !isLoading && (
        <p className="empty">No receipts yet. Upload one above to get started.</p>
      )}

      {receipts.length > 0 && (
        <ul className="receipt-grid">
          {receipts.map((receipt) => (
            <li key={receipt.id} className="receipt">
              <ReceiptSlip receipt={receipt} />
            </li>
          ))}
        </ul>
      )}
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
