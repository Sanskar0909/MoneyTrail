import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import {
  ApiError,
  confirmReceipt,
  EDITABLE_STATUSES,
  IN_FLIGHT_STATUSES,
  updateReceipt,
  type ReceiptDetail,
  type ReceiptStatus,
  type ReceiptUpdate,
} from '../api';
import { formatMoney } from '../format';
import { useReceipt } from '../hooks/useReceipt';
import { RECEIPTS_HREF, reviewHref } from '../hooks/useRoute';
import {
  changedFields,
  checkEdits,
  EDITABLE_FIELDS,
  todayIsoDate,
  type EditableField,
  type Edits,
  type FieldErrors,
} from '../review';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from './icons';
import { ReceiptPhoto } from './ReceiptPhoto';
import { Printer, ReadingSlip, ReviewSlip, UnreadableSlip } from './ReviewSlip';
import { StatusBadge } from './StatusBadge';
import './ReviewScreen.css';

interface ReviewScreenProps {
  receiptId: number;
  /** The next receipt waiting for review — where Skip and Next go. Null when there isn't one. */
  nextReceiptId: number | null;
  /** How many receipts other than this one are waiting for review. */
  waitingCount: number;
  /** Called whenever this screen changes the receipt, so the list can catch up. */
  onChanged: () => void;
}

interface Notice {
  tone: 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
}

const HEADINGS: Record<ReceiptStatus, { title: string; lede: string }> = {
  UPLOADED: {
    title: 'Waiting to be read',
    lede: 'It’s queued for the reader. The slip prints here when it’s done, usually within seconds.',
  },
  PROCESSING: {
    title: 'Reading the receipt…',
    lede: 'The slip prints here as soon as the reader is done.',
  },
  EXTRACTED: {
    title: 'Not ready for review',
    lede: 'This receipt is in a state the review screen can’t edit.',
  },
  NEEDS_REVIEW: {
    title: 'Check this receipt',
    lede: 'Compare the slip with the photo, correct anything the model misread, then confirm.',
  },
  CONFIRMED: {
    title: 'Receipt confirmed',
    lede: 'All saved. Spotted a mistake? Correct it here and confirm again.',
  },
  FAILED: {
    title: 'Couldn’t read this receipt',
    lede: 'The reader gave up on this photo, even after retrying.',
  },
};

/** Edits or errors without one field. The same object back if there was nothing to remove. */
function without(values: Edits | FieldErrors, field: EditableField): Edits | FieldErrors {
  if (!(field in values)) return values;
  const copy = { ...values };
  delete copy[field];
  return copy;
}

/**
 * Review one receipt: the original on one side, an editable slip on the other, and one action —
 * Confirm — that saves any corrections first.
 *
 * Keyed by receipt in App, so moving to another receipt starts this screen afresh.
 */
