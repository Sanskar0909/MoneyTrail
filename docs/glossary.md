# Glossary

Every piece of jargon used while designing MoneyTrail, defined plainly, with the place it actually shows up in this project. Most of these are simple ideas with intimidating names.

---

## Concurrency & distributed systems

### Row-level lock
A lock on a single database row rather than the whole table. While you hold it, other transactions trying to lock the same row wait.

> **In MoneyTrail:** the job poller locks the job rows it claims, so two workers can't grab the same job.

### `SELECT … FOR UPDATE SKIP LOCKED`
A Postgres feature that turns an ordinary table into a safe work queue.

- `FOR UPDATE` — lock the rows I'm selecting.
- `SKIP LOCKED` — if a row is already locked by someone else, **don't wait**, just skip it and give me the next one.

Without `SKIP LOCKED`, a second poller would block until the first finished, and everything would run one-at-a-time.

> **In MoneyTrail:** how `JobSchedulerService` claims jobs from `processing_jobs`.

### Lease
A time-limited claim on a piece of work. A worker doesn't own a job forever — it holds it for N minutes. If the job isn't finished by then, the system assumes the worker died and gives the job to someone else.

AWS SQS calls the same idea a **visibility timeout**.

> **In MoneyTrail:** `locked_at` + `locked_by` on `processing_jobs`. A job stuck at `RUNNING` with `locked_at` older than the lease gets reclaimed.

### At-least-once delivery
A guarantee that work runs *at least* once — and occasionally more than once.

Why you can't do better: no timeout can reliably tell "the worker crashed" apart from "the worker is very slow." If you assume a slow worker is dead and hand its job to someone else, both may complete. This is a fundamental limit, not a bug you can fix.

The alternatives:
- **At-most-once** — never duplicated, but work can be silently lost. Usually worse.
- **Exactly-once** — the thing everyone wants; requires distributed consensus and is far more machinery than this project needs.

> **In MoneyTrail:** accepted deliberately. The response is to make the work tolerate duplicates (see *idempotency*).

### Idempotency
An operation is **idempotent** if doing it twice has the same effect as doing it once.

- `setStatus(EXTRACTED)` — idempotent. Set it twice, same result.
- `retryCount = retryCount + 1` — **not** idempotent. Twice gives you 2.
- `INSERT INTO receipt_extractions …` — not idempotent, but harmless here, because it's an append-only log where two attempts genuinely did happen.

The word comes from maths: `f(f(x)) = f(x)`.

> **In MoneyTrail:** the reason a double-processed receipt is survivable. Copying merchant/amount onto the receipt is idempotent; the status transition isn't, which is why it needs a guard.

### TOCTOU (time-of-check to time-of-use)
A bug where you check a condition, then act on it, and the world changes in the gap.

```java
if (receipt.getStatus() == PROCESSING) {   // check — true right now
    receipt.setStatus(EXTRACTED);          // use  — but is it still true?
}
```

Another worker can change the status between those two lines. The check passed and the guard still failed.

The fix is always the same: make the check and the action **one atomic operation**.

> **In MoneyTrail:** why status transitions can't be read-then-write.

### Compare-and-swap (CAS)
"Change X to Y, but only if X is still what I last saw." Check and write in a single indivisible step, so nothing can interleave.

In SQL:
```sql
UPDATE receipts SET status = 'EXTRACTED'
 WHERE id = 42 AND status = 'PROCESSING';
```
Then look at the affected row count: `1` means you won, `0` means someone beat you to it.

In Java, `AtomicInteger.compareAndSet(expected, newValue)` is the same idea in memory.

> **In MoneyTrail:** how `ReceiptStateMachineService` transitions safely.

### Optimistic locking
An alternative to CAS. Add a `version` column; every update increments it and requires the version to be unchanged. If someone else updated the row first, your update matches zero rows and JPA throws `OptimisticLockException`.

Called *optimistic* because it assumes conflicts are rare and only detects them at write time — as opposed to *pessimistic* locking, which locks up front and makes others wait.

