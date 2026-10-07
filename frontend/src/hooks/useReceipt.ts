import { useCallback, useEffect, useState } from 'react';
import { ApiError, getReceipt, IN_FLIGHT_STATUSES, type ReceiptDetail } from '../api';

interface UseReceiptResult {
  /** Null until the first load succeeds. */
  receipt: ReceiptDetail | null;
  /** Why the last load failed. Only worth showing while there is no receipt. */
  error: ApiError | null;
  /** Fetches the receipt again. Resolves to the fresh copy, or null if that failed. */
  reload: () => Promise<ReceiptDetail | null>;
  /** Shows a copy the server has just sent back from a save or a confirm, without refetching. */
  replace: (receipt: ReceiptDetail) => void;
}

const POLL_INTERVAL_MS = 2500;

/**
 * Loads one receipt, and keeps checking while the pipeline is still reading it, so the review
 * screen can switch from "reading" to the form by itself. Once the receipt is waiting for a
 * person it stops: nothing else changes it until someone acts.
 */
export function useReceipt(receiptId: number): UseReceiptResult {
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal): Promise<ReceiptDetail | null> => {
      try {
        const loaded = await getReceipt(receiptId, signal);
        if (signal?.aborted) return null;
        setReceipt(loaded);
        setError(null);
        return loaded;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return null;
        setError(cause instanceof ApiError ? cause : new ApiError('Could not load this receipt.', 0));
        return null;
      }
    },
    [receiptId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const isInFlight = receipt !== null && IN_FLIGHT_STATUSES.has(receipt.status);

  useEffect(() => {
    if (!isInFlight) return;

    const controller = new AbortController();
    const poll = () => {
      // A hidden tab gets no updates; it catches up the moment it becomes visible again.
      if (document.hidden) return;
      void load(controller.signal);
    };

    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', poll);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
      controller.abort();
    };
  }, [isInFlight, load]);

  const reload = useCallback(() => load(), [load]);

  return { receipt, error, reload, replace: setReceipt };
}