export function ReviewScreen({ receiptId, nextReceiptId, waitingCount, onChanged }: ReviewScreenProps) {
  const { receipt, error, reload, replace } = useReceipt(receiptId);
  const [edits, setEdits] = useState<Edits>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isWorking, setIsWorking] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmations, setConfirmations] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nextActionRef = useRef<HTMLAnchorElement>(null);

  const hasUnsavedChanges = receipt !== null && changedFields(receipt, edits).length > 0;

  // Start on the heading, so a screen reader begins at the new page instead of nowhere.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  // The Confirm button disappears once the receipt is confirmed; focus moves to what replaced it.
  useEffect(() => {
    if (confirmations > 0) nextActionRef.current?.focus();
  }, [confirmations]);

  const merchantName = receipt?.merchantName;
  useEffect(() => {
    document.title = merchantName ? `${merchantName} · Review — MoneyTrail` : 'Review — MoneyTrail';
    return () => {
      document.title = 'MoneyTrail';
    };
  }, [merchantName]);

  // Closing the tab or reloading would throw away corrections that haven't been saved.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  function fieldInput(field: EditableField): HTMLInputElement | null {
    const element = formRef.current?.elements.namedItem(field);
    return element instanceof HTMLInputElement ? element : null;
  }

  function handleEdit(field: EditableField, value: string) {
    setEdits((current) => ({ ...current, [field]: value }));
    // Fixing a field clears its message; the next Confirm checks everything again.
    setErrors((current) => without(current, field));
  }

  function handleRevert(field: EditableField) {
    setEdits((current) => without(current, field));
    setErrors((current) => without(current, field));
    // The Undo button is about to disappear, so put focus somewhere useful.
    fieldInput(field)?.focus();
  }

  function confirmLeaving(event: MouseEvent<HTMLAnchorElement>) {
    if (hasUnsavedChanges && !window.confirm('Leave without saving your corrections?')) {
      event.preventDefault();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receipt || isWorking) return;

    const { errors: problems, changes } = checkEdits(receipt, edits, {
      today: todayIsoDate(),
      // A half-typed date reads as an empty value; only the input itself knows it's half-typed.
      dateIncomplete: fieldInput('receiptDate')?.validity.badInput ?? false,
    });
    setErrors(problems);
    const firstProblem = EDITABLE_FIELDS.find((field) => problems[field]);
    if (firstProblem) {
      fieldInput(firstProblem)?.focus();
      return;
    }

    setIsWorking(true);
    setNotice(null);
    const hasChanges = Object.keys(changes).length > 0;
    let saved: ReceiptDetail | null = null;
    try {
      // Saving and confirming are two requests, and the screen only shows the end result, so a
      // confirmed receipt being corrected doesn't flicker through "Needs review" on the way.
      if (hasChanges) saved = await updateReceipt(receipt.id, changes);
      const confirmed = await confirmReceipt(receipt.id);
      replace(confirmed);
      setEdits({});
      setConfirmations((count) => count + 1);
      setAnnouncement(
        `Confirmed: ${confirmed.merchantName ?? 'receipt'}, ${formatMoney(confirmed.totalAmount, confirmed.currency)}.`,
      );
      onChanged();
    } catch (cause) {
      if (saved) {
        // The corrections went through even though the confirm didn't — keep them on screen.
        replace(saved);
        setEdits({});
        onChanged();
      }
      await recover(cause, {
        failedAt: hasChanges && !saved ? 'save' : 'confirm',
        saved: saved !== null,
        changes,
      });
    } finally {
      setIsWorking(false);
    }
  }

  /**
   * Explains a failed save or confirm, and puts the screen right.
   *
   * A 409 means this screen's copy of the receipt is out of date, so the first move is always to
   * fetch the real one — then decide what to say from what it turns out to be, not from the
   * message alone. Corrections that weren't saved stay in the form throughout.
   */
  async function recover(
    cause: unknown,
    attempt: { failedAt: 'save' | 'confirm'; saved: boolean; changes: ReceiptUpdate },
  ) {
    if (!(cause instanceof ApiError)) {
      setNotice({ tone: 'error', title: 'Something went wrong.', detail: 'Try again in a moment.' });
      return;
    }

    if (cause.status === 409) {
      const fresh = await reload();
      onChanged();

      if (fresh === null) {
        setNotice({
          tone: 'warning',
          title: 'This receipt changed while you had it open.',
          detail: cause.message,
        });
        return;
      }
      if (attempt.failedAt === 'confirm' && fresh.status === 'CONFIRMED') {
        // Confirmed somewhere else first. What was asked for has already happened.
        setConfirmations((count) => count + 1);
        setNotice({
          tone: 'success',
          title: 'Already confirmed.',
          detail: 'It was confirmed somewhere else first — probably in another tab.',
        });
        setAnnouncement('This receipt was already confirmed.');
        return;
      }
      if (
        attempt.failedAt === 'confirm' &&
        EDITABLE_STATUSES.has(fresh.status) &&
        fresh.totalAmount === null
      ) {
        setErrors({ totalAmount: cause.message });
        fieldInput('totalAmount')?.focus();
        return;
      }
      const keptCorrections = !attempt.saved && Object.keys(attempt.changes).length > 0;
      let detail = 'It can’t be confirmed any more.';
      if (EDITABLE_STATUSES.has(fresh.status)) {
        detail = keptCorrections
          ? 'This is the latest version, with your corrections still in place. Check it, then confirm again.'
          : 'This is the latest version. Check it, then confirm again.';
      } else if (IN_FLIGHT_STATUSES.has(fresh.status)) {
        detail = keptCorrections
          ? 'It’s being read again. Your corrections will still be here when the slip prints.'
          : 'It’s being read again. The slip prints here when it’s done.';
      }
      setNotice({ tone: 'warning', title: 'This receipt changed while you had it open.', detail });
      return;
    }

    let title = 'The receipt wasn’t confirmed.';
    if (attempt.saved) title = 'Your corrections were saved, but the receipt isn’t confirmed yet.';
    else if (attempt.failedAt === 'save') title = 'Your corrections weren’t saved.';
    setNotice({
      tone: 'error',
      title,
      detail: cause.status === 404 ? 'This receipt no longer exists.' : cause.message,
    });
  }

  const heading = describe(receipt, error);
  const nextHref = nextReceiptId !== null ? reviewHref(nextReceiptId) : null;

  const noticeView = notice && (
    <div
      className="review-notice"
      data-tone={notice.tone}
      role={notice.tone === 'success' ? 'status' : 'alert'}
    >
      <p className="review-notice-title">{notice.title}</p>
      {notice.detail && <p className="review-notice-detail">{notice.detail}</p>}
    </div>
  );

  let side: ReactNode;
  if (receipt === null) {
    side = <Printer key="loading" />;
  } else if (IN_FLIGHT_STATUSES.has(receipt.status)) {
    side = (
      <>
        <Printer key="reading">
          <ReadingSlip queued={receipt.status === 'UPLOADED'} />
        </Printer>
        {noticeView}
      </>
    );
  } else if (EDITABLE_STATUSES.has(receipt.status)) {
    const isConfirmed = receipt.status === 'CONFIRMED';
    side = (
      <form ref={formRef} className="review-form" onSubmit={handleSubmit} noValidate aria-busy={isWorking}>
        <Printer key="slip">
          <ReviewSlip
            receipt={receipt}
            edits={edits}
            errors={errors}
            locked={isWorking}
            confirmations={confirmations}
            onEdit={handleEdit}
            onRevert={handleRevert}
          />
        </Printer>

        {noticeView}

        <div className="review-actions">
          {!isConfirmed && nextHref ? (
            <a className="review-skip" href={nextHref} onClick={confirmLeaving}>
              Skip for now
            </a>
          ) : (
            <span className="review-caught-up">
              {isConfirmed && !nextHref && !hasUnsavedChanges && 'All caught up.'}
            </span>
          )}

          {isConfirmed && !hasUnsavedChanges ? (
            <a ref={nextActionRef} className="button-primary review-primary" href={nextHref ?? RECEIPTS_HREF}>
              {nextHref ? (
                <>
                  Next receipt <ArrowRightIcon />
                </>
              ) : (
                'Back to receipts'
              )}
            </a>
          ) : (
            <button
              type="submit"
              className="button-primary review-primary"
              aria-disabled={isWorking || undefined}
            >
              {isWorking ? <span className="spinner" aria-hidden="true" /> : <CheckIcon />}
              {isWorking ? 'Confirming…' : hasUnsavedChanges ? 'Save & confirm' : 'Confirm receipt'}
            </button>
          )}
        </div>
      </form>
    );
  } else {
    side = (
      <>
        <Printer key="unreadable">
          <UnreadableSlip receipt={receipt} />
        </Printer>
        {noticeView}
        <div className="review-actions">
          <span />
          <a className="button-primary review-primary" href={nextHref ?? RECEIPTS_HREF}>
            {nextHref ? (
              <>
                Next receipt <ArrowRightIcon />
              </>
            ) : (
              'Back to receipts'
            )}
          </a>
        </div>
      </>
    );
  }

  return (
    <section className="review" aria-labelledby={headingId}>
      <div className="review-bar">
        <a className="review-back" href={RECEIPTS_HREF} onClick={confirmLeaving}>
          <ArrowLeftIcon /> All receipts
        </a>
        {waitingCount > 0 && (
          <p className="review-waiting">
            {waitingCount} more {waitingCount === 1 ? 'receipt' : 'receipts'} to review
          </p>
        )}
      </div>

      <header className="review-header">
        <div>
          <h2 id={headingId} ref={headingRef} className="review-title" tabIndex={-1}>
            {heading.title}
          </h2>
          {heading.lede && <p className="review-lede">{heading.lede}</p>}
        </div>
        {receipt && <StatusBadge status={receipt.status} />}
      </header>

      {receipt === null && error ? (
        <div className="review-problem">
          {error.status !== 404 && (
            <button type="button" className="button-secondary" onClick={() => void reload()}>
              Try again
            </button>
          )}
          <a className="button-primary" href={RECEIPTS_HREF}>
            Back to receipts
          </a>
        </div>
      ) : (
        <div className="review-layout">
          <ReceiptPhoto receiptId={receiptId} />
          <div className="review-side">{side}</div>
        </div>
      )}

      <p className="visually-hidden" role="status">
        {announcement}
      </p>
    </section>
  );
}

function describe(receipt: ReceiptDetail | null, error: ApiError | null): { title: string; lede: string } {
  if (receipt) return HEADINGS[receipt.status];
  if (error?.status === 404)
    return { title: 'Receipt not found', lede: 'It may have been removed, or the link is wrong.' };
  if (error) return { title: 'Couldn’t load this receipt', lede: error.message };
  return { title: 'Loading receipt…', lede: '' };
}
