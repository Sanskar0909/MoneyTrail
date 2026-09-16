import { useCallback, useEffect, useState } from 'react';
import { listReceipts, type Receipt, type ReceiptStatus } from '../api';

interface UseReceiptsResult {
  receipts: Receipt[];
  /** True only for the initial load and manual refreshes, never for background polls. */
  isLoading: boolean;
  /** True while at least one receipt is still moving through the pipeline. */
  isPolling: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const POLL_INTERVAL_MS = 4000;

/** Statuses the pipeline will change on its own. Everything else only changes when a person acts. */
const IN_FLIGHT: ReadonlySet<ReceiptStatus> = new Set(['UPLOADED', 'PROCESSING']);

/**
 * Loads the receipt list on mount and keeps it fresh.
 *
 * Polling is adaptive: it only runs while some receipt is UPLOADED or PROCESSING, and stops the
 * moment the pipeline has nothing left to do, so an idle page makes no requests at all.
 */
export function useReceipts(): UseReceiptsResult {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal, options: { silent?: boolean } = {}) => {
    if (!options.silent) setIsLoading(true);
    try {
      const loaded = await listReceipts(signal);
      if (signal?.aborted) return;
      setReceipts(loaded);
      setError(null);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : 'Could not load receipts.');
    } finally {
      if (!options.silent && !signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const isPolling = receipts.some((receipt) => IN_FLIGHT.has(receipt.status));

  useEffect(() => {
    if (!isPolling) return;

    const controller = new AbortController();
    const poll = () => {
      // A hidden tab gets no updates; it catches up the moment it becomes visible again.
      if (document.hidden) return;
      void load(controller.signal, { silent: true });
    };

    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', poll);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
      controller.abort();
    };
  }, [isPolling, load]);

  const refresh = useCallback(() => load(), [load]);

  return { receipts, isLoading, isPolling, error, refresh };
}
