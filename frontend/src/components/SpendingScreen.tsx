import { useMemo } from 'react';
import type { Receipt } from '../api';
import {
  formatDay,
  formatMoneyCompact,
  formatMonth,
  formatMonthName,
  formatPaise,
} from '../format';
import { ADD_HREF, reviewHref, spendingHref } from '../hooks/useRoute';
import {
  earliestYear,
  listSpends,
  localIsoDate,
  mainCurrency,
  monthOf,
  niceCeiling,
  shiftMonth,
  summariseWaiting,
  totalForMonth,
  totalsByDay,
  totalsByMerchant,
  totalsByMonth,
  type PeriodTotal,
} from '../spending';
import { BarChart, type ChartBar, type ChartTick } from './BarChart';
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';
import { MonthStatement } from './MonthStatement';
import './SpendingScreen.css';

interface SpendingScreenProps {
  receipts: Receipt[];
  isLoading: boolean;
  error: string | null;
  /** The month picked in the address, `2026-10`, or null for the current one. */
  month: string | null;
}

/** The days that get a number under them. Every seventh, so they line up as weeks. */
const LABELLED_DAYS = new Set([1, 8, 15, 22, 29]);

function countReceipts(count: number): string {
  if (count === 0) return 'No receipts';
  return count === 1 ? '1 receipt' : `${count} receipts`;
}

/** Gridlines at nothing, half and the top. A chart with no data gets the baseline alone. */
function scaleFor(totals: readonly PeriodTotal[], currency: string): { max: number; ticks: ChartTick[] } {
  const largest = Math.max(0, ...totals.map((total) => total.paise));
  if (largest === 0) return { max: 1, ticks: [{ value: 0, label: formatMoneyCompact(0, currency) }] };

  const max = niceCeiling(largest / 100) * 100;
  return {
    max,
    ticks: [0, max / 2, max].map((value) => ({ value, label: formatMoneyCompact(value / 100, currency) })),
  };
}

/** "₹1,200.50 more than September." Says nothing when there is nothing to compare. */
function compare(current: PeriodTotal, previous: PeriodTotal, currency: string): string | null {
  if (current.count === 0 || previous.count === 0) return null;
  const difference = current.paise - previous.paise;
  const previousName = formatMonthName(previous.key);
  if (difference === 0) return `The same as ${previousName}.`;
  return `${formatPaise(Math.abs(difference), currency)} ${difference > 0 ? 'more' : 'less'} than ${previousName}.`;
}

/**
 * Where the money went: one month picked out, in the context of its year.
 *
 * The year's chart is also how a month is picked, and each pick is an ordinary link, so Back and
 * Forward step through the months that were looked at.
 */