> **In MoneyTrail:** not used (CAS needs no schema change), but the standard JPA answer via `@Version`.

### Poison pill
A job that crashes its worker every single time. Without protection: job runs → worker dies → lease expires → job reclaimed → worker dies → forever, consuming all capacity.

The fix is to make sure every failure — including a reclaimed stale job — counts as an attempt, so it eventually exhausts `max_attempts` and lands in `FAILED`.

> **In MoneyTrail:** why a stale reclaim increments `attempt_count`.

### Exponential backoff
Waiting progressively longer between retries: 10s, 20s, 40s, … Retrying a rate-limited API immediately just gets rate-limited again, and a stampede of retries can keep a struggling service down.

> **In MoneyTrail:** `RetryPolicy` setting `next_retry_at`.

---

## Data & transactions

### Transaction
A group of database operations that either all succeed or all fail. Its properties are **ACID**: Atomicity (all or nothing), Consistency (constraints hold), Isolation (concurrent transactions don't see each other's half-finished work), Durability (committed means survives a crash).

> **In MoneyTrail:** inserting the `Receipt` and its `processing_jobs` row must be one transaction — a receipt with no job would never be processed.

### Compensating action (compensating transaction)
An explicit undo for work a transaction *can't* roll back — typically because it happened in a different system.

A database rollback can't un-upload a file from MinIO. So you delete it manually if the insert fails.

Best-effort by nature: the compensating delete can itself fail. That's tolerable when the leftover is harmless. (The formal version of this pattern across many services is called a **saga**.)

> **In MoneyTrail:** `deleteQuietly(storageKey)` in `ReceiptService`.

### Denormalization
Deliberately storing the same data in more than one place to make reads faster or simpler, accepting that you now have to keep copies in sync.

> **In MoneyTrail:** `merchantName`, `receiptDate`, and `totalAmount` live on `receipts` even though they also exist in `receipt_extractions`. `receipts` is fast "current truth" for the dashboard; the extraction log is history.

### Append-only log
A table you only ever `INSERT` into — never `UPDATE`, never `DELETE`. Gives you a complete, trustworthy history.

> **In MoneyTrail:** `receipt_extractions`. One row per LLM attempt, including failures. It's how you'll eventually answer "how often is extraction wrong, and about what?"

### Current truth vs history
Two different jobs that want two different tables:
- **Current truth** — what's correct *now*. Mutable, overwritten by corrections. What the UI reads.
- **History** — what happened, in order. Immutable. What you audit and debug with.

> **In MoneyTrail:** `receipts` vs `receipt_extractions`. After you correct a total in review, the receipt holds your corrected value while the log still shows what the model originally said.

### Migration
A versioned, ordered SQL script that changes the schema. Running them in order on an empty database reproduces the schema exactly. Flyway records which have been applied, in `flyway_schema_history`.

**Checksums:** Flyway hashes each file. Editing an already-applied migration changes its hash and Flyway refuses to start — protecting you from a file that no longer matches what's in the database. (Fine to edit during early development if you also wipe the database, which is what `docker compose down -v` did.)

### N+1 query problem
Fetching a list with one query, then accidentally firing one more query per item.

```java
List<Receipt> receipts = repo.findAll();          // 1 query
for (Receipt r : receipts) r.getOwner().getEmail(); // + N queries
```

50 receipts → 51 queries instead of 1 or 2. The most common Hibernate performance bug.

> **In MoneyTrail:** why `ownerId` is a plain `Long` rather than a `@ManyToOne User`.

### Optimistic vs pessimistic
A recurring axis, not one specific technique:
- **Pessimistic** — assume conflict; lock first, make others wait.
- **Optimistic** — assume no conflict; proceed, detect collisions at write time, retry if needed.

Optimistic wins when conflicts are rare, which is most of the time.

---

## Design & architecture

### State machine
A finite set of states plus the rules for which transitions are legal. `UPLOADED → PROCESSING` is allowed; `CONFIRMED → UPLOADED` is not.

> **In MoneyTrail:** `ReceiptStatus` plus `ReceiptStateMachineService`, which owns the allowed-transitions map.

