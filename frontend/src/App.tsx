import { ReceiptList } from './components/ReceiptList';
import { UploadPanel } from './components/UploadPanel';
import { useReceipts } from './hooks/useReceipts';
import './App.css';

export default function App() {
  const { receipts, isLoading, isPolling, error, refresh } = useReceipts();

  return (
    <div className="app">
      <header className="app-header">
        <h1>MoneyTrail</h1>
        <p className="tagline">Upload a receipt and let the pipeline read it.</p>
      </header>

      <main className="app-main">
        <UploadPanel onUploaded={() => void refresh()} />
        <ReceiptList
          receipts={receipts}
          isLoading={isLoading}
          isPolling={isPolling}
          error={error}
          onRefresh={() => void refresh()}
        />
      </main>
    </div>
  );
}
