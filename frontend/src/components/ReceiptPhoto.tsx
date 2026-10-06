import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { receiptFileUrl } from '../api';
import { useReceiptFile } from '../hooks/useReceiptFile';
import { DownloadIcon, ExternalIcon, ZoomInIcon, ZoomOutIcon } from './icons';

/** How many times bigger than "fit to the panel" zooming makes the photo. The loupe uses it too. */
const ZOOM = 2.5;

/** Below this many pixels of movement, a press-and-release on a zoomed photo is a click, not a drag. */
const DRAG_THRESHOLD = 4;

interface Zoom {
  /** The photo's width when zoomed, in CSS pixels. */
  width: number;
  /** The point to centre on, as fractions of the photo's width and height. */
  focusX: number;
  focusY: number;
}

interface Drag {
  x: number;
  y: number;
  scrollLeft: number;
  scrollTop: number;
  moved: boolean;
}

/**
 * The original upload on a dark lightbox, so the paper stands out.
 *
 * Photos get two ways to look closer: a loupe that follows the mouse, and click-to-zoom with
 * scrolling or dragging to look around, which also works by touch and from the keyboard. A PDF
 * goes to the browser's own viewer. A format the browser can't draw — HEIC outside Safari — gets
 * a download link instead of a broken image.
 */
