import { useEffect } from 'react';
import { AddScreen } from './components/AddScreen';
import { AppNav } from './components/AppNav';
import { ReceiptList } from './components/ReceiptList';
import { ReviewScreen } from './components/ReviewScreen';
import { SpendingScreen } from './components/SpendingScreen';
import { useReceipts } from './hooks/useReceipts';
import { SPENDING_HREF, useRoute, type Route } from './hooks/useRoute';
import { countWaiting, findNextToReview } from './review';
import './App.css';

/** What the browser tab says on each page. The review screen names its own, after the merchant. */
const PAGE_TITLES: Record<Exclude<Route['page'], 'review'>, string> = {
  spending: 'Spending',
  receipts: 'Receipts',
  add: 'Add a receipt',
};

export default function App() {
  const route = useRoute();
  // Loaded once, here, and shared: every page is a different view of the same receipts.
  const { receipts, isLoading, isPolling, error, refresh } = useReceipts();
  const reviewingId = route.page === 'review' ? route.receiptId : null;
  const waitingCount = receipts.filter((receipt) => receipt.status === 'NEEDS_REVIEW').length;

  // A new page starts at the top. Without this the browser keeps the old page's scroll position.
  // Picking another month or filter is the same page, so that leaves the scroll where it is.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.page, reviewingId]);

  useEffect(() => {
    if (route.page !== 'review') document.title = `${PAGE_TITLES[route.page]} — MoneyTrail`;
  }, [route.page]);

  return (
    <div className="app" data-page={route.page}>
      <header className="app-header">
        <a className="wordmark" href={SPENDING_HREF}>
          <img src="/icon.svg" width="26" height="26" alt="" />
          MoneyTrail
        </a>
        <AppNav page={route.page} waitingCount={waitingCount} />
      </header>

      <main className="app-main">
        {route.page === 'review' && (
          // Keyed by receipt, so moving to the next one starts the screen afresh: no edits,
          // messages or zoom carried over from the receipt before.
          <ReviewScreen
            key={route.receiptId}
            receiptId={route.receiptId}
            nextReceiptId={findNextToReview(receipts, route.receiptId)}
            waitingCount={countWaiting(receipts, route.receiptId)}
            onChanged={() => void refresh()}
          />
        )}
        {route.page === 'spending' && (
          <SpendingScreen receipts={receipts} isLoading={isLoading} error={error} month={route.month} />
        )}
        {route.page === 'receipts' && (
          <ReceiptList
            receipts={receipts}
            isLoading={isLoading}
            isPolling={isPolling}
            error={error}
            filter={route.filter}
            onRefresh={() => void refresh()}
          />
        )}
        {route.page === 'add' && <AddScreen onUploaded={() => void refresh()} />}
      </main>
    </div>
  );
}
