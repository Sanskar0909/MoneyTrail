/**
 * The rules of the spending overview: which receipts count, which day each one falls on, and how
 * they add up. Pure functions — no React, no I/O — for the same reason format.ts and review.ts exist.
 *
 * Everything here works from the receipt list the app already loads, so the overview needs no
 * endpoint of its own. That is fine for one person's receipts; at thousands of rows the sums
 * belong in SQL (`GROUP BY date_trunc('month', receipt_date)`) behind a summary endpoint.
 */
import type { Receipt } from './api';

/** A calendar month, `2026-10`. Sorts correctly as plain text. */
export type MonthKey = string;

/** One confirmed receipt, reduced to what the sums need. */
export interface Spend {
  receiptId: number;
  /** ISO date the spend is placed on. */
  date: string;
  /** True when the receipt had no date of its own, so the day it was uploaded stands in. */
  dateAssumed: boolean;
  merchant: string | null;
  /**
   * The total in paise, as a whole number. Money is summed as integers because doubles drift:
   * 0.1 + 0.2 is 0.30000000000000004. Same reason the backend uses BigDecimal.
   */
  paise: number;
}

/** A total for one period: a month, or a day. */
export interface PeriodTotal {
  /** `2026-10` for a month, `2026-10-07` for a day. */
  key: string;
  paise: number;
  count: number;
}

export interface MerchantTotal {
  name: string;
  paise: number;
  count: number;
}

export interface WaitingSummary {
  count: number;
  /** What the waiting receipts add up to, so the overview can say what it is leaving out. */
  paise: number;
  firstId: number | null;
}

export function toPaise(amount: number): number {
  return Math.round(amount * 100);
}

/** A date in the browser's time zone, as ISO. Not `toISOString()`, which is in UTC. */
export function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The day a receipt belongs to: the date printed on it, or the day it was uploaded when no date
 * was read. Receipts often come back without one, and leaving those out would hide real spending.
 */
export function spendDate(receipt: Receipt): string {
  return receipt.receiptDate ?? localIsoDate(new Date(receipt.uploadedAt));
}

export function monthOf(isoDate: string): MonthKey {
  return isoDate.slice(0, 7);
}

/** `2026-01` shifted by -1 is `2025-12`. */
export function shiftMonth(month: MonthKey, by: number): MonthKey {
  const [year, monthNumber] = month.split('-').map(Number);
  return localIsoDate(new Date(year, monthNumber - 1 + by, 1)).slice(0, 7);
}

export function daysInMonth(month: MonthKey): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

/**
 * The currency most receipts are in. Sums only make sense within one currency, so the overview
 * totals this one and says how many receipts it left out.
 */
