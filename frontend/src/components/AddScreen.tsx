import type { Receipt } from '../api';
import { UploadPanel } from './UploadPanel';

interface AddScreenProps {
  onUploaded: (receipt: Receipt) => void;
}

/** Where a receipt comes into the app: photographed, or chosen as a file. */
export function AddScreen({ onUploaded }: AddScreenProps) {
  return (
    <section className="add" aria-labelledby="add-heading">
      <div className="page-head">
        <h1 id="add-heading" className="page-title">
          Add a receipt
        </h1>
      </div>
      <p className="page-lead">
        Photograph a receipt or choose a file. It is read automatically, then waits for you to check it.
      </p>
      <UploadPanel onUploaded={onUploaded} />
    </section>
  );
}
