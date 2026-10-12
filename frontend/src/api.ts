/**
 * Client for the MoneyTrail backend.
 *
 * Types here mirror `ReceiptResponse` and `ReceiptDetailResponse` on the server. If a DTO changes,
 * change it here too — nothing enforces the contract across the boundary.
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

/** Statuses the pipeline will change on its own. Everything else only changes when a person acts. */
export const IN_FLIGHT_STATUSES: ReadonlySet<ReceiptStatus> = new Set(['UPLOADED', 'PROCESSING']);

/** The statuses `PATCH /api/receipts/{id}` accepts. Anything else is answered with a 409. */
export const EDITABLE_STATUSES: ReadonlySet<ReceiptStatus> = new Set(['NEEDS_REVIEW', 'CONFIRMED']);

export interface Receipt {
  id: number;
  status: ReceiptStatus;
  /** Null for an entry typed in by hand, which has no file. */
  originalFilename: string | null;
  /** Null until the extraction pipeline has run. */
  merchantName: string | null;
  /** ISO date (`2026-08-04`), null until extracted. */
  receiptDate: string | null;
  totalAmount: number | null;
  currency: string;
  /** ISO instant in UTC. */
  uploadedAt: string;
}

/**
 * Whether this was typed in by hand rather than uploaded.
 *
 * The response has no field that says so, but the database refuses an upload without a filename,
 * so a missing filename can only mean a typed entry.
 */
export function isTypedIn(receipt: Receipt): boolean {
  return receipt.originalFilename === null;
}

/**
 * The parts of the model's latest successful reading that are not copied onto the receipt.
 * Nothing in the API edits these: they are what the model saw, kept for comparison.
 */
export interface ReceiptExtraction {
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  /** Between 0 and 1: how sure the model said it was. */
  confidenceScore: number | null;
}

/** One receipt with everything the review screen needs. Mirrors `ReceiptDetailResponse`. */
export interface ReceiptDetail extends Receipt {
  /** Null until an extraction attempt has succeeded. */
  extraction: ReceiptExtraction | null;
}

/**
 * A correction, as `ReceiptUpdateRequest` takes it. Only the fields present are changed: the
 * server skips nulls, so a field that has a value can be corrected but never cleared.
 */
export interface ReceiptUpdate {
  merchantName?: string;
  /** ISO date, `2026-08-04`. */
  receiptDate?: string;
  totalAmount?: number;
}

/** An entry typed in by hand, as `ManualEntryRequest` takes it. All three are required. */
export interface ManualEntry {
  merchantName: string;
  /** ISO date, `2026-08-04`. Not in the future. */
  receiptDate: string;
  totalAmount: number;
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
  /** The server's complaint about each rejected field, by field name. Empty for other failures. */
  readonly fields: Readonly<Record<string, string>>;

  constructor(message: string, status: number, fields: Readonly<Record<string, string>> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

/**
 * The backend's GlobalExceptionHandler returns `{ message, timestamp }` for every failure, so
 * we surface `message` directly. Falls back to the status text if the body isn't what we expect.
 * A body that failed validation also carries `fields`, one message per rejected field.
 */
async function readError(response: Response): Promise<ApiError> {
  let message = response.statusText || `Request failed with ${response.status}`;
  const fields: Record<string, string> = {};
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object') {
      if ('message' in body && typeof body.message === 'string') message = body.message;
      if ('fields' in body && body.fields && typeof body.fields === 'object') {
        for (const [field, complaint] of Object.entries(body.fields)) {
          if (typeof complaint === 'string') fields[field] = complaint;
        }
      }
    }
  } catch {
    // Non-JSON error body (e.g. a proxy error page) — keep the status-based message.
  }
  return new ApiError(message, response.status, fields);
}

/**
 * Sends a request and returns the response only if it succeeded. Network failures and error
 * statuses both become ApiError, so callers only ever have to handle one thing.
 */
async function send(input: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw cause;
    }
    throw new ApiError('Could not reach the server. Is the backend running?', 0);
  }
  if (!response.ok) {
    throw await readError(response);
  }
  return response;
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await send(input, init);
  return (await response.json()) as T;
}

export function uploadReceipt(file: File, signal?: AbortSignal): Promise<Receipt> {
  const formData = new FormData();
  formData.append('file', file);
  return request<Receipt>('/api/receipts', { method: 'POST', body: formData, signal });
}

/**
 * Saves an entry typed in by hand. It is confirmed from the start: nothing reads it and nobody
 * reviews it, so it counts towards spending as soon as this resolves.
 */
export function createManualEntry(entry: ManualEntry, signal?: AbortSignal): Promise<Receipt> {
  return request<Receipt>('/api/receipts/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
    signal,
  });
}

export function listReceipts(signal?: AbortSignal): Promise<Receipt[]> {
  return request<Receipt[]>('/api/receipts', { signal });
}

export function getReceipt(receiptId: number, signal?: AbortSignal): Promise<ReceiptDetail> {
  return request<ReceiptDetail>(`/api/receipts/${receiptId}`, { signal });
}

/**
 * Saves corrections. Only send the fields that changed: a field left out keeps its value.
 *
 * Correcting a confirmed receipt sends it back to NEEDS_REVIEW, so it has to be confirmed again.
 */
export function updateReceipt(
  receiptId: number,
  update: ReceiptUpdate,
  signal?: AbortSignal,
): Promise<ReceiptDetail> {
  return request<ReceiptDetail>(`/api/receipts/${receiptId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
    signal,
  });
}

/**
 * Marks a reviewed receipt as correct. Answers 409 if it has no total, or if it is no longer
 * waiting for review — confirmed in another tab, say.
 */
export function confirmReceipt(receiptId: number, signal?: AbortSignal): Promise<ReceiptDetail> {
  return request<ReceiptDetail>(`/api/receipts/${receiptId}/confirm`, { method: 'POST', signal });
}

/** Where the original upload is served, for links that open or download it. */
export function receiptFileUrl(receiptId: number): string {
  return `/api/receipts/${receiptId}/image`;
}

/**
 * The original upload as a Blob. Its `type` is the stored content type, which the detail
 * response doesn't include and the viewer needs: a PDF can't be shown the way a photo is.
 */
export async function getReceiptFile(receiptId: number, signal?: AbortSignal): Promise<Blob> {
  const response = await send(receiptFileUrl(receiptId), { signal });
  return response.blob();
}
