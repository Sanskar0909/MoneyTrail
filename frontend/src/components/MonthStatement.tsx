import { formatAmount, formatMonth, formatPaise } from '../format';
import type { MerchantTotal, PeriodTotal } from '../spending';

interface MonthStatementProps {
  month: string;
  /** Largest first. */
  merchants: MerchantTotal[];
  total: PeriodTotal;
  currency: string;
}

/** Past this many lines the smallest merchants are folded into one, so the slip stays readable. */
const MAX_LINES = 7;

/**
 * The month written out as one long receipt: a line per merchant and a total at the bottom, the
 * way a till prints its end-of-day summary. It is the same paper slip the receipts are drawn on,
 * so the month reads as a receipt made of receipts.
 */
export function MonthStatement({ month, merchants, total, currency }: MonthStatementProps) {
  const titleId = `statement-${month}`;
  const shown = merchants.slice(0, MAX_LINES);
  const rest = merchants.slice(MAX_LINES);
  const restPaise = rest.reduce((sum, merchant) => sum + merchant.paise, 0);

  return (
    <div className="statement">
      <section className="receipt-paper" aria-labelledby={titleId}>
        <header className="receipt-head">
          <h3 id={titleId} className="receipt-merchant">
            {formatMonth(month)}
          </h3>
          <p className="receipt-file">By merchant</p>
        </header>

        {merchants.length === 0 ? (
          <p className="statement-empty">Nothing confirmed this month.</p>
        ) : (
          <dl className="receipt-lines statement-lines">
            {shown.map((merchant) => (
              <div className="receipt-line" key={merchant.name}>
                <dt>
                  <span className="statement-name">{merchant.name}</span>
                </dt>
                <dd>{formatAmount(merchant.paise / 100)}</dd>
              </div>
            ))}
            {rest.length > 0 && (
              <div className="receipt-line">
                <dt>
                  <span className="statement-name">{rest.length} more</span>
                </dt>
                <dd>{formatAmount(restPaise / 100)}</dd>
              </div>
            )}
          </dl>
        )}

        <dl className="receipt-lines statement-total">
          <div className="receipt-line receipt-total">
            <dt>Total</dt>
            <dd>{formatPaise(total.paise, currency)}</dd>
          </div>
        </dl>

        <footer className="receipt-foot">
          <p className="receipt-meta">
            {total.count === 1 ? '1 confirmed receipt' : `${total.count} confirmed receipts`}
          </p>
        </footer>
      </section>
    </div>
  );
}
