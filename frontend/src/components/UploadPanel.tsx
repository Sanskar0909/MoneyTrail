import { useId, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  ACCEPTED_CONTENT_TYPES,
  ACCEPT_ATTRIBUTE,
  MAX_FILE_SIZE_BYTES,
  uploadReceipt,
  type Receipt,
} from '../api';
import { formatBytes } from '../format';
import { reviewHref } from '../hooks/useRoute';

interface UploadPanelProps {
  onUploaded: (receipt: Receipt) => void;
}

/**
 * Client-side checks that mirror the server's. These exist for fast feedback only — the server
 * validates independently and is the real gate.
 *
 * A browser sometimes reports an empty type (common for .heic); in that case we let it through
 * and let the server decide, rather than rejecting a file that might be perfectly valid.
 */
function findLocalProblem(file: File): string | null {
  if (file.size === 0) {
    return 'That file is empty.';
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_SIZE_BYTES)}.`;
  }
  if (file.type && !ACCEPTED_CONTENT_TYPES.includes(file.type as (typeof ACCEPTED_CONTENT_TYPES)[number])) {
    return `${file.type} is not a supported file type. Upload a JPEG, PNG, HEIC or PDF.`;
  }
  return null;
}

export function UploadPanel({ onUploaded }: UploadPanelProps) {
  const inputId = useId();
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<Receipt | null>(null);

  async function upload(file: File) {
    const problem = findLocalProblem(file);
    if (problem) {
      setError(problem);
      setUploaded(null);
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploaded(null);
    try {
      const receipt = await uploadReceipt(file);
      setUploaded(receipt);
      onUploaded(receipt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void upload(file);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared straight away, so choosing the same file again or retaking a photo still fires a
    // change event, whichever of the two inputs was used.
    event.target.value = '';
    if (file) void upload(file);
  }

  return (
    <section className="panel" aria-labelledby={`${inputId}-heading`}>
      <h2 id={`${inputId}-heading`} className="panel-heading">
        Upload a receipt
      </h2>

      <label
        htmlFor={inputId}
        className="dropzone"
        data-dragging={isDraggingOver || undefined}
        data-busy={isUploading || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
      >
        <input
          id={inputId}
          className="visually-hidden"
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          disabled={isUploading}
          onChange={handleChange}
        />
        <span className="dropzone-primary">
          {isUploading ? (
            'Uploading…'
          ) : (
            <>
              <span className="for-mouse">Drop a receipt here, or click to choose</span>
              <span className="for-touch">Choose a photo or a PDF</span>
            </>
          )}
        </span>
        <span className="dropzone-secondary">
          JPEG, PNG, HEIC or PDF, up to {formatBytes(MAX_FILE_SIZE_BYTES)}
        </span>
      </label>

      <label className="button-primary camera-button" data-busy={isUploading || undefined}>
        <input
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          disabled={isUploading}
          onChange={handleChange}
        />
        Take a photo
      </label>

      <p className="feedback" role="status" aria-live="polite">
        {uploaded && (
          <>
            Uploaded {uploaded.originalFilename}. It is being read now.{' '}
            <a href={reviewHref(uploaded.id)}>Open it</a>
          </>
        )}
      </p>
      {error && (
        <p className="feedback feedback-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
