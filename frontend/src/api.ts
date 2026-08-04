/**
 * Client for the MoneyTrail backend.
 *
 * Types here mirror `ReceiptResponse` on the server. If the DTO changes, change it here too —
 * nothing enforces the contract across the boundary.
 */

export const RECEIPT_STATUSES = [
  'UPLOADED',
  'PROCESSING',
  'EXTRACTED',
  'NEEDS_REVIEW',
  'CONFIRMED',
  'FAILED',
] as const;

export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export interface Receipt {
  id: number;
  status: ReceiptStatus;
  originalFilename: string;
  /** Null until the extraction pipeline has run. */
  merchantName: string | null;
  /** ISO date (`2026-08-04`), null until extracted. */
  receiptDate: string | null;
  totalAmount: number | null;
  currency: string;
  /** ISO instant in UTC. */
  uploadedAt: string;
}

/** Mirrors `moneytrail.upload.*` in application.yml. The server is the real authority. */
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

export const ACCEPTED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'application/pdf',
] as const;

/** Value for an `<input type="file">` accept attribute. */
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_CONTENT_TYPES, '.heic'].join(',');

/** An error carrying the HTTP status, so callers can distinguish "bad input" from "server broke". */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * The backend's GlobalExceptionHandler returns `{ message, timestamp }` for every failure, so
 * we surface `message` directly. Falls back to the status text if the body isn't what we expect.
 */
async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T;
  }

  let message = response.statusText || `Request failed with ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
      message = body.message;
    }
  } catch {
    // Non-JSON error body (e.g. a proxy error page) — keep the status-based message.
  }

  throw new ApiError(message, response.status);
}

/** Wraps network-level failures so callers only ever have to handle ApiError. */
async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw cause;
    }
    throw new ApiError('Could not reach the server. Is the backend running?', 0);
  }
  return parseResponse<T>(response);
}

export function uploadReceipt(file: File, signal?: AbortSignal): Promise<Receipt> {
  const formData = new FormData();
  formData.append('file', file);
  return request<Receipt>('/api/receipts', { method: 'POST', body: formData, signal });
}

export function listReceipts(signal?: AbortSignal): Promise<Receipt[]> {
  return request<Receipt[]>('/api/receipts', { signal });
}
