import { ADD_HREF, RECEIPTS_HREF, SPENDING_HREF, type Route } from '../hooks/useRoute';
import { BarsIcon, PlusIcon, ReceiptIcon } from './icons';

interface AppNavProps {
  page: Route['page'];
  /** Receipts waiting for review, shown as a count on the Receipts link. */
  waitingCount: number;
}

/**
 * The way between the app's three places. One `<nav>` for every screen size: CSS lays it out along
 * the top on a laptop and pins it to the bottom on a phone, where a thumb can reach it.
 */
export function AppNav({ page, waitingCount }: AppNavProps) {
  // Reviewing a receipt is part of Receipts, so that link stays lit while one is open.
  const inReceipts = page === 'receipts' || page === 'review';

  return (
    <nav className="app-nav" aria-label="Main">
      <a href={SPENDING_HREF} aria-current={page === 'spending' ? 'page' : undefined}>
        <BarsIcon size={20} />
        <span>Spending</span>
      </a>
      <a href={RECEIPTS_HREF} aria-current={inReceipts ? 'page' : undefined}>
        <ReceiptIcon size={20} />
        <span>Receipts</span>
        {waitingCount > 0 && (
          <span className="nav-count">
            {waitingCount}
            <span className="visually-hidden"> waiting for review</span>
          </span>
        )}
      </a>
      <a className="nav-add" href={ADD_HREF} aria-current={page === 'add' ? 'page' : undefined}>
        <PlusIcon size={20} />
        <span>
          Add<span className="nav-wide"> a receipt</span>
        </span>
      </a>
    </nav>
  );
}