export function mainCurrency(receipts: readonly Receipt[]): string {
  const counts = new Map<string, number>();
  for (const receipt of receipts) {
    counts.set(receipt.currency, (counts.get(receipt.currency) ?? 0) + 1);
  }
  let best = 'INR';
  let bestCount = 0;
  for (const [currency, count] of counts) {
    if (count > bestCount) {
      best = currency;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Only confirmed receipts count as spending. One that is still waiting for review may be a
 * misread, and a wrong total should not move the numbers until a person has checked it.
 */
export function listSpends(receipts: readonly Receipt[], currency: string): Spend[] {
  const spends: Spend[] = [];
  for (const receipt of receipts) {
    if (receipt.status !== 'CONFIRMED' || receipt.totalAmount === null) continue;
    if (receipt.currency !== currency) continue;
    spends.push({
      receiptId: receipt.id,
      date: spendDate(receipt),
      dateAssumed: receipt.receiptDate === null,
      merchant: receipt.merchantName,
      paise: toPaise(receipt.totalAmount),
    });
  }
  return spends;
}

export function summariseWaiting(receipts: readonly Receipt[], currency: string): WaitingSummary {
  const waiting = receipts.filter((receipt) => receipt.status === 'NEEDS_REVIEW');
  let paise = 0;
  for (const receipt of waiting) {
    if (receipt.totalAmount !== null && receipt.currency === currency) paise += toPaise(receipt.totalAmount);
  }
  return { count: waiting.length, paise, firstId: waiting[0]?.id ?? null };
}

/** Twelve totals, January to December, including the months with nothing in them. */
export function totalsByMonth(spends: readonly Spend[], year: number): PeriodTotal[] {
  const totals: PeriodTotal[] = Array.from({ length: 12 }, (_, index) => ({
    key: `${year}-${String(index + 1).padStart(2, '0')}`,
    paise: 0,
    count: 0,
  }));
  for (const spend of spends) {
    if (Number(spend.date.slice(0, 4)) !== year) continue;
    const total = totals[Number(spend.date.slice(5, 7)) - 1];
    if (!total) continue;
    total.paise += spend.paise;
    total.count += 1;
  }
  return totals;
}

/** One total per day of the month, including the days with nothing on them. */
export function totalsByDay(spends: readonly Spend[], month: MonthKey): PeriodTotal[] {
  const totals: PeriodTotal[] = Array.from({ length: daysInMonth(month) }, (_, index) => ({
    key: `${month}-${String(index + 1).padStart(2, '0')}`,
    paise: 0,
    count: 0,
  }));
  for (const spend of spends) {
    if (monthOf(spend.date) !== month) continue;
    const total = totals[Number(spend.date.slice(8, 10)) - 1];
    if (!total) continue;
    total.paise += spend.paise;
    total.count += 1;
  }
  return totals;
}

export function totalForMonth(spends: readonly Spend[], month: MonthKey): PeriodTotal {
  const total: PeriodTotal = { key: month, paise: 0, count: 0 };
  for (const spend of spends) {
    if (monthOf(spend.date) !== month) continue;
    total.paise += spend.paise;
    total.count += 1;
  }
  return total;
}

/**
 * Where the month's money went, largest first. Names are matched without regard to case or
 * surrounding spaces, so "Big Bazaar" and "BIG BAZAAR " are one merchant.
 */
export function totalsByMerchant(spends: readonly Spend[], month: MonthKey): MerchantTotal[] {
  const byName = new Map<string, MerchantTotal>();
  for (const spend of spends) {
    if (monthOf(spend.date) !== month) continue;
    const name = spend.merchant?.trim() || 'Unknown merchant';
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      existing.paise += spend.paise;
      existing.count += 1;
    } else {
      byName.set(key, { name, paise: spend.paise, count: 1 });
    }
  }
  return [...byName.values()].sort((a, b) => b.paise - a.paise || a.name.localeCompare(b.name));
}

/** The first year with any spending in it, or the fallback when there is none yet. */
export function earliestYear(spends: readonly Spend[], fallback: number): number {
  let earliest = fallback;
  for (const spend of spends) {
    earliest = Math.min(earliest, Number(spend.date.slice(0, 4)));
  }
  return earliest;
}

/**
 * A round number at or above the largest value, for the top of a chart: 20,367 → 30,000. Every
 * step is one whose half is also a round number, because the middle gridline is drawn at half.
 */
export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const fraction = value / magnitude;
  const step = [1, 2, 3, 4, 5, 6, 8, 10].find((candidate) => candidate >= fraction) ?? 10;
  return step * magnitude;
}

/** Receipts filed under the month each one belongs to, newest month first. */
export interface MonthGroup {
  month: MonthKey;
  receipts: Receipt[];
  /** What the confirmed receipts in this group add up to. */
  confirmedPaise: number;
}

export function groupByMonth(receipts: readonly Receipt[], currency: string): MonthGroup[] {
  const groups = new Map<MonthKey, MonthGroup>();
  for (const receipt of receipts) {
    const month = monthOf(spendDate(receipt));
    let group = groups.get(month);
    if (!group) {
      group = { month, receipts: [], confirmedPaise: 0 };
      groups.set(month, group);
    }
    group.receipts.push(receipt);
    if (receipt.status === 'CONFIRMED' && receipt.totalAmount !== null && receipt.currency === currency) {
      group.confirmedPaise += toPaise(receipt.totalAmount);
    }
  }
  for (const group of groups.values()) {
    group.receipts.sort((a, b) => spendDate(b).localeCompare(spendDate(a)) || b.id - a.id);
  }
  return [...groups.values()].sort((a, b) => b.month.localeCompare(a.month));
}
