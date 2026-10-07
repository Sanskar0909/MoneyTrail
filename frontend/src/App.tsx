import { useEffect } from 'react';
import { ReceiptList } from './components/ReceiptList';
import { ReviewScreen } from './components/ReviewScreen';
import { UploadPanel } from './components/UploadPanel';
import { useReceipts } from './hooks/useReceipts';
import { useRoute } from './hooks/useRoute';
import { countWaiting, findNextToReview } from './review';
import './App.css';

export default function App() {
  const route = useRoute();
  const { receipts, isLoading, isPolling, error, refresh } = useReceipts();
  const reviewingId = route.page === 'review' ? route.receiptId : null;

  // A new page starts at the top. Without this the browser keeps the old page's scroll position.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [reviewingId]);

  return (
    <div className="app" data-page={route.page}>
      <header className="app-header">
        <h1>MoneyTrail</h1>
        <p className="tagline">Upload a receipt and let the pipeline read it.</p>
      </header>

      <main className="app-main">
        {reviewingId !== null ? (
          // Keyed by receipt, so moving to the next one starts the screen afresh: no edits,
          // messages or zoom carried over from the receipt before.
          <ReviewScreen
            key={reviewingId}
            receiptId={reviewingId}
            nextReceiptId={findNextToReview(receipts, reviewingId)}
            waitingCount={countWaiting(receipts, reviewingId)}
            onChanged={() => void refresh()}
          />
        ) : (
          <>
            <UploadPanel onUploaded={() => void refresh()} />
            <ReceiptList
              receipts={receipts}
              isLoading={isLoading}
              isPolling={isPolling}
              error={error}
              onRefresh={() => void refresh()}
            />
          </>
        )}
      </main>
    </div>
  );
}
