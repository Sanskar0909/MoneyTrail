import { useCallback, useEffect, useState } from 'react';
import { getReceiptFile } from '../api';

export type ReceiptFile =
  | { status: 'loading' }
  | { status: 'ready'; url: string; contentType: string }
  | { status: 'failed'; message: string };

/**
 * Downloads a receipt's original upload and hands back an object URL for it.
 *
 * Fetched rather than pointed at with `<img src>`, because the viewer has to know the file's type
 * before it can choose how to show it — a PDF can't go in an `<img>` — and only the response says
 * what the type is. The object URL is revoked on unmount; otherwise the file would sit in memory
 * for as long as the tab stays open.
 */
export function useReceiptFile(receiptId: number): { file: ReceiptFile; retry: () => void } {
  const [file, setFile] = useState<ReceiptFile>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let url: string | null = null;

    getReceiptFile(receiptId, controller.signal).then(
      (blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setFile({ status: 'ready', url, contentType: blob.type });
      },
      (cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setFile({
          status: 'failed',
          message: cause instanceof Error ? cause.message : 'Could not load the original.',
        });
      },
    );

    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [receiptId, attempt]);

  const retry = useCallback(() => {
    setFile({ status: 'loading' });
    setAttempt((count) => count + 1);
  }, []);

  return { file, retry };
}
