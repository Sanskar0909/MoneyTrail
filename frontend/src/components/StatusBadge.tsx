import type { ReceiptStatus } from '../api';

const LABELS: Record<ReceiptStatus, string> = {
  UPLOADED: 'Uploaded',
  PROCESSING: 'Processing',
  EXTRACTED: 'Extracted',
  NEEDS_REVIEW: 'Needs review',
  CONFIRMED: 'Confirmed',
  FAILED: 'Failed',
};

interface StatusBadgeProps {
  status: ReceiptStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className="badge" data-status={status}>
      {LABELS[status]}
    </span>
  );
}
