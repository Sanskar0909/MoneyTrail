# MoneyTrail — where we are

Last updated: 6 October 2026. Re-read this first after a break.

---

## 1. What the app is

You photograph a receipt. The app stores the photo, and in the background an AI reads it and
pulls out the merchant, the date and the total. Because an AI can misread things, nothing is
trusted automatically — every receipt lands in a review queue for you to check and confirm.
Confirmed receipts are what the dashboard and the monthly summary will eventually be built on.

The reason it was built the hard way — a background worker instead of doing it during the upload —
is that reading a receipt takes seconds. Nobody wants to stare at a spinner, and if the AI is down
the upload shouldn't fail. So uploading and reading are two separate things that talk through a
queue.

---

## 2. What actually happens today

This all works right now, on your laptop:

1. You drop a photo on the web page.
2. The browser sends it to `POST /api/receipts`.
3. The backend checks the type and size, puts the file in MinIO (local file storage), and writes
   two database rows in one transaction: the **receipt** (status `UPLOADED`) and a **job** saying
   "somebody please read receipt 17".
4. Every 5 seconds a scheduler looks in the `processing_jobs` table for work to do.
5. It claims the job, marks it `RUNNING`, and hands it to a background thread.
6. That worker moves the receipt to `PROCESSING`, downloads the photo, and calls the extractor.
7. **Right now the extractor is fake.** It returns "Test Store / ₹100.00" for every photo.
8. The worker saves a record of the attempt, copies the values onto the receipt, moves it to
   `NEEDS_REVIEW`, and marks the job done.
9. The web page is polling, so the receipt changes from Uploaded to Needs review on its own.

If anything fails along the way, the job waits 30 seconds and tries again, then 60 seconds, and
after the third failure both the job and the receipt are marked `FAILED`.

---

## 3. The files, and what each one is for

### The pipeline (`pipeline/`) — the background machinery

| File | What it's for |
|---|---|
| `ProcessingJob` | One row in the job queue. Knows how to mark itself running, succeeded, failed, or due for a retry |
| `JobStatus`, `JobType` | The lists of allowed values for those |
| `ProcessingJobRepository` | The database query that claims jobs, including jobs abandoned by a crashed worker |
| `JobSchedulerService` | Runs every 5 seconds, asks for work, hands it out |
| `JobClaimService` | Claims a batch of jobs in a short transaction and marks them running |
| `ProcessingJobWorker` | Does one job: load, download photo, call extractor, handle success or failure |
| `ProcessingJobWorkerMapping` | All the database writes at the end of a job, in one transaction |
| `RetryPolicy` | How long to wait before trying again |

### The receipts (`receipt/`) — the thing the user cares about

| File | What it's for |
|---|---|
| `Receipt` | One row in the receipts table |
| `ReceiptStatus` | Uploaded → Processing → Needs review → Confirmed, plus Failed |
| `ReceiptController` | The two web endpoints: upload, and list |
| `ReceiptService` | The upload logic — validate, store the file, handle cleanup if the database write fails |
| `ReceiptCreationService` | Writes the receipt row and its job row together, so you can't get one without the other |
| `ReceiptStateMachineService` | The rules for which status changes are allowed, and the safe way to apply them |
| `ReceiptRepository` | Database queries for receipts |
| `ReceiptResponse` | The shape of the JSON the browser gets back |
| `ReceiptExtraction` | A record of one attempt at reading a receipt. Never edited, only added to |
| `ReceiptExtractionRepository` | Database access for those |
| `ReceiptExtractionClient` | The interface: "give me an image, I'll give you the values" |
| `StubReceiptExtractionClient` | The fake one, returns Test Store / ₹100 |
| `GeminiReceiptExtractionClient` | The real one. **Unfinished — one method left** |
| `ExtractionResult` | What the extractor hands back |
| `ExtractionException` | What it throws when it fails |

### Supporting cast

| Folder | What it's for |
|---|---|
| `storage/` | Putting files in and out of MinIO |
| `common/config/` | Settings: file size limits, poll interval, retry delay, API key |
| `common/exception/` | Turning errors into sensible HTTP responses |
| `user/` | A placeholder for "who is logged in", until real login exists |

### The website (`frontend/src/`)

| File | What it's for |
|---|---|
| `App.tsx` | The page |
| `UploadPanel.tsx` | Drag-and-drop upload box |
| `ReceiptList.tsx` | The receipts, drawn as paper slips |
| `StatusBadge.tsx` | The coloured status label |
| `useReceipts.ts` | Fetches the list, and re-fetches while something is processing |
| `api.ts`, `format.ts` | Talking to the backend; formatting money and dates |

---

## 4. What works

- Uploading a receipt, including rejecting files that are too big or the wrong type
- Storing the file, and deleting it again if the database write fails
- The job queue: claiming work, several workers at once without collisions
- Recovering jobs from a worker that died mid-task
- Retrying failures with growing waits, and giving up after three tries
- Status rules — a slow worker cannot overwrite a receipt you have already confirmed
- A permanent log of every read attempt, successful or not
- The web page: upload, list, live status updates

All of the above has been run and watched working, not just written.

---

## 5. What doesn't work yet

- **Reading receipts is fake.** This is the big one. Everything else is real
- **There is no review screen.** You can see a list, but you cannot open a receipt, correct it, or
  confirm it — which is the whole point of the app
- **Line items aren't stored.** The table exists; nothing fills it
- **Nothing checks the maths.** Whether the numbers add up isn't verified yet
- **No login.** Everything belongs to one hardcoded user
- **It only runs on your laptop.** Not deployed, no README

---

## 6. What's left, in order

1. **Finish the Gemini client** — one method, `toExtractionResult`, which turns the AI's JSON into
   an `ExtractionResult`. *This is the next thing.*
2. **Review screen** — four endpoints (view one receipt, show its photo, save corrections, confirm)
   and the page itself.
3. **Validation and line items** — store each line, check that they add up, show mismatches in the
   review screen.
4. **Phone support** — a manifest so it installs on your home screen, and a camera button.
5. **Manual entry** — a form, for cash spends with no receipt.
6. **Ship it** — Dockerfile, deploy, README, demo recording.

SMS/UPI parsing was deliberately cut and belongs in the README as a future idea.

---

## 7. The ideas behind it

Worth knowing, because these are the parts that are genuinely hard and that you built by hand:

- **A queue in a database table.** Normally you'd reach for RabbitMQ or Kafka. On a ₹1000/month
  budget you can't, so the queue is a table plus a clever query that lets many workers take
  different rows at the same time without tripping over each other.
- **Leases.** A worker that dies mid-job would strand that receipt forever. So a claim expires: if
  a job has been "running" for five minutes with no result, someone else picks it up.
- **Counting attempts.** Because of the above, a job that crashes its worker every time would loop
  forever. Every claim counts as an attempt, so it eventually gives up properly.
- **Check-then-write, atomically.** The AI call takes seconds. In that time you might have opened
  the receipt and confirmed it yourself. So the worker's final write only applies *if the receipt
  is still where it left it* — one database statement that checks and writes at once.
- **History versus current state.** `receipts` holds what's true now and gets corrected.
  `receipt_extractions` holds what happened and never changes. That's how you'll later answer
  "how often does the AI get it wrong, and about what?"
