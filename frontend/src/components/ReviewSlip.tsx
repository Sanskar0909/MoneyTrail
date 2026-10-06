import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import type { ReceiptDetail } from '../api';
import { currencySymbol, formatAmount, formatDate, formatTimestamp } from '../format';
import {
  fieldText,
  isChanged,
  MERCHANT_MAX_LENGTH,
  paiseToText,
  parseAmountInPaise,
  todayIsoDate,
  type EditableField,
  type Edits,
  type FieldErrors,
} from '../review';
import { ConfidenceMeter } from './ConfidenceMeter';

/**
 * The till printer the slips come out of. Whatever is inside prints — slides out of the slot —
 * when it first appears, so a new `key` prints a new slip.
 */
export function Printer({ children }: { children?: ReactNode }) {
  return (
    <div className="printer">
      <div className="printer-slot" aria-hidden="true" />
      <div className="printer-out">{children && <div className="printer-paper">{children}</div>}</div>
    </div>
  );
}

interface ReviewSlipProps {
  receipt: ReceiptDetail;
  edits: Edits;
  errors: FieldErrors;
  /** True while a request is in flight, so nothing changes underneath it. */
  locked: boolean;
  /**
   * How many times the receipt has been confirmed on this screen. The stamp lands each time this
   * goes up; on a receipt that was already confirmed when the screen opened, it is simply there.
   */
  confirmations: number;
  onEdit: (field: EditableField, value: string) => void;
  onRevert: (field: EditableField) => void;
}

/**
 * The receipt as a fresh till slip: what MoneyTrail will record, laid out like the paper original
 * so the two can be read side by side. Merchant, date and total are editable; the model's
 * breakdown and its confidence are printed for reference and can't be changed.
 */
export function ReviewSlip({
  receipt,
  edits,
  errors,
  locked,
  confirmations,
  onEdit,
  onRevert,
}: ReviewSlipProps) {
  const id = useId();
  const extraction = receipt.extraction;
  const shared = { receipt, edits, locked, onEdit, onRevert };

  function tidyTotal() {
    // `1224.3` becomes `1224.30` once the person moves on, so the field shows exactly what will
    // be saved. Left alone while it's flagged, so the message still matches what's in the box.
    const typed = edits.totalAmount;
    if (typed === undefined || errors.totalAmount) return;
    const paise = parseAmountInPaise(typed);
    if (paise !== null && paiseToText(paise) !== typed) onEdit('totalAmount', paiseToText(paise));
  }

  return (
    <article className="receipt-paper slip" aria-label="Receipt details">
      <header className="slip-head">
        <SlipField
          {...shared}
          field="merchantName"
          variant="merchant"
          label="Merchant"
          error={errors.merchantName}
          unreadHint="Not read. Type it in from the photo."
          inputProps={{ type: 'text', maxLength: MERCHANT_MAX_LENGTH, placeholder: 'Merchant name' }}
        />
        <p className="slip-file" title={receipt.originalFilename}>
          {receipt.originalFilename}
        </p>
      </header>

      <div className="slip-section">
        <SlipField
          {...shared}
          field="receiptDate"
          label="Date"
          error={errors.receiptDate}
          unreadHint="Not read. Add it if the receipt shows one."
          inputProps={{ type: 'date', max: todayIsoDate() }}
        />
      </div>

      {/* The stamp sits over this section's labels, where it can't hide a number. */}
      <section className="slip-section slip-model" aria-labelledby={`${id}-model`}>
        <h3 id={`${id}-model`} className="slip-caption">
          As read by the model
        </h3>
        {extraction ? (
          <dl className="slip-lines">
            <ModelLine label="Subtotal" amount={extraction.subtotal} />
            <ModelLine label="Tax" amount={extraction.tax} />
            <ModelLine label="Tip" amount={extraction.tip} />
          </dl>
        ) : (
          <p className="slip-muted">There’s no reading from the model for this receipt.</p>
        )}

        {receipt.status === 'CONFIRMED' && (
          <div
            key={confirmations}
            className="stamp"
            data-landing={confirmations > 0 || undefined}
            aria-hidden="true"
          >
            Confirmed
          </div>
        )}
      </section>

      <div className="slip-section slip-section-total">
        <SlipField
          {...shared}
          field="totalAmount"
          variant="total"
          label="Total"
          labelSuffix={` in ${receipt.currency}`}
          prefix={currencySymbol(receipt.currency)}
          error={errors.totalAmount}
          unreadHint="Not read, and needed to confirm."
          inputProps={{ type: 'text', inputMode: 'decimal', onBlur: tidyTotal }}
        />
      </div>

      <div className="slip-section">
        <ConfidenceMeter score={extraction?.confidenceScore ?? null} />
      </div>

      <footer className="slip-foot">
        <span>No. {String(receipt.id).padStart(4, '0')}</span>
        <span>
          Uploaded <time dateTime={receipt.uploadedAt}>{formatTimestamp(receipt.uploadedAt)}</time>
        </span>
      </footer>
    </article>
  );
}

