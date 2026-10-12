import { useId, useRef, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { ApiError, createManualEntry, type Receipt } from '../api';
import { checkEntry, type EntryValues } from '../entry';
import { currencySymbol, formatMoney, formatMonth } from '../format';
import { reviewHref, spendingHref } from '../hooks/useRoute';
import {
  EDITABLE_FIELDS,
  MERCHANT_MAX_LENGTH,
  paiseToText,
  parseAmountInPaise,
  todayIsoDate,
  type EditableField,
  type FieldErrors,
} from '../review';
import { CheckIcon } from './icons';
// The slip and its fields are drawn the same way as on the review screen.
import './ReviewScreen.css';

interface ManualEntryFormProps {
  onSaved: (receipt: Receipt) => void;
}

/** The server files every typed entry in rupees, so there is no currency to choose or send. */
const CURRENCY = 'INR';

/** A fresh form. The date starts as today, which is when most cash gets written down. */
function blankEntry(): EntryValues {
  return { merchantName: '', receiptDate: todayIsoDate(), totalAmount: '' };
}

/** `must be greater than 0` → `Must be greater than 0.`, so a message from the server reads as a sentence. */
function asSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return trimmed;
  return trimmed[0].toUpperCase() + trimmed.slice(1) + (/[.!?]$/.test(trimmed) ? '' : '.');
}

/** The server's complaints about this form's own fields, ignoring any it has about others. */
function serverFieldErrors(fields: Readonly<Record<string, string>>): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of EDITABLE_FIELDS) {
    if (fields[field]) errors[field] = asSentence(fields[field]);
  }
  return errors;
}

/**
 * An entry with no receipt behind it: a blank slip to fill in by hand.
 *
 * It is saved as confirmed, so it never visits the review screen. That is why the form checks
 * everything first, and why the date goes back to today after each save instead of keeping the
 * last one: a wrong date would be recorded without anyone seeing it again.
 */