### State pattern (GoF)
A different thing with a confusingly similar name. An object-oriented pattern where each state is a **class**, and calling a method dispatches to different behaviour depending on the current state object.

**Use it when behaviour varies by state. Use a plain state machine when only transition legality matters.** Receipts are inert data between pipeline steps — nothing *behaves* differently per state — so the enum wins.

> **In MoneyTrail:** considered and rejected, deliberately.

### Seam
A single point in the code where an implementation can be swapped without touching anything else.

> **In MoneyTrail:** `CurrentUserProvider` (the one place that answers "who is the current user" — the only file that changes when auth lands), `FileStorageClient` (MinIO today, S3 later), `ReceiptExtractionClient` (stub today, Claude next week).

### DTO (Data Transfer Object)
A type that exists purely to carry data across a boundary, separate from your internal model.

Why not just return the entity? It leaks your database schema to clients (rename a column, break the frontend), and with lazy JPA associations, serialising an entity can throw at render time.

> **In MoneyTrail:** `ReceiptResponse`.

### Package-by-feature vs package-by-layer
- **By layer:** `controllers/`, `services/`, `repositories/` — every change means editing three distant folders.
- **By feature:** `receipt/`, `pipeline/`, `category/` — everything about one thing lives together.

> **In MoneyTrail:** by feature, under `com.moneytrail`.

### Decoupling
Arranging things so one part can change without forcing changes elsewhere.

> **In MoneyTrail:** the whole point of the job queue. Upload responds immediately; extraction happens later. Upload doesn't need to know how long extraction takes, or whether it succeeded.

---

## Spring / JPA

### Entity
A Java class mapped to a database table. Needs `@Entity`, an `@Id`, and a no-arg constructor (Hibernate creates instances reflectively when reading rows).

### `ddl-auto: validate`
Hibernate compares your entities against the real tables at startup and refuses to start on a mismatch. Safer than `update` (which silently alters your schema) and far safer than `create-drop` (which deletes your data).

### Repository
An interface extending `JpaRepository`. You declare method *signatures*; Spring Data generates the SQL from the method name. `findByOwnerIdAndStatus(...)` becomes `WHERE owner_id = ? AND status = ?`.

### `@Transactional`
Marks a method as running inside one database transaction. Proxy-based, which has two consequences worth knowing:
- It only works on **public** methods.
- It only works when called **from outside** the bean. A method calling another `@Transactional` method on `this` bypasses the proxy entirely, and the annotation silently does nothing.

### `@Scheduled` and `@Async`
- `@Scheduled` — run this method on a timer.
- `@Async` — run this method on a different thread; the caller returns immediately.

> **In MoneyTrail:** the scheduler polls on a timer and dispatches asynchronously, so a slow LLM call never blocks the next poll.

### `@Enumerated(EnumType.STRING)`
Store an enum as its name (`'UPLOADED'`) rather than its ordinal position (`0`). Always use `STRING` — with `ORDINAL`, inserting a new constant in the middle of the enum silently changes the meaning of every existing row.

---

## Frontend

### Component
A function returning a description of UI. Called again whenever its data changes.

### Props / state
- **Props** — inputs from the parent. Read-only.
- **State** — data owned by the component that, when changed, triggers a re-render.

### Hook
A function starting with `use` that lets a component access React features. Must be called unconditionally at the top level — React tracks them by call order.

### Idempotent refetch
Reloading the list from the server rather than patching local state after a change. Slightly more traffic, always correct — and essential once the server changes data on its own.

### Same-origin policy / CORS / proxy
Browsers block requests to a different origin (protocol + host + port). Either the server opts in via **CORS** headers, or the dev server **proxies** those paths so everything looks same-origin.

> **In MoneyTrail:** Vite proxies `/api` → `localhost:8080`.

### Type narrowing
Convincing the TypeScript compiler that a broad type is something more specific, by checking it.

```ts
if (typeof body.message === 'string') { /* now it's a string */ }
```

> **In MoneyTrail:** parsing error responses in `api.ts`.
