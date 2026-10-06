/**
 * The rules of the review screen: what counts as a correction, what makes one valid, and what is
 * sent to the server. Pure functions — no React, no I/O — for the same reason format.ts exists.
 */
import type { Receipt, ReceiptDetail, ReceiptUpdate } from './api';

export const EDITABLE_FIELDS = ['merchantName', 'receiptDate', 'totalAmount'] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

/**
 * What the person has typed, field by field.
 *
 * A field they haven't touched is absent, not a copy of the saved value. So when the receipt is
 * reloaded underneath them — after a 409, say — untouched fields show the new saved value and
 * only their own corrections are carried over.
 */
export type Edits = Partial<Record<EditableField, string>>;

export type FieldErrors = Partial<Record<EditableField, string>>;

/** Same as `VARCHAR(255)` on receipts.merchant_name. */
export const MERCHANT_MAX_LENGTH = 255;

/** The largest total `NUMERIC(12,2)` can hold, in paise. Anything bigger fails in the database. */
const MAX_TOTAL_PAISE = 999_999_999_999;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads a typed amount as a whole number of paise — `1,224.3` → 122430 — or null if it isn't one.
 * Spaces, commas and a leading ₹ are allowed, because that is how amounts get typed and pasted.
 *
 * Works on the digits as text, never through parseFloat, so no floating-point rounding is
 * involved: 1224.3 is 1224.2999999999999545… as a double. Same reason the backend uses BigDecimal.
 */
export function parseAmountInPaise(text: string): number | null {
  const cleaned = text.replace(/[\s,]/g, '').replace(/^₹/, '');
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** 122430 → `1224.30`. Integer arithmetic only, for the reason above. */
export function paiseToText(paise: number): string {
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
}

function savedTotalInPaise(receipt: ReceiptDetail): number | null {
  return receipt.totalAmount === null ? null : Math.round(receipt.totalAmount * 100);
}

/** The saved value of a field, as the text its input starts with. */
export function savedText(receipt: ReceiptDetail, field: EditableField): string {
  switch (field) {
    case 'merchantName':
      return receipt.merchantName ?? '';
    case 'receiptDate':
      return receipt.receiptDate ?? '';
    case 'totalAmount': {
      const paise = savedTotalInPaise(receipt);
      return paise === null ? '' : paiseToText(paise);
    }
  }
}

/** What a field's input shows: the person's own text once they've typed, the saved value before. */
export function fieldText(receipt: ReceiptDetail, edits: Edits, field: EditableField): string {
  return edits[field] ?? savedText(receipt, field);
}

/**
 * Whether a field now says something different from what is saved. Typing that leaves the value
 * the same — `1224.3` for `1224.30`, a trailing space — is not a change.
 */
export function isChanged(receipt: ReceiptDetail, edits: Edits, field: EditableField): boolean {
  const typed = edits[field];
  if (typed === undefined) return false;

  switch (field) {
    case 'merchantName':
    case 'receiptDate':
      return typed.trim() !== savedText(receipt, field);
    case 'totalAmount': {
      const saved = savedTotalInPaise(receipt);
      const paise = parseAmountInPaise(typed);
      if (paise === null) return typed.trim() !== '' || saved !== null;
      return paise !== saved;
    }
  }
}

export function changedFields(receipt: ReceiptDetail, edits: Edits): EditableField[] {
  return EDITABLE_FIELDS.filter((field) => isChanged(receipt, edits, field));
}

export interface CheckedEdits {
  /** One message per field that can't be confirmed as it stands. Empty when all is well. */
  errors: FieldErrors;
  /** What to send: only the fields that differ from what's saved, cleaned up. */
  changes: ReceiptUpdate;
}

interface CheckContext {
  /** Today, as an ISO date, so a receipt dated in the future is caught. */
  today: string;
  /** True when the date input holds a half-typed date, which browsers report as an empty value. */
  dateIncomplete: boolean;
}

/**
 * Checks the form before it is confirmed.
 *
 * Every field is checked as it will be confirmed, not only the edited ones: a receipt with no
 * total can't be confirmed whether or not anyone typed in that box. Clearing a field that has a
 * value is refused too, because the API can't clear a field — it would silently keep the old one.
 */
export function checkEdits(receipt: ReceiptDetail, edits: Edits, context: CheckContext): CheckedEdits {
  const errors: FieldErrors = {};
  const changes: ReceiptUpdate = {};

  if (isChanged(receipt, edits, 'merchantName')) {
    const merchant = fieldText(receipt, edits, 'merchantName').trim();
    if (merchant === '') {
      errors.merchantName = 'The merchant can’t be left blank.';
    } else if (merchant.length > MERCHANT_MAX_LENGTH) {
      errors.merchantName = `Keep it under ${MERCHANT_MAX_LENGTH} characters.`;
    } else {
      changes.merchantName = merchant;
    }
  }

  const date = fieldText(receipt, edits, 'receiptDate').trim();
  if (context.dateIncomplete) {
    errors.receiptDate = 'That date isn’t complete.';
  } else if (date === '') {
    if (receipt.receiptDate !== null) errors.receiptDate = 'The date can’t be left blank.';
  } else if (!ISO_DATE.test(date)) {
    errors.receiptDate = 'That isn’t a valid date.';
  } else if (date > context.today) {
    errors.receiptDate = 'That date is in the future.';
  } else if (date !== savedText(receipt, 'receiptDate')) {
    changes.receiptDate = date;
  }

  const totalText = fieldText(receipt, edits, 'totalAmount');
  const paise = parseAmountInPaise(totalText);
  if (totalText.trim() === '') {
    errors.totalAmount = 'Enter the total. A receipt can’t be confirmed without one.';
  } else if (paise === null) {
    errors.totalAmount = 'Enter an amount, like 1224.30.';
  } else if (paise === 0) {
    errors.totalAmount = 'The total must be more than zero.';
  } else if (paise > MAX_TOTAL_PAISE) {
    errors.totalAmount = 'That total is too large.';
  } else if (paise !== savedTotalInPaise(receipt)) {
    changes.totalAmount = paise / 100;
  }

  return { errors, changes };
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * How far to trust a reading, from the model's own confidence. The cut-offs are judgement calls,
 * not calibration: models report 0.9 or more for a clean photo, so anything less deserves a
 * closer look, and under 0.7 the photo itself was usually hard to read.
 */
export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.9) return 'high';
  if (score >= 0.7) return 'medium';
  return 'low';
}

/**
 * The receipt to go to after this one: the next one down the list that is waiting for review,
 * wrapping round to the top, so working through the queue follows the order on screen.
 */
export function findNextToReview(receipts: readonly Receipt[], currentId: number): number | null {
  const index = receipts.findIndex((receipt) => receipt.id === currentId);
  const after = [...receipts.slice(index + 1), ...receipts.slice(0, Math.max(index, 0))];
  return after.find((receipt) => receipt.status === 'NEEDS_REVIEW' && receipt.id !== currentId)?.id ?? null;
}

/** How many receipts other than this one are waiting for review. */
export function countWaiting(receipts: readonly Receipt[], currentId: number): number {
  return receipts.filter((receipt) => receipt.status === 'NEEDS_REVIEW' && receipt.id !== currentId).length;
}

/** Today in the browser's time zone, as an ISO date. Not `toISOString()`, which is in UTC. */
export function todayIsoDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
