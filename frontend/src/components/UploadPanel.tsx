import { useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  ACCEPTED_CONTENT_TYPES,
  ACCEPT_ATTRIBUTE,
  MAX_FILE_SIZE_BYTES,
  uploadReceipt,
  type Receipt,
} from '../api';
import { formatBytes } from '../format';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  async function upload(file: File) {
    const problem = findLocalProblem(file);
    if (problem) {
      setError(problem);
      setUploadedName(null);
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadedName(null);
    try {
      const receipt = await uploadReceipt(file);
      setUploadedName(receipt.originalFilename);
      onUploaded(receipt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed.');
    } finally {
      setIsUploading(false);
      // Reset the input so selecting the same file twice still fires a change event.
      if (inputRef.current) inputRef.current.value = '';
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
          ref={inputRef}
          id={inputId}
          className="visually-hidden"
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          disabled={isUploading}
          onChange={handleChange}
        />
        <span className="dropzone-primary">
          {isUploading ? 'Uploading…' : 'Drop a receipt here, or click to choose'}
        </span>
        <span className="dropzone-secondary">
          JPEG, PNG, HEIC or PDF · up to {formatBytes(MAX_FILE_SIZE_BYTES)}
        </span>
      </label>

      <p className="feedback" role="status" aria-live="polite">
        {uploadedName ? `Uploaded ${uploadedName}. It is queued for extraction.` : ''}
      </p>
      {error && (
        <p className="feedback feedback-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