export function ManualEntryForm({ onSaved }: ManualEntryFormProps) {
  const headingId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<EntryValues>(blankEntry);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState<Receipt | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  function fieldInput(field: EditableField): HTMLInputElement | null {
    const element = formRef.current?.elements.namedItem(field);
    return element instanceof HTMLInputElement ? element : null;
  }

  function focusFirstProblem(problems: FieldErrors) {
    const first = EDITABLE_FIELDS.find((field) => problems[field]);
    if (first) fieldInput(first)?.focus();
  }

  function handleChange(field: EditableField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    // Fixing a field clears its message; the next save checks everything again.
    setErrors((current) => {
      if (!(field in current)) return current;
      const rest = { ...current };
      delete rest[field];
      return rest;
    });
  }

  function tidyTotal() {
    // `1224.3` becomes `1224.30` once the person moves on, so the box shows what will be saved.
    const paise = parseAmountInPaise(values.totalAmount);
    if (paise !== null && paiseToText(paise) !== values.totalAmount) {
      setValues((current) => ({ ...current, totalAmount: paiseToText(paise) }));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const { errors: problems, entry } = checkEntry(values, {
      today: todayIsoDate(),
      // A half-typed date reads as an empty value; only the input itself knows it's half-typed.
      dateIncomplete: fieldInput('receiptDate')?.validity.badInput ?? false,
    });
    setErrors(problems);
    if (!entry) {
      focusFirstProblem(problems);
      return;
    }

    setIsSaving(true);
    setFailure(null);
    setSaved(null);
    try {
      const receipt = await createManualEntry(entry);
      setSaved(receipt);
      setValues(blankEntry());
      onSaved(receipt);
    } catch (cause) {
      // The server checks the same rules again. If it disagrees about a field, say so beside it.
      const rejected = cause instanceof ApiError ? serverFieldErrors(cause.fields) : {};
      if (Object.keys(rejected).length > 0) {
        setErrors(rejected);
        focusFirstProblem(rejected);
      } else {
        setFailure(cause instanceof Error ? cause.message : 'Something went wrong.');
      }
    } finally {
      setIsSaving(false);
    }
  }

  const shared = { locked: isSaving, onChange: handleChange };
  const savedMonth = saved?.receiptDate?.slice(0, 7);

  return (
    <section className="entry" aria-labelledby={headingId}>
      <h2 id={headingId} className="entry-heading">
        Type it in
      </h2>
      <p className="entry-lead">
        For anything without a receipt. It counts towards your spending straight away, with nothing to
        review.
      </p>

      <form ref={formRef} className="entry-form" onSubmit={handleSubmit} noValidate aria-busy={isSaving}>
        <div className="entry-paper">
          <div className="receipt-paper slip">
            <header className="slip-head">
              <EntryField
                {...shared}
                field="merchantName"
                variant="merchant"
                label="Merchant"
                value={values.merchantName}
                error={errors.merchantName}
                inputProps={{ type: 'text', maxLength: MERCHANT_MAX_LENGTH, placeholder: 'Where it went' }}
              />
              <p className="slip-file">Typed in by hand</p>
            </header>

            <div className="slip-section">
              <EntryField
                {...shared}
                field="receiptDate"
                label="Date"
                value={values.receiptDate}
                error={errors.receiptDate}
                inputProps={{ type: 'date', max: todayIsoDate() }}
              />
            </div>

            <div className="slip-section slip-section-total">
              <EntryField
                {...shared}
                field="totalAmount"
                variant="total"
                label="Total"
                labelSuffix={` in ${CURRENCY}`}
                prefix={currencySymbol(CURRENCY)}
                value={values.totalAmount}
                error={errors.totalAmount}
                inputProps={{ type: 'text', inputMode: 'decimal', placeholder: '0.00', onBlur: tidyTotal }}
              />
            </div>
          </div>
        </div>

        <div className="entry-actions">
          <button type="submit" className="button-primary" aria-disabled={isSaving || undefined}>
            {isSaving ? <span className="spinner" aria-hidden="true" /> : <CheckIcon />}
            {isSaving ? 'Saving…' : 'Save entry'}
          </button>
        </div>

        <p className="feedback" role="status" aria-live="polite">
          {saved && (
            <>
              Saved {saved.merchantName}, {formatMoney(saved.totalAmount, saved.currency)}
              {savedMonth && (
                <>
                  , in <a href={spendingHref(savedMonth)}>{formatMonth(savedMonth)}</a>
                </>
              )}
              . <a href={reviewHref(saved.id)}>Open it</a>
            </>
          )}
        </p>
        {failure && (
          <p className="feedback feedback-error" role="alert">
            The entry wasn’t saved. {failure}
          </p>
        )}
      </form>
    </section>
  );
}

interface EntryFieldProps {
  field: EditableField;
  label: string;
  /** Read out with the label but not shown, like the currency code after "Total". */
  labelSuffix?: string;
  /** Printed in front of the input, like the currency symbol on the total. */
  prefix?: string;
  variant?: 'line' | 'merchant' | 'total';
  value: string;
  error: string | undefined;
  /** True while the entry is being saved, so nothing changes underneath the request. */
  locked: boolean;
  inputProps: InputHTMLAttributes<HTMLInputElement>;
  onChange: (field: EditableField, value: string) => void;
}

/**
 * One line of the blank slip. It wears the same classes as a line on the review slip, without
 * that one's corrections: on a new entry there is no saved value to compare with or go back to.
 */
function EntryField({
  field,
  label,
  labelSuffix,
  prefix,
  variant = 'line',
  value,
  error,
  locked,
  inputProps,
  onChange,
}: EntryFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="slip-field" data-variant={variant} data-invalid={error ? true : undefined}>
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
          value={value}
          required
          readOnly={locked}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(field, event.target.value)}
        />
      </div>

      {error && (
        <p className="slip-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}