interface SlipFieldProps {
  receipt: ReceiptDetail;
  edits: Edits;
  field: EditableField;
  label: string;
  /** Read out with the label but not shown, like the currency code after "Total". */
  labelSuffix?: string;
  /** Printed in front of the input, like the currency symbol on the total. */
  prefix?: string;
  variant?: 'line' | 'merchant' | 'total';
  error: string | undefined;
  /** Shown under the field while it's empty because the model couldn't read it. */
  unreadHint: string;
  locked: boolean;
  inputProps: InputHTMLAttributes<HTMLInputElement>;
  onEdit: (field: EditableField, value: string) => void;
  onRevert: (field: EditableField) => void;
}

/**
 * One editable line. A corrected value is written in blue, like pen on a till slip, with the
 * saved value struck through underneath and a way to undo it. A value the model couldn't read
 * says so, rather than leaving an empty box to be mistaken for a missing feature.
 */
function SlipField({
  receipt,
  edits,
  field,
  label,
  labelSuffix,
  prefix,
  variant = 'line',
  error,
  unreadHint,
  locked,
  inputProps,
  onEdit,
  onRevert,
}: SlipFieldProps) {
  const id = useId();
  const changed = isChanged(receipt, edits, field);
  const was = describeSaved(receipt, field);
  const unread = was === null && !changed && !error;
  const wasId = `${id}-was`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [changed && wasId, unread && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div
      className="slip-field"
      data-variant={variant}
      data-changed={changed || undefined}
      data-unread={unread || undefined}
      data-invalid={error ? true : undefined}
    >
      <div className="slip-line">
        <label className="slip-label" htmlFor={id}>
          {label}
          {labelSuffix && <span className="visually-hidden">{labelSuffix}</span>}
        </label>
        {prefix && (
          <span className="slip-prefix" aria-hidden="true">
            {prefix}
          </span>
        )}
        <input
          {...inputProps}
          id={id}
          name={field}
          className="slip-input"
          value={fieldText(receipt, edits, field)}
          readOnly={locked}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onEdit(field, event.target.value)}
        />
      </div>

      {changed && (
        <p className="slip-note">
          <span id={wasId}>
            {was === null ? (
              'was empty'
            ) : (
              <>
                was <s>{was}</s>
              </>
            )}
          </span>
          <button type="button" className="slip-undo" onClick={() => onRevert(field)}>
            Undo<span className="visually-hidden"> the {label.toLowerCase()} correction</span>
          </button>
        </p>
      )}

      {unread && (
        <p className="slip-hint" id={hintId}>
          {unreadHint}
        </p>
      )}

      {error && (
        <p className="slip-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

/** The saved value as a person would read it, for the "was …" note. Null when it's empty. */
function describeSaved(receipt: ReceiptDetail, field: EditableField): string | null {
  switch (field) {
    case 'merchantName':
      return receipt.merchantName;
    case 'receiptDate':
      return receipt.receiptDate === null ? null : formatDate(receipt.receiptDate);
    case 'totalAmount':
      return receipt.totalAmount === null ? null : formatAmount(receipt.totalAmount);
  }
}

function ModelLine({ label, amount }: { label: string; amount: number | null }) {
  return (
    <div className="slip-line">
      <dt className="slip-label">{label}</dt>
      <dd className="slip-value">
        {amount === null ? (
          <>
            <span aria-hidden="true">—</span>
            <span className="visually-hidden">not read</span>
          </>
        ) : (
          formatAmount(amount)
        )}
      </dd>
    </div>
  );
}

/** The short slip shown while the pipeline is still reading the receipt. */
export function ReadingSlip({ queued }: { queued: boolean }) {
  return (
    <div className="receipt-paper slip slip-short">
      <p className="slip-short-title">
        {queued ? 'In the queue' : 'Reading receipt'}
        <span className="slip-dots" aria-hidden="true" />
      </p>
      <div className="slip-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <p className="slip-muted">The full slip prints here when it’s done.</p>
    </div>
  );
}

/** The short slip for a receipt that can't be reviewed: the pipeline gave up on it. */
export function UnreadableSlip({ receipt }: { receipt: ReceiptDetail }) {
  return (
    <div className="receipt-paper slip slip-short">
      <p className="slip-short-title">{receipt.status === 'FAILED' ? 'Could not read' : 'Not reviewable'}</p>
      <p className="slip-muted">
        {receipt.status === 'FAILED'
          ? 'Failed receipts can’t be corrected here yet. A sharper, flatter photo usually reads fine — try uploading it again.'
          : 'This receipt is in a state the review screen can’t edit.'}
      </p>
      <footer className="slip-foot">
        <span>No. {String(receipt.id).padStart(4, '0')}</span>
        <span className="slip-file" title={receipt.originalFilename}>
          {receipt.originalFilename}
        </span>
      </footer>
    </div>
  );
}
