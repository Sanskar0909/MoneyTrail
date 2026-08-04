import { useCallback, useEffect, useState } from 'react';
import { listReceipts, type Receipt } from '../api';

interface UseReceiptsResult {
  receipts: Receipt[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Loads the receipt list on mount and exposes a `refresh` for callers to invoke after a change.
 *
 * Once the extraction pipeline exists (Week 2) receipts will change status on their own, and this
 * is where polling would go.
 */
export function useReceipts(): UseReceiptsResult {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const loaded = await listReceipts(signal);
      if (signal?.aborted) return;
      setReceipts(loaded);
      setError(null);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : 'Could not load receipts.');
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(() => load(), [load]);

  return { receipts, isLoading, error, refresh };
}