export function ReceiptPhoto({ receiptId }: { receiptId: number }) {
  const { file, retry } = useReceiptFile(receiptId);
  const [cannotDisplay, setCannotDisplay] = useState(false);
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const loupeRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  // After zooming in, scroll so the point that was clicked sits in the middle of the panel.
  // A layout effect, so the jump happens before the browser paints the zoomed photo.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!zoom || !viewport || !image) return;
    viewport.scrollTo({
      left: image.offsetLeft + zoom.focusX * image.offsetWidth - viewport.clientWidth / 2,
      top: image.offsetTop + zoom.focusY * image.offsetHeight - viewport.clientHeight / 2,
    });
  }, [zoom]);

  // Escape backs out of the zoom from anywhere on the page — except a text field, where Escape
  // belongs to the field. Listening on the window means focus doesn't have to be moved to the
  // photo first, which would draw a focus ring around it for a mouse click.
  useEffect(() => {
    if (!zoom) return;
    const fitOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select')) return;
      setZoom(null);
    };
    window.addEventListener('keydown', fitOnEscape);
    return () => window.removeEventListener('keydown', fitOnEscape);
  }, [zoom]);

  const isPhoto = file.status === 'ready' && file.contentType.startsWith('image/') && !cannotDisplay;
  const isPdf = file.status === 'ready' && file.contentType === 'application/pdf';

  function hideLoupe() {
    if (loupeRef.current) loupeRef.current.style.visibility = 'hidden';
  }

  /** Moves the loupe to the pointer and shows the photo under it, magnified. Mouse only. */
  function moveLoupe(event: PointerEvent<HTMLDivElement>) {
    const loupe = loupeRef.current;
    const image = imageRef.current;
    const stage = stageRef.current;
    if (!loupe || !image || !stage || zoom || event.pointerType !== 'mouse') {
      hideLoupe();
      return;
    }

    const photo = image.getBoundingClientRect();
    const x = event.clientX - photo.left;
    const y = event.clientY - photo.top;
    if (x < 0 || y < 0 || x > photo.width || y > photo.height) {
      hideLoupe();
      return;
    }

    // Written straight to the element rather than through state: this runs on every mouse move,
    // and nothing else on the page needs to know where the loupe is.
    const area = stage.getBoundingClientRect();
    const half = loupe.offsetWidth / 2;
    loupe.style.visibility = 'visible';
    loupe.style.transform = `translate(${event.clientX - area.left - half}px, ${event.clientY - area.top - half}px)`;
    loupe.style.backgroundSize = `${photo.width * ZOOM}px ${photo.height * ZOOM}px`;
    loupe.style.backgroundPosition = `${half - x * ZOOM}px ${half - y * ZOOM}px`;
  }

  function zoomInAt(focusX: number, focusY: number) {
    const image = imageRef.current;
    if (!image) return;
    hideLoupe();
    setZoom({ width: image.getBoundingClientRect().width * ZOOM, focusX, focusY });
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!zoom || event.pointerType !== 'mouse' || event.button !== 0) return;
    const viewport = event.currentTarget;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      moved: false,
    };
    viewport.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) {
      moveLoupe(event);
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    event.currentTarget.dataset.dragging = '';
    event.currentTarget.scrollLeft = drag.scrollLeft - dx;
    event.currentTarget.scrollTop = drag.scrollTop - dy;
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    delete event.currentTarget.dataset.dragging;
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    // A drag ends with a click too; it shouldn't also zoom out.
    const dragged = dragRef.current?.moved ?? false;
    dragRef.current = null;
    if (dragged) return;

    if (zoom) {
      setZoom(null);
      return;
    }
    const image = imageRef.current;
    if (!image) return;
    const photo = image.getBoundingClientRect();
    const focusX = (event.clientX - photo.left) / photo.width;
    const focusY = (event.clientY - photo.top) / photo.height;
    // A click on the lightbox around the photo isn't a request to zoom.
    if (focusX < 0 || focusX > 1 || focusY < 0 || focusY > 1) return;
    zoomInAt(focusX, focusY);
  }

  let content: ReactNode;
  if (file.status === 'loading') {
    content = (
      <div className="photo-loading" role="status">
        <span className="photo-loading-paper" aria-hidden="true" />
        <span className="visually-hidden">Loading the photo…</span>
      </div>
    );
  } else if (file.status === 'failed') {
    content = (
      <PhotoMessage title="The photo didn’t load." detail={file.message}>
        <button type="button" className="photo-tool" onClick={retry}>
          Try again
        </button>
      </PhotoMessage>
    );
  } else if (isPdf) {
    content = (
      <object className="photo-pdf" data={file.url} type="application/pdf" aria-label="The original PDF">
        <PhotoMessage title="This browser can’t show the PDF here.">
          <a className="photo-tool" href={receiptFileUrl(receiptId)} target="_blank" rel="noreferrer">
            <ExternalIcon /> Open the PDF
          </a>
        </PhotoMessage>
      </object>
    );
  } else if (isPhoto) {
    content = (
      <>
        <div
          ref={viewportRef}
          className="photo-viewport"
          data-zoomed={zoom ? '' : undefined}
          // Focusable while zoomed, so the arrow keys can scroll it.
          tabIndex={zoom ? 0 : undefined}
          role={zoom ? 'region' : undefined}
          aria-label={zoom ? 'Zoomed photo. Scroll to look around; Escape to fit.' : undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={hideLoupe}
          onClick={handleClick}
        >
          <img
            ref={imageRef}
            className="photo-image"
            src={file.url}
            alt="The original receipt"
            draggable={false}
            style={zoom ? { width: zoom.width, maxWidth: 'none', maxHeight: 'none' } : undefined}
            onError={() => setCannotDisplay(true)}
          />
        </div>
        <div
          ref={loupeRef}
          className="photo-loupe"
          aria-hidden="true"
          style={{ backgroundImage: `url("${file.url}")` }}
        />
      </>
    );
  } else {
    content = (
      <PhotoMessage
        title="This browser can’t display this file."
        detail={file.contentType === 'image/heic' ? 'HEIC photos only show in Safari.' : undefined}
      >
        <a className="photo-tool" href={receiptFileUrl(receiptId)} download>
          <DownloadIcon /> Download the original
        </a>
      </PhotoMessage>
    );
  }

  return (
    <figure className="photo">
      <div ref={stageRef} className="photo-stage">
        {content}
      </div>
      <figcaption className="photo-bar">
        <span className="photo-hint">
          {isPhoto && !zoom && (
            <>
              <span className="photo-hint-mouse">Hover to magnify · click to zoom</span>
              <span className="photo-hint-touch">Tap the photo to zoom</span>
            </>
          )}
          {isPhoto && zoom && (
            <>
              <span className="photo-hint-mouse">Drag or scroll to look around · click to fit</span>
              <span className="photo-hint-touch">Scroll to look around · tap to fit</span>
            </>
          )}
          {isPdf && 'Use the viewer’s own controls to zoom'}
        </span>
        <span className="photo-tools">
          {isPhoto && (
            <button
              type="button"
              className="photo-tool"
              onClick={() => (zoom ? setZoom(null) : zoomInAt(0.5, 0.5))}
            >
              {zoom ? <ZoomOutIcon /> : <ZoomInIcon />}
              {zoom ? 'Fit' : 'Zoom'}
            </button>
          )}
          <a className="photo-tool" href={receiptFileUrl(receiptId)} target="_blank" rel="noreferrer">
            <ExternalIcon /> Original
          </a>
        </span>
      </figcaption>
    </figure>
  );
}

function PhotoMessage({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  return (
    <div className="photo-message">
      <p className="photo-message-title">{title}</p>
      {detail && <p className="photo-message-detail">{detail}</p>}
      {children}
    </div>
  );
}
