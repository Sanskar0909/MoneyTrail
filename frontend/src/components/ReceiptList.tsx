import type { Receipt } from '../api';
import { formatDate, formatMoney, formatTimestamp } from '../format';
import { StatusBadge } from './StatusBadge';

interface ReceiptListProps {
  receipts: Receipt[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function ReceiptList({ receipts, isLoading, error, onRefresh }: ReceiptListProps) {
  return (
    <section className="panel" aria-labelledby="receipts-heading">
      <div className="panel-header">
        <h2 id="receipts-heading" className="panel-heading">
          Receipts
          {receipts.length > 0 && <span className="count">{receipts.length}</span>}
        </h2>
        <button type="button" className="button-secondary" onClick={onRefresh} disabled={isLoading}>
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p className="feedback feedback-error" role="alert">
          {error}
        </p>
      )}

      {!error && receipts.length === 0 && !isLoading && (
        <p className="empty">No receipts yet. Upload one above to get started.</p>
      )}

      {receipts.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Status</th>
                <th scope="col">Merchant</th>
                <th scope="col">Receipt date</th>
                <th scope="col" className="numeric">
                  Total
                </th>
                <th scope="col">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.id}>
                  <td className="filename" title={receipt.originalFilename}>
                    {receipt.originalFilename}
                  </td>
                  <td>
                    <StatusBadge status={receipt.status} />
                  </td>
                  <td>{receipt.merchantName ?? <span className="muted">—</span>}</td>
                  <td>{formatDate(receipt.receiptDate)}</td>
                  <td className="numeric">{formatMoney(receipt.totalAmount, receipt.currency)}</td>
                  <td className="muted">{formatTimestamp(receipt.uploadedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
