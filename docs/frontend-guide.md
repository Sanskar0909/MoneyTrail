# MoneyTrail Frontend — A Complete Walkthrough

This document explains every file in `frontend/src`, what each concept means, and *why* the code is written the way it is. It assumes you know Java well and React/TypeScript barely at all, so it defines things as it goes.

---

## Table of contents

1. [The big picture](#1-the-big-picture)
2. [How the browser reaches your backend](#2-how-the-browser-reaches-your-backend)
3. [React fundamentals, defined](#3-react-fundamentals-defined)
4. [TypeScript fundamentals, defined](#4-typescript-fundamentals-defined)
5. [File walkthrough: `api.ts`](#5-file-walkthrough-apits)
6. [File walkthrough: `format.ts`](#6-file-walkthrough-formatts)
7. [File walkthrough: `hooks/useReceipts.ts`](#7-file-walkthrough-hooksusereceiptsts)
8. [File walkthrough: `components/UploadPanel.tsx`](#8-file-walkthrough-componentsuploadpaneltsx)
9. [File walkthrough: `components/ReceiptList.tsx`](#9-file-walkthrough-componentsreceiptlisttsx)
10. [File walkthrough: `components/StatusBadge.tsx`](#10-file-walkthrough-componentsstatusbadgetsx)
11. [File walkthrough: `App.tsx` and `main.tsx`](#11-file-walkthrough-apptsx-and-maintsx)
12. [The CSS approach](#12-the-css-approach)
13. [Accessibility, and why it's in there](#13-accessibility-and-why-its-in-there)
14. [What was deliberately *not* done](#14-what-was-deliberately-not-done)

---

## 1. The big picture

### File map

```
frontend/
├── vite.config.ts              dev server config + /api proxy to Spring Boot
├── index.html                  the single HTML page the browser loads
└── src/
    ├── main.tsx                entry point: mounts React into the page
    ├── App.tsx                 top-level layout; wires the pieces together
    ├── api.ts                  ALL HTTP lives here. Types + fetch functions.
    ├── format.ts               pure display helpers (money, dates, bytes)
    ├── hooks/
    │   └── useReceipts.ts      reusable stateful logic for loading the list
    └── components/
        ├── UploadPanel.tsx     drag-and-drop / click to upload
        ├── ReceiptList.tsx     the table of receipts
        └── StatusBadge.tsx     the coloured status pill
```

### The layering, in terms you already know

The backend has `Controller → Service → Repository`. The frontend has an equivalent, and it's worth seeing the parallel:

| Backend layer | Frontend equivalent | Job |
|---|---|---|
| `ReceiptController` | `App.tsx`, components | Presentation. Renders things, handles user events. |
| `ReceiptService` | `hooks/useReceipts.ts` | Stateful logic — loading, refreshing, error handling. |
| `ReceiptRepository` | `api.ts` | Talks to the outside world. The only file that knows HTTP exists. |
| — | `format.ts` | Pure functions. No state, no I/O. Trivially testable. |

**The rule that keeps it honest:** no component ever calls `fetch`. If you wanted to swap `fetch` for something else, or point at a different backend, `api.ts` is the only file that changes. Same reasoning as `ReceiptExtractionClient` being an interface on the backend — one seam, one place to change.

### Data flow, end to end

```
user drops a file on the dropzone
        ↓
UploadPanel.upload(file)
        ↓  local validation (size, type) — fast feedback only
uploadReceipt(file)              [api.ts]
        ↓  POST /api/receipts, multipart body
Vite dev server proxy → http://localhost:8080
        ↓
ReceiptController → ReceiptService → MinIO + Postgres
        ↓  201 + ReceiptResponse JSON
UploadPanel calls onUploaded(receipt)
        ↓
App.tsx calls refresh()
        ↓
useReceipts → listReceipts() → GET /api/receipts
        ↓
setReceipts(...) → React re-renders → ReceiptList shows the new row
```

Notice the last part: after a successful upload, the panel does **not** insert the new receipt into the list itself. It asks the list to **refetch**. That's deliberate — once the pipeline exists (Week 2), a receipt's status changes on the *server* without the browser knowing. Refetching is the only thing that stays correct; locally-patched state would drift.

---

## 2. How the browser reaches your backend

Your React app runs on `http://localhost:5173` (the Vite dev server). Your Spring Boot app runs on `http://localhost:8080`. These are **different origins**, and browsers block cross-origin requests by default — a security rule called the **same-origin policy**. Without it, any website you visited could silently make requests to your bank's API using your cookies.

There are two ways around it:

1. **CORS** — the server sends `Access-Control-Allow-Origin` headers saying "this origin is allowed." Requires backend configuration.
2. **A proxy** — the dev server forwards certain paths to the backend, so from the browser's perspective everything comes from one origin.

We use the proxy, configured in `vite.config.ts`:

```ts
server: {
  proxy: {
    '/api': 'http://localhost:8080',
  },
}
```

So when `api.ts` calls `fetch('/api/receipts')`:
- the browser sends it to `localhost:5173/api/receipts` (same origin — no CORS involved)
- Vite intercepts anything starting with `/api` and forwards it to `localhost:8080/api/receipts`
- the response comes back through Vite

**Why this matters beyond dev:** in production you build the React app to static files (`npm run build` → `dist/`) and serve them from the same origin as the API, usually behind nginx or Caddy. Then there's no proxy and no CORS, because everything genuinely *is* one origin. The proxy exists purely to make dev look like prod.

**The practical consequence for you:** the URLs in `api.ts` are relative (`/api/receipts`, not `http://localhost:8080/api/receipts`). That's why the same code works in dev and in production without a config change.

---

## 3. React fundamentals, defined

### Component

A **component** is a function that returns a description of UI. That's the whole idea.

```tsx
export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className="badge">{status}</span>;
}
```

Rules:
- The name **must** start with a capital letter. React uses this to tell your components apart from HTML tags — `<span>` is a DOM element, `<StatusBadge>` is your component. Lowercase means React looks for an HTML tag of that name and you get nothing.
- It returns JSX (see below).
- It must be **pure** with respect to its inputs: same props in → same output out, no side effects during rendering.

Loosely, a component is like a method that returns a rendered fragment — except React calls it again whenever its data changes.

### JSX

**JSX** is the HTML-looking syntax inside `.tsx` files. It isn't HTML and it isn't a string — it's syntax sugar that compiles to function calls. This:

```tsx
<span className="badge">{status}</span>
```

compiles to roughly:

```js
jsx('span', { className: 'badge', children: status })
```

which produces a plain JavaScript object describing what should be on screen. React compares those objects between renders and updates only the DOM nodes that actually changed.

Things that trip people up:

- **`className`, not `class`** — `class` is a reserved word in JavaScript.
- **`htmlFor`, not `for`** — same reason.
- **`{ }` embeds an expression.** `{status}` inserts a value. `{isUploading ? 'Uploading…' : 'Drop a file'}` inserts the result of an expression. You can put any expression in there, but *not* a statement — no `if`, no `for`. That's why conditionals in JSX use ternaries and `&&`.
- **Attributes take real values, not just strings.** `disabled={isUploading}` passes an actual boolean.

### Props

**Props** are the inputs to a component — the equivalent of method parameters. They are **read-only**: a component never modifies its own props.

```tsx
interface UploadPanelProps {
  onUploaded: (receipt: Receipt) => void;
}

export function UploadPanel({ onUploaded }: UploadPanelProps) { ... }
```

Two things are happening in that signature:

1. `UploadPanelProps` declares the shape — this component requires an `onUploaded` property which is a function taking a `Receipt` and returning nothing.
2. `{ onUploaded }` is **destructuring**: pull the `onUploaded` property out of the props object into a local variable. Without it you'd write `props.onUploaded` everywhere.

Note that `onUploaded` is a *function passed down as a prop*. This is how a child talks back up to its parent — the parent decides what happens, the child just says "it happened." In `App.tsx`:

```tsx
<UploadPanel onUploaded={() => void refresh()} />
```

The panel doesn't know or care that the list refreshes. It announces the event; `App` decides the consequence. That's the same decoupling as an interface parameter in Java.

### State, and re-rendering

**State** is data that, when it changes, should cause the UI to update.

```tsx
const [isUploading, setIsUploading] = useState(false);
```

This is **array destructuring** — `useState` returns a two-element array and we name the elements. `isUploading` is the current value; `setIsUploading` is the only legitimate way to change it.

**What happens when you call `setIsUploading(true)`:**

1. React marks this component as needing an update.
2. React **calls your component function again from the top**.
3. This time, `useState(false)` returns `true` instead of `false` (React remembers).
4. The function returns new JSX.
5. React diffs it against the previous JSX and updates only the DOM that changed.

This is the mental model that matters most, and it's genuinely different from Java UI code: **your component function runs many times.** Every render is a fresh execution with fresh local variables. `const [error, setError] = useState(null)` doesn't create new state each time — `useState` looks up the value React is holding for this component.

**You must never mutate state directly.** `isUploading = true` does nothing useful: React doesn't know, no re-render happens, and the next render overwrites it anyway.

### Hooks

A **hook** is a function whose name starts with `use` that lets a component tap into React features. `useState`, `useEffect`, `useRef`, `useCallback`, `useId` are built in; `useReceipts` is one we wrote.

**The Rules of Hooks**, which are not style advice but hard requirements:

1. **Only call hooks at the top level of a component or another hook.** Never inside `if`, loops, or nested functions.
2. **Only call hooks from React functions** — components, or other hooks.

The reason is mechanical: React tracks hooks *by call order*. First `useState` in this component is slot 0, second is slot 1, and so on. If a conditional caused you to skip one on a later render, every subsequent hook would read the wrong slot and you'd get bizarre bugs. Constant order per render is what makes the whole scheme work.

### `useEffect` — side effects and cleanup

Rendering must be pure, so anything with a side effect (network calls, timers, subscriptions) goes in `useEffect`. It runs **after** React has updated the DOM.

```tsx
useEffect(() => {
  const controller = new AbortController();
  void load(controller.signal);
  return () => controller.abort();   // ← cleanup
}, [load]);
```

Three parts:

- **The effect function** — what to do.
- **The returned function** (optional) — **cleanup**. React calls it before the effect runs again, and when the component unmounts. This is where you cancel, unsubscribe, clear timers. Skipping cleanup is the classic source of memory leaks.
- **The dependency array** `[load]` — React re-runs the effect only when one of these values changes between renders. `[]` means "run once on mount." Omitting the array entirely means "run after *every* render," which is almost always a bug.

### `useRef` — a box that survives renders

```tsx
const inputRef = useRef<HTMLInputElement>(null);
```

`useRef` returns an object `{ current: value }` that persists across renders. Two differences from state:

- **Mutating it does not trigger a re-render.**
- Reading or writing `.current` during render is discouraged; it's for values you need *outside* the render flow.

The most common use, and ours, is getting a handle on a real DOM node. `ref={inputRef}` tells React "after you create this `<input>`, put it in `inputRef.current`." Then we can call browser APIs on it directly:

```tsx
if (inputRef.current) inputRef.current.value = '';
```

Why we need that: file inputs are **uncontrolled**. React can't set a file input's value (that would let a website silently attach files to a form — a security hole), so the browser owns it. If you upload `receipt.jpg`, then pick `receipt.jpg` again, the input's value hasn't *changed*, so no `change` event fires and nothing happens. Clearing it manually makes re-selecting the same file work.

### `useCallback` — stable function identity

```tsx
const load = useCallback(async (signal?: AbortSignal) => { ... }, []);
```

Every render creates brand-new function objects. Normally harmless — but `load` is in `useEffect`'s dependency array. A new `load` on every render would mean a *new dependency* on every render, so the effect would re-run every render, which fetches, which sets state, which re-renders... an infinite loop.

`useCallback` returns the *same* function object across renders as long as its own dependencies (`[]` here — none) haven't changed. Now the effect's dependency is stable and it runs once.

**Rule of thumb:** you need `useCallback` when a function goes into a dependency array or is passed to a memoized child. Otherwise it's noise.

### `useId` — stable unique identifiers

```tsx
const inputId = useId();
```

Generates an ID unique to this component instance. Used to link a `<label>` to its `<input>` via `htmlFor`/`id`. Hardcoding `id="file-input"` would break if the component ever appeared twice on a page — duplicate IDs are invalid HTML and the label would point at the wrong input.

### Rendering a list, and `key`

```tsx
{receipts.map((receipt) => (
  <tr key={receipt.id}>...</tr>
))}
```

`.map()` transforms an array of data into an array of JSX elements. React renders arrays of elements directly.

**`key` is required and matters.** When the list changes, React uses keys to figure out which items are the same across renders — so it can move a row instead of destroying and rebuilding it. Use a stable, unique ID from your data. **Never use the array index** if the list can reorder or have items removed: React would think item 0 is "the same item" even when a completely different receipt now occupies that position, and any state attached to that row would jump to the wrong one.

### Conditional rendering

Two idioms, both used here:

```tsx
{error && <p className="feedback-error">{error}</p>}
```
`&&` short-circuits: if `error` is `null`, the expression is `null` and React renders nothing. If it's a string, it renders the element.

> **A trap worth knowing:** this works with `null`/`undefined`/`false`, but **not with `0`**. `{count && <p>…</p>}` renders a literal `0` when the count is zero, because `0` is falsy but still a renderable value. Use `{count > 0 && …}`. In `ReceiptList` we wrote `receipts.length > 0 &&` for exactly this reason.

```tsx
{isUploading ? 'Uploading…' : 'Drop a receipt here'}
```
Ternary, when you need an either/or.

---

## 4. TypeScript fundamentals, defined

TypeScript is JavaScript plus a type system. The types are **erased at build time** — the browser runs plain JavaScript. Types catch mistakes while you write; they enforce nothing at runtime. This is the single most important thing to internalise: unlike Java, **there are no runtime type checks**. If the server sends you a string where you declared a number, TypeScript never notices.

### `interface` vs `type`

```ts
export interface Receipt { id: number; status: ReceiptStatus; ... }
export type ReceiptStatus = 'UPLOADED' | 'PROCESSING' | ...;
```

`interface` describes the shape of an object. `type` gives a name to *any* type, including ones that aren't objects (unions, primitives, functions). Convention used here: `interface` for object shapes, `type` for everything else.

### Union types and literal types

```ts
type ReceiptStatus = 'UPLOADED' | 'PROCESSING' | 'FAILED';
```

`|` means "one of these." `'UPLOADED'` here isn't the *type* string — it's a **literal type**, meaning the only permitted value is exactly that string. This is TypeScript's closest thing to a Java enum, and it's genuinely useful: assigning `'uploaded'` (wrong case) is a compile error.

```ts
merchantName: string | null;
```
A union with `null` is how you say "this may be absent." TypeScript then *forces* you to handle the null case before using the value — that's `strictNullChecks`, and it's why `receipt.merchantName ?? '—'` exists rather than a possible crash.

### `as const` and indexed access

```ts
export const RECEIPT_STATUSES = ['UPLOADED', 'PROCESSING', ...] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];
```

Line by line:

- Without `as const`, TypeScript infers `string[]` — it assumes you might push other strings later.
- `as const` says "this is deeply immutable" — the inferred type becomes `readonly ['UPLOADED', 'PROCESSING', ...]`, a tuple of literal types.
- `typeof RECEIPT_STATUSES` takes the *type* of that value.
- `[number]` is an **indexed access type**: "the type you get when indexing with a number" — i.e. the union of all element types.

Result: `'UPLOADED' | 'PROCESSING' | ...`, derived automatically. Add a status to the array and the type updates itself. Declaring the array and the union separately would let them drift apart silently — this makes drift impossible.

### `Record<K, V>`

```ts
const LABELS: Record<ReceiptStatus, string> = { UPLOADED: 'Uploaded', ... };
```

`Record<K, V>` is an object type with keys `K` and values `V`. Because `K` is the full `ReceiptStatus` union, **TypeScript requires every status to have an entry.** Add `REFUNDED` to the enum and forget the label → compile error. That's exhaustiveness checking for free, and it's why `StatusBadge` can't silently render a blank.

### Generics

```ts
async function parseResponse<T>(response: Response): Promise<T>
```

`<T>` is a type parameter — same idea as Java generics. The caller decides what `T` is:

```ts
request<Receipt[]>('/api/receipts')   // T = Receipt[]
```

so the return type is `Promise<Receipt[]>` and everything downstream is properly typed.

### `unknown` vs `any` — the important one

`any` disables typechecking entirely. Anything typed `any` can be used any way at all, with no errors. It's contagious and it's how TypeScript codebases quietly rot.

`unknown` is the safe counterpart: "I don't know what this is, and you must prove what it is before using it."

```ts
const body: unknown = await response.json();
if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
  message = body.message;   // ← only here does TS know it's a string
}
```

`response.json()` returns `any` by default (its actual runtime value could be anything). We deliberately annotate it `unknown` to force ourselves through the checks. Each condition **narrows** the type:

- `body &&` — rules out `null`/`undefined`
- `typeof body === 'object'` — narrows to object
- `'message' in body` — proves the property exists
- `typeof body.message === 'string'` — proves its type

After all four, TypeScript knows `body.message` is a `string`. This is called **narrowing** or **control-flow analysis**, and it's TypeScript's best feature.

**Why bother?** Because the server is a separate program. It could return an HTML error page from a proxy, or a differently-shaped body after a refactor. These checks are the boundary where untrusted data becomes trusted data.

### Type guards

The wart mentioned earlier:

```ts
ACCEPTED_CONTENT_TYPES.includes(file.type as (typeof ACCEPTED_CONTENT_TYPES)[number])
```

`includes` on a readonly literal tuple only accepts *members of that tuple*, but `file.type` is a plain `string`. Asking "is this arbitrary string one of ours?" therefore needs a cast. The clean version quarantines it:

```ts
function isAcceptedType(value: string): value is (typeof ACCEPTED_CONTENT_TYPES)[number] {
  return (ACCEPTED_CONTENT_TYPES as readonly string[]).includes(value);
}
```

`value is X` is a **type predicate**. It tells the compiler "if this returns true, treat the argument as `X` from here on." Same runtime behaviour, but the unsafe cast lives in one named, reviewable place instead of inline in business logic.

### Optional chaining and nullish coalescing

```ts
event.target.files?.[0]      // optional chaining
receipt.merchantName ?? '—'  // nullish coalescing
```

- `?.` — if the thing on the left is `null`/`undefined`, stop and produce `undefined` instead of throwing. `files?.[0]` means "if `files` exists, index it."
- `??` — use the right side only if the left is `null` or `undefined`. Different from `||`, which also triggers on `0`, `''`, and `false`. For a value that could legitimately be `0` or empty string, `??` is the correct one.

### Type-only imports

```ts
import { useId, type ChangeEvent } from 'react';
```

`type` marks an import used only in type positions. The bundler erases it rather than emitting a runtime import. Keeps bundles smaller and makes the intent explicit.

### `void` before a promise

```tsx
if (file) void upload(file);
```

`upload` is `async`, so it returns a `Promise`. We're deliberately not awaiting it — this is an event handler, it can't block. The `void` operator explicitly says "I know this returns a promise and I'm intentionally ignoring it," which stops linters flagging a *floating promise* (an unhandled async call, usually a bug). The errors are handled *inside* `upload` via try/catch, so nothing is actually unhandled.

---

## 5. File walkthrough: `api.ts`

**Job:** the only file that knows HTTP exists. Types mirroring the server's DTO, plus one function per endpoint.

### The types

```ts
export interface Receipt {
  id: number;
  status: ReceiptStatus;
  originalFilename: string;
  merchantName: string | null;
  receiptDate: string | null;
  totalAmount: number | null;
  currency: string;
  uploadedAt: string;
}
```

This mirrors `ReceiptResponse.java` field for field. Notes on the type choices:

- **`merchantName`, `receiptDate`, `totalAmount` are nullable** because extraction hasn't run yet. The type documents the lifecycle: a freshly uploaded receipt genuinely has no merchant.
- **`receiptDate` is `string`, not `Date`.** JSON has no date type. Jackson serialises `LocalDate` as `"2026-08-04"`. It stays a string until something formats it.
- **`uploadedAt` is a string** for the same reason — an ISO instant like `"2026-08-04T18:03:14.203964Z"`.
- **`totalAmount` is `number`** because Jackson serialises `BigDecimal` as a JSON number.

> **Worth knowing for later:** JavaScript numbers are IEEE-754 doubles — the exact thing we avoided on the backend by choosing `BigDecimal`. For *displaying* one receipt total this is fine. If you ever sum money in the browser, don't; compute totals server-side in SQL where they're exact. This is a real constraint, not a theoretical one.

### `ApiError`

```ts
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
```

A custom exception type carrying the HTTP status. Why bother instead of throwing a plain `Error`? Because callers may eventually want to treat a `415` (user picked a bad file) differently from a `500` (server broke) or `0` (network unreachable). Right now everything renders the same way, but the information is preserved rather than flattened into a string.

`readonly` means the field can't be reassigned after construction — the equivalent of `final`.

### `parseResponse`

```ts
async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  ...
  throw new ApiError(message, response.status);
}
```

**A critical `fetch` gotcha:** `fetch` does **not** throw on HTTP error statuses. A `404` or `500` is a perfectly successful *network* operation — the promise resolves normally. Only network-level failures (DNS, connection refused, CORS) reject.

That surprises everyone once. `response.ok` (true for 200–299) is what you actually check. Without it, a `415` would fall through as if it succeeded and you'd try to read a receipt out of an error body.

The error path then tries to extract `message` from the body — matching what `GlobalExceptionHandler` returns — and falls back to status text if the body isn't JSON (a proxy error page, say). Because the server owns the wording, your validation messages live in exactly one place.

### `request`

```ts
try {
  response = await fetch(input, init);
} catch (cause) {
  if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
  throw new ApiError('Could not reach the server. Is the backend running?', 0);
}
```

Wraps genuine network failures so callers only ever handle `ApiError`. Status `0` is the convention for "no HTTP response happened at all."

The `AbortError` re-throw matters: when *we* cancel a request deliberately (component unmounted), that's not an error to show the user. It's rethrown unchanged so the caller can recognise and ignore it.

### `uploadReceipt`

```ts
const formData = new FormData();
formData.append('file', file);
return request<Receipt>('/api/receipts', { method: 'POST', body: formData, signal });
```

**`FormData`** builds a `multipart/form-data` request body — the format for file uploads. The key `'file'` must match `@RequestParam("file")` in your controller. If they disagree you get a `400` and a confusing message; it's a common first bug.

**Note we never set `Content-Type`.** Multipart requires a boundary parameter (`multipart/form-data; boundary=----WebKit...`) that the browser generates. If you set the header manually you omit the boundary and the server can't parse the body. Passing `FormData` as the body and leaving headers alone is correct.

---

## 6. File walkthrough: `format.ts`

Pure functions, no state, no I/O — the easiest code in the project to test, which is why it's separated out.

```ts
export function formatMoney(amount: number | null, currency: string): string {
  if (amount === null) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
```

**`Intl`** is the browser's built-in internationalisation API. `Intl.NumberFormat` with `style: 'currency'` renders `1234.5` as `₹1,234.50` — correct symbol, correct grouping (Indian grouping is `1,23,456`, not `123,456`), correct decimal places per currency.

Passing `undefined` as the locale means "use the browser's locale." Explicit `'en-IN'` would force Indian formatting regardless of who's looking.

The `try/catch` guards against an unknown currency code throwing a `RangeError`. Defensive, because currency arrives from the database and a typo shouldn't blank the whole table.

`formatDate` parses `"2026-08-04"` by appending `T00:00:00` first. Without that, `new Date("2026-08-04")` is parsed as **UTC midnight**, which in India (UTC+5:30) is still the 4th — but for anyone west of UTC it renders as the *previous day*. Appending the time forces local-time interpretation. A classic off-by-one-day bug.

---

## 7. File walkthrough: `hooks/useReceipts.ts`

A **custom hook** — a function starting with `use` that calls other hooks. It exists to bundle related stateful logic so components stay about presentation.

```ts
export function useReceipts(): UseReceiptsResult {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
```

Three pieces of state. Note `isLoading` starts `true` — the effect fires immediately on mount, so the very first render is genuinely a loading state. Starting `false` would flash "No receipts yet" for a frame before data arrived.

```ts
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
```

The abort checks matter more than they look. **`AbortController`** is the browser's cancellation mechanism: you create one, pass its `.signal` to `fetch`, and calling `.abort()` cancels the request.

Why we need it here: if the component unmounts while a request is in flight, and the response then arrives and calls `setReceipts`, you'd be setting state on a component that no longer exists. Harmless in React 19 but pointless work, and in the general case it's how you leak memory and get stale data overwriting fresh data.

This is **not** hypothetical in development. React's **StrictMode** (see `main.tsx`) deliberately mounts every component, unmounts it, and mounts it again — specifically to surface missing cleanup. Without the `AbortController` you'd see two requests and a warning. With it, the first is cancelled cleanly.

```ts
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
```

Load on mount; cancel on unmount. `[load]` is stable thanks to `useCallback`, so this runs once.

```ts
  return { receipts, isLoading, error, refresh };
```

Returns an object rather than an array, so callers destructure by name in any order. (`useState` returns an array precisely because you rename both elements constantly; here the names are fixed, so an object is clearer.)

---

## 8. File walkthrough: `components/UploadPanel.tsx`

The most involved component. Four pieces of state:

```tsx
const [isUploading, setIsUploading] = useState(false);      // request in flight
const [isDraggingOver, setIsDraggingOver] = useState(false); // dropzone highlight
const [error, setError] = useState<string | null>(null);     // failure message
const [uploadedName, setUploadedName] = useState<string | null>(null); // success message
```

### Local validation

```ts
function findLocalProblem(file: File): string | null
```

Returns a message, or `null` if the file is fine. Note it's a **plain function outside the component** — it doesn't touch state or props, so there's no reason for it to be re-created on every render.

Three checks: empty, too large, wrong type. And a deliberate hole:

```ts
if (file.type && !ACCEPTED_CONTENT_TYPES.includes(...))
```

`file.type &&` means: only check the type **if the browser reported one**. Browsers frequently report an empty string for `.heic` files. Rejecting on empty type would block valid iPhone photos — exactly the files this app is for. So we let it through and let the server decide.

This is the general principle: **client-side validation is a UX convenience, never a security boundary.** Anyone can open devtools and POST whatever they like. The server validates independently, and that check is the real one. The client check exists only so the user gets an instant "that's too big" instead of waiting for a 15MB upload to fail.

### The upload flow

```ts
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
  if (inputRef.current) inputRef.current.value = '';
}
```

Clear previous messages before starting, so a new attempt doesn't display the last one's outcome. `finally` guarantees the busy flag is cleared and the input reset on both paths — same guarantee as Java's `finally`.

`cause instanceof Error ? cause.message : '…'` is necessary because **JavaScript lets you throw anything** — a string, a number, `undefined`. `catch` bindings are therefore typed `unknown`, and you must narrow before touching `.message`.

### The dropzone markup

```tsx
<label htmlFor={inputId} className="dropzone" onDrop={handleDrop} ...>
  <input ref={inputRef} id={inputId} className="visually-hidden" type="file" ... />
  <span>Drop a receipt here, or click to choose</span>
</label>
```

The structure is doing real work:

- **A `<label>` wraps everything.** Clicking a label activates its associated input, so the whole area is clickable without a single line of JavaScript.
- **The `<input>` is `visually-hidden`, not `display: none`.** The CSS class clips it to a 1×1 pixel while keeping it in the accessibility tree and focusable. `display: none` would remove it entirely — no keyboard focus, invisible to screen readers, and the label would do nothing.
- **`htmlFor={inputId}` / `id={inputId}`** is the association. Without it there's no link and clicking does nothing.

Result: works with mouse (click), keyboard (Tab to focus, Space to open the picker), drag-and-drop, and screen readers — from ordinary HTML semantics rather than custom event handling.

### Drag events

```tsx
onDragOver={(event) => { event.preventDefault(); setIsDraggingOver(true); }}
onDragLeave={() => setIsDraggingOver(false)}
onDrop={handleDrop}
```

**`event.preventDefault()` in `onDragOver` is mandatory.** The browser's default is to *reject* drops. Without it, `onDrop` never fires — you drag a file over, release, and the browser navigates away to display the image instead. The single most common drag-and-drop bug.

`handleDrop` also calls `preventDefault()` for the same reason, then reads `event.dataTransfer.files[0]` — the **`DataTransfer`** object carries the dragged payload.

### Data attributes as styling hooks

```tsx
data-dragging={isDraggingOver || undefined}
```

Rather than string-concatenating class names, state is exposed as a **data attribute** and CSS targets it:

```css
.dropzone[data-dragging] { border-color: var(--accent); }
```

`|| undefined` matters: React **omits** an attribute whose value is `undefined`, but `data-dragging="false"` would still be *present* in the DOM, and `[data-dragging]` matches on presence regardless of value. So `false` would style as if you were dragging. Converting to `undefined` removes the attribute entirely.

### Live regions

```tsx
<p className="feedback" role="status" aria-live="polite">
```

`aria-live` tells screen readers to announce changes to this element even though focus is elsewhere. `polite` waits for a pause; `assertive` interrupts. The error uses `role="alert"`, which is implicitly assertive — an error is worth interrupting for; a success message isn't.

Without this, a blind user clicks upload and gets total silence.

---

## 9. File walkthrough: `components/ReceiptList.tsx`

A **presentational component**: it owns no state. Everything arrives as props and it renders.

```tsx
interface ReceiptListProps {
  receipts: Receipt[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}
```

This is worth doing deliberately. Because it has no state and no I/O, it's trivial to reason about and to test — render it with an array, assert what appears. The stateful part lives in `useReceipts`; the fetching lives in `api.ts`. Each piece does one thing.

### Rendering states

Four distinct cases, and getting them all right is most of what "polished" means:

```tsx
{error && <p role="alert">{error}</p>}
{!error && receipts.length === 0 && !isLoading && <p>No receipts yet…</p>}
{receipts.length > 0 && <table>…</table>}
```

- **Error** → show it, don't pretend
- **Empty and settled** → "No receipts yet" (note `!isLoading`, so it doesn't flash before the first response)
- **Has data** → the table
- **Loading with existing data** → keep showing the table, just label the button "Refreshing…" rather than blanking the screen

### Table semantics

```tsx
<th scope="col">Merchant</th>
```

`scope="col"` tells assistive technology this header describes a column. Screen readers then announce "Merchant: Starbucks" when navigating cells, instead of reading disconnected values.

```tsx
<td className="numeric">{formatMoney(receipt.totalAmount, receipt.currency)}</td>
```

Numbers are right-aligned with `font-variant-numeric: tabular-nums` in CSS, which forces every digit to the same width so decimal points line up in a column. Proportional digits make numeric columns look ragged.

```tsx
<td className="filename" title={receipt.originalFilename}>
```

The filename is truncated with CSS ellipsis; `title` gives the full name on hover.

---

## 10. File walkthrough: `components/StatusBadge.tsx`

The smallest file, and it illustrates the exhaustiveness idea:

```tsx
const LABELS: Record<ReceiptStatus, string> = {
  UPLOADED: 'Uploaded',
  ...
  FAILED: 'Failed',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className="badge" data-status={status}>{LABELS[status]}</span>;
}
```

Two things:

1. **`Record<ReceiptStatus, string>` enforces completeness.** Add a status to the union and this file stops compiling until you add a label. The compiler tells you every place that needs updating — the thing you actually want from a type system.

2. **Colour lives in CSS, keyed on `data-status`.** The component emits the raw status; the stylesheet decides what red means:

```css
.badge[data-status='FAILED'] { background: var(--danger-soft); color: var(--danger); }
```

Presentation stays in the stylesheet. Changing the palette never touches TypeScript.

Also note the raw enum values (`NEEDS_REVIEW`) never reach the user — `LABELS` maps them to "Needs review". Screaming snake case is a database detail.

---

## 11. File walkthrough: `App.tsx` and `main.tsx`

### `main.tsx` — the entry point

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- `index.html` contains a single `<div id="root">`. React owns everything inside it.
- `createRoot(...)` creates a React root; `.render(...)` mounts your tree.
- The `!` is TypeScript's **non-null assertion**: `getElementById` returns `HTMLElement | null`, and we assert it's there. Justified because we control the HTML — but it's a promise to the compiler, not a runtime check.
- **`<StrictMode>`** is a development-only wrapper that intentionally double-invokes components and effects to surface bugs (missing cleanup, impure renders). It does nothing in production builds. If you see two network requests in dev and one in prod, this is why — it's a feature.

### `App.tsx` — composition

```tsx
export default function App() {
  const { receipts, isLoading, error, refresh } = useReceipts();

  return (
    <div className="app">
      <header className="app-header">…</header>
      <main className="app-main">
        <UploadPanel onUploaded={() => void refresh()} />
        <ReceiptList receipts={receipts} isLoading={isLoading} error={error} onRefresh={() => void refresh()} />
      </main>
    </div>
  );
}
```

`App` holds no state of its own and renders almost no markup. It **composes**: calls the hook, distributes results, connects the panel's "I uploaded something" event to the list's refresh.

This is where **state lives at the lowest common ancestor** of the components that need it. `UploadPanel` triggers a refresh; `ReceiptList` displays the result; neither knows about the other. `App` is the only place that knows they're connected — so `UploadPanel` remains reusable anywhere, and `ReceiptList` can be rendered with test data.

`export default` (rather than a named export) is only because `main.tsx` imports it as a default. Everything else uses named exports — with a named export a typo in the import is a compile error, whereas a default import silently accepts any name.

---

## 12. The CSS approach

No framework, no Tailwind, no CSS-in-JS. Two stylesheets and custom properties.

### Custom properties (CSS variables)

```css
:root {
  --bg: #f7f7f8;
  --surface: #ffffff;
  --text: #1a1a1f;
  --accent: #3b5bdb;
}
```

`:root` is the `<html>` element. Variables defined there are inherited everywhere and used as `var(--accent)`. One palette, referenced throughout.

### Dark mode

```css
@media (prefers-color-scheme: dark) {
  :root { --bg: #131316; --surface: #1c1c21; --text: #ececf1; }
}
```

`prefers-color-scheme` reads the OS setting. Because every rule uses `var(--…)` rather than hardcoded colours, **redefining the variables re-themes the entire app** — there isn't a single dark-mode override on a component rule. That's the whole payoff for using variables.

### `color-mix`

```css
background: color-mix(in srgb, #2f9e44 16%, transparent);
```

Mixes 16% green with transparent — a tinted background derived from the same colour as the text, without hand-picking a second hex value. Modern CSS; works in current browsers.

### Layout

Flexbox throughout (`display: flex`), which handles everything here. No grid needed for a single-column page.

```css
.table-scroll { overflow-x: auto; }
```

The table scrolls horizontally inside its own container on narrow screens, rather than forcing the whole page to scroll sideways. Small detail, big difference on a phone.

---

## 13. Accessibility, and why it's in there

Not box-ticking — most of it is the same work that makes the UI good for everyone.

| What | Why |
|---|---|
| `<label htmlFor>` + real `<input>` | Click target, keyboard focus, screen reader announcement — free from correct HTML |
| `visually-hidden` instead of `display: none` | Keeps the input focusable and announced while invisible |
| `aria-live="polite"` on the status line | Upload results are announced instead of silently appearing |
| `role="alert"` on errors | Interrupts to announce a failure |
| `<th scope="col">` | Cells are announced with their column name |
| `:focus-visible` outline | Keyboard users can see where they are; mouse users don't get an outline on click |
| `aria-labelledby` on sections | Each region has an accessible name, so users can navigate by landmark |

The rule of thumb: **use the right HTML element and most of this comes free.** The ARIA attributes here are filling small gaps, not replacing semantics. A `<div>` with an `onClick` would have needed a `role`, a `tabIndex`, and manual keyboard handling to reach the same place a `<label>` gets to for nothing.

---

## 14. What was deliberately *not* done

Worth knowing what's missing and why, so you can judge when it stops being the right call.

- **No state library (Redux, Zustand).** One screen, one list. `useState` in a custom hook is enough. Add one when prop-drilling becomes painful, not before.
- **No data-fetching library (TanStack Query, SWR).** Those handle caching, deduplication, retries, and polling — genuinely valuable once you have several screens sharing data. With one endpoint it's a dependency for no gain. **This is worth revisiting in Week 2**, when statuses change server-side and you'll want polling with background refetch.
- **No router.** One page. Week 3 adds the review queue, and that's when a router earns its place.
- **No component library (MUI, shadcn).** The plan says minimal UI effort; hand-written CSS for four components is less code than configuring a design system.
- **No tests.** The most testable pieces are already isolated (`format.ts` is pure; `ReceiptList` is presentational) — the structure is test-ready even though the tests aren't written. If you add any, start with `format.ts`.
- **No optimistic updates.** The list refetches after upload rather than immediately showing the new row. Refetching is simpler and always correct; optimistic updates need rollback logic on failure. Not worth it when the request takes 50ms.

---

## Quick reference

```bash
cd frontend

npm run dev      # dev server on :5173 with hot reload and the /api proxy
npm run build    # typecheck (tsc -b) + production build into dist/
npm run lint     # oxlint
npm run preview  # serve the production build locally
```

The backend must be running on `:8080` for the proxy to have anything to talk to:

```bash
cd backend && ./mvnw spring-boot:run
```

And the infrastructure under that:

```bash
docker compose up -d
```