export function SpendingScreen({ receipts, isLoading, error, month }: SpendingScreenProps) {
  const currentMonth = monthOf(localIsoDate(new Date()));
  const selected = month ?? currentMonth;
  const year = Number(selected.slice(0, 4));
  const currentYear = Number(currentMonth.slice(0, 4));

  const view = useMemo(() => {
    const currency = mainCurrency(receipts);
    const spends = listSpends(receipts, currency);
    const inMonth = spends.filter((spend) => monthOf(spend.date) === selected);

    return {
      currency,
      hasSpending: spends.length > 0,
      months: totalsByMonth(spends, year),
      days: totalsByDay(spends, selected),
      total: totalForMonth(spends, selected),
      previous: totalForMonth(spends, shiftMonth(selected, -1)),
      merchants: totalsByMerchant(spends, selected),
      waiting: summariseWaiting(receipts, currency),
      firstYear: earliestYear(spends, Math.min(year, currentYear)),
      datesAssumed: inMonth.filter((spend) => spend.dateAssumed).length,
      otherCurrencies: receipts.filter(
        (receipt) =>
          receipt.status === 'CONFIRMED' && receipt.totalAmount !== null && receipt.currency !== currency,
      ).length,
    };
  }, [receipts, selected, year, currentYear]);

  const { currency, months, days, total, previous, waiting } = view;
  const lastYear = Math.max(year, currentYear);
  const monthNumber = selected.slice(5, 7);
  const isCurrentMonth = selected === currentMonth;
  // A month that isn't over can only come out "less than" the full month before it, which says
  // nothing, so the comparison waits until the month is complete.
  const comparison = isCurrentMonth ? null : compare(total, previous, currency);

  const monthScale = scaleFor(months, currency);
  const monthBars: ChartBar[] = months.map((entry) => ({
    key: entry.key,
    value: entry.paise,
    tick: formatMonthName(entry.key, 'short'),
    tickNarrow: formatMonthName(entry.key, 'narrow'),
    label: formatMonth(entry.key),
    valueText: formatPaise(entry.paise, currency),
    detail: countReceipts(entry.count),
    href: spendingHref(entry.key),
    isSelected: entry.key === selected,
  }));

  const dayScale = scaleFor(days, currency);
  const dayBars: ChartBar[] = days.map((entry, index) => ({
    key: entry.key,
    value: entry.paise,
    tick: LABELLED_DAYS.has(index + 1) ? String(index + 1) : '',
    label: formatDay(entry.key),
    valueText: formatPaise(entry.paise, currency),
    detail: countReceipts(entry.count),
  }));
  const daysWithSpending = days.filter((entry) => entry.count > 0);

  const waitingCallout = waiting.firstId !== null && (
    <div className="queue-callout">
      <p>
        <strong>{waiting.count}</strong> {waiting.count === 1 ? 'receipt is' : 'receipts are'} waiting for
        review
        {waiting.paise > 0 && <>, worth {formatPaise(waiting.paise, currency)} that isn’t counted yet</>}.
      </p>
      <a className="button-primary" href={reviewHref(waiting.firstId)}>
        Start reviewing <ArrowRightIcon />
      </a>
    </div>
  );

  return (
    <section className="spending" aria-labelledby="spending-heading">
      <div className="page-head">
        <h1 id="spending-heading" className="page-title">
          Spending
        </h1>

        {view.hasSpending && (
          <div className="year-stepper" role="group" aria-label="Year">
            {year > view.firstYear ? (
              <a href={spendingHref(`${year - 1}-${monthNumber}`)} aria-label={`${year - 1}`}>
                <ChevronLeftIcon />
              </a>
            ) : (
              <span aria-hidden="true">
                <ChevronLeftIcon />
              </span>
            )}
            <span className="year-current">{year}</span>
            {year < lastYear ? (
              <a href={spendingHref(`${year + 1}-${monthNumber}`)} aria-label={`${year + 1}`}>
                <ChevronRightIcon />
              </a>
            ) : (
              <span aria-hidden="true">
                <ChevronRightIcon />
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="feedback feedback-error" role="alert">
          {error}
        </p>
      )}

      {isLoading && receipts.length === 0 && !error && <p className="empty">Loading your receipts…</p>}

      {!view.hasSpending && !(isLoading && receipts.length === 0) && !error && (
        <div className="spending-empty">
          <h2>Nothing is confirmed yet</h2>
          <p>
            Spending is added up from receipts you have checked and confirmed, so a misread total
            never counts.
          </p>
          {waitingCallout || (
            <a className="button-primary" href={ADD_HREF}>
              Add a receipt
            </a>
          )}
        </div>
      )}

      {view.hasSpending && (
        <div className="spending-layout">
          <div className="spending-main">
            <div className="hero">
              <h2 className="hero-month">{formatMonth(selected)}</h2>
              <p className="hero-figure">{formatPaise(total.paise, currency)}</p>
              <p className="hero-note">
                {total.count === 0
                  ? 'No confirmed receipts in this month.'
                  : `From ${total.count === 1 ? '1 confirmed receipt' : `${total.count} confirmed receipts`}${isCurrentMonth ? ' so far' : ''}.`}
                {comparison && <> {comparison}</>}
              </p>
            </div>

            {waitingCallout}

            <figure className="chart-block">
              <figcaption>
                <h3>Month by month</h3>
                <span>{year}</span>
              </figcaption>
              <BarChart
                label={`Spending in ${year}, month by month. Choose a month to see it in detail.`}
                bars={monthBars}
                max={monthScale.max}
                ticks={monthScale.ticks}
                emphasis
              />
            </figure>

            <figure className="chart-block">
              <figcaption>
                <h3>Day by day</h3>
                <span>{formatMonthName(selected)}</span>
              </figcaption>
              <BarChart
                label={`Spending in ${formatMonth(selected)}, day by day`}
                bars={dayBars}
                max={dayScale.max}
                ticks={dayScale.ticks}
                size="short"
              />
            </figure>

            <details className="chart-tables">
              <summary>Show these numbers as a table</summary>
              <div className="chart-tables-body">
                <table>
                  <caption>{year}, month by month</caption>
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col">Receipts</th>
                      <th scope="col">Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((entry) => (
                      <tr key={entry.key}>
                        <th scope="row">{formatMonthName(entry.key)}</th>
                        <td>{entry.count}</td>
                        <td>{formatPaise(entry.paise, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <table>
                  <caption>{formatMonth(selected)}, day by day</caption>
                  <thead>
                    <tr>
                      <th scope="col">Day</th>
                      <th scope="col">Receipts</th>
                      <th scope="col">Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daysWithSpending.length === 0 ? (
                      <tr>
                        <td colSpan={3}>No confirmed receipts in this month.</td>
                      </tr>
                    ) : (
                      daysWithSpending.map((entry) => (
                        <tr key={entry.key}>
                          <th scope="row">{formatDay(entry.key)}</th>
                          <td>{entry.count}</td>
                          <td>{formatPaise(entry.paise, currency)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </details>

            {view.datesAssumed > 0 && (
              <p className="spending-footnote">
                {view.datesAssumed === 1
                  ? '1 receipt this month had no date on it, so it is placed on the day it was uploaded.'
                  : `${view.datesAssumed} receipts this month had no date on them, so they are placed on the day they were uploaded.`}
              </p>
            )}
            {view.otherCurrencies > 0 && (
              <p className="spending-footnote">
                {view.otherCurrencies === 1
                  ? '1 confirmed receipt in another currency is left out of these totals.'
                  : `${view.otherCurrencies} confirmed receipts in other currencies are left out of these totals.`}
              </p>
            )}
          </div>

          <MonthStatement month={selected} merchants={view.merchants} total={total} currency={currency} />
        </div>
      )}
    </section>
  );
}
