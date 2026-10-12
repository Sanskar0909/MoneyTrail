/**
 * The rules for an entry typed in by hand. Pure functions, like review.ts.
 *
 * They mirror the annotations on `ManualEntryRequest`. The server checks again and has the final
 * say; these exist so the form can answer straight away, in words a person would use.
 */
import type { ManualEntry } from './api';
import {
  MAX_TOTAL_PAISE,
  MERCHANT_MAX_LENGTH,
  parseAmountInPaise,
  type EditableField,
  type FieldErrors,
} from './review';

/** What is in the form's three boxes, as text. */
export type EntryValues = Record<EditableField, string>;

export interface CheckedEntry {
  /** One message per field that can't be saved as it stands. Empty when all is well. */
  errors: FieldErrors;
  /** What to send, cleaned up. Null while anything is wrong. */
  entry: ManualEntry | null;
}

interface CheckContext {
  /** Today, as an ISO date, so an entry dated in the future is caught. */
  today: string;
  /** True when the date input holds a half-typed date, which browsers report as an empty value. */
  dateIncomplete: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks the form before it is saved. Unlike a receipt under review, where a missing date is
 * allowed, a typed entry needs all three: it is confirmed the moment it is saved, and nobody
 * looks at it again.
 */
export function checkEntry(values: EntryValues, context: CheckContext): CheckedEntry {
  const errors: FieldErrors = {};

  const merchant = values.merchantName.trim();
  if (merchant === '') {
    errors.merchantName = 'Enter where the money went.';
  } else if (merchant.length > MERCHANT_MAX_LENGTH) {
    errors.merchantName = `Keep it under ${MERCHANT_MAX_LENGTH} characters.`;
  }

  const date = values.receiptDate.trim();
  if (context.dateIncomplete) {
    errors.receiptDate = 'That date isn’t complete.';
  } else if (date === '') {
    errors.receiptDate = 'Enter the date.';
  } else if (!ISO_DATE.test(date)) {
    errors.receiptDate = 'That isn’t a valid date.';
  } else if (date > context.today) {
    errors.receiptDate = 'That date is in the future.';
  }

  const paise = parseAmountInPaise(values.totalAmount);
  if (values.totalAmount.trim() === '') {
    errors.totalAmount = 'Enter the total.';
  } else if (paise === null) {
    errors.totalAmount = 'Enter an amount, like 1224.30.';
  } else if (paise === 0) {
    errors.totalAmount = 'The total must be more than zero.';
  } else if (paise > MAX_TOTAL_PAISE) {
    errors.totalAmount = 'That total is too large.';
  }

  if (Object.keys(errors).length > 0 || paise === null) return { errors, entry: null };
  return { errors, entry: { merchantName: merchant, receiptDate: date, totalAmount: paise / 100 } };
}
