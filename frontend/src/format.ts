/** Presentation helpers. Kept out of components so they stay testable and consistent. */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

export function formatMoney(amount: number | null, currency: string): string {
  if (amount === null) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    // Unknown currency code — fall back to a plain number rather than throwing.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * A plain amount, two decimals and local digit grouping — `1,224.30` — for receipt lines, where
 * the currency is already shown once on the total.
 */
export function formatAmount(amount: number | null): string {
  if (amount === null) return '—';
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** The symbol for a currency code — `INR` → `₹` — or the code itself if the browser has none. */
export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

/** ISO date (`2026-08-04`) → a short human date. */
export function formatDate(isoDate: string | null): string {
  if (!isoDate) return '—';
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** ISO instant → local date and time. */
export function formatTimestamp(isoInstant: string): string {
  const parsed = new Date(isoInstant);
  if (Number.isNaN(parsed.getTime())) return isoInstant;
  return parsed.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** `2026-10` → `October 2026`. */
export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

/** `2026-10` → `October`, `Oct` or `O`, for wherever the year is already on screen. */
export function formatMonthName(month: string, width: 'long' | 'short' | 'narrow' = 'long'): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, { month: width });
}

/** ISO date → `Tue 7 Oct`, for a day inside a month that is already named. */
export function formatDay(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** An amount held in paise → `₹1,224.30`. */
export function formatPaise(paise: number, currency: string): string {
  return formatMoney(paise / 100, currency);
}

/** A short amount for a chart axis, where there is no room for digits: 40,000 → `₹40K`. */
export function formatMoneyCompact(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return String(amount);
  }
}
