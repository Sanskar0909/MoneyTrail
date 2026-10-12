import type { Receipt } from '../api';
import { ManualEntryForm } from './ManualEntryForm';
import { UploadPanel } from './UploadPanel';

interface AddScreenProps {
  /** Called when either way adds something, so the list and the overview can catch up. */
  onAdded: (receipt: Receipt) => void;
}

/** Where spending comes into the app: a receipt to be read, or an entry typed in by hand. */
export function AddScreen({ onAdded }: AddScreenProps) {
  return (
    <section className="add" aria-labelledby="add-heading">
      <div className="page-head">
        <h1 id="add-heading" className="page-title">
          Add a receipt
        </h1>
      </div>
      <p className="page-lead">
        Photograph or upload a receipt and it is read for you, then waits for you to check it. With no
        receipt, type the entry in.
      </p>
      <div className="add-ways">
        <UploadPanel onUploaded={onAdded} />
        <ManualEntryForm onSaved={onAdded} />
      </div>
    </section>
  );
}
