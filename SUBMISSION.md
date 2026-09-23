# Submission

Keep this tight. Bullet points are fine. We read this before we read your code,

and a clear account of your reasoning carries real weight — including where you

chose not to do something.

## Video walkthrough

**Link:** Not provided.

---

## How to run it

```bash
npm install
npm run dev
```

The app uses the provided API/server setup described in `API.md`.

No changes were made to `server/` or `API.md`.

## Time spent

Roughly 10–14 focused hours, including investigation, implementation, debugging, and testing.

---

## Baseline defects found

| #  | Defect                                                   | Where                            | Fixed / left / out of scope                                          |
| -- | -------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| 1  | Bulk update can exceed the API's 50-ID limit             | `App.tsx`                        | Fixed — IDs are chunked into groups of 50                            |
| 2  | Search fires a request on every keystroke                | `App.tsx`                        | Fixed — 300ms debounce                                               |
| 3  | Older search responses can overwrite newer results       | `useAssets.ts` / API client      | Fixed — request cancellation and request identity checks             |
| 4  | Cursor pagination was not implemented                    | `useAssets.ts`                   | Fixed — cursor-based loading added                                   |
| 5  | Asset grid did not load additional pages while scrolling | `AssetGrid.tsx`                  | Fixed — scroll threshold triggers `loadMore`                         |
| 6  | Missing thumbnails could render as broken images         | `AssetGrid.tsx`                  | Fixed — stable "No preview" placeholder                              |
| 7  | Bulk partial failures were not reconciled per asset      | `App.tsx`                        | Fixed — successful items remain updated and failures are rolled back |
| 8  | Bulk version conflicts were not retried                  | `App.tsx`                        | Fixed — conflicted IDs are retried once                              |
| 9  | Bulk status changes were not optimistic                  | `App.tsx`                        | Fixed — selected assets update immediately                           |
| 10 | Failed optimistic updates were not rolled back           | `App.tsx`                        | Fixed — previous statuses are restored for failed items              |
| 11 | Clicking a checkbox could also open the asset detail     | `AssetGrid.tsx`                  | Fixed — checkbox events stop propagation                             |
| 12 | Shift-click range selection was missing                  | `AssetGrid.tsx` / `App.tsx`      | Fixed — range selection added                                        |
| 13 | Offline state was not surfaced to the user               | `App.tsx`                        | Fixed — online/offline state is displayed                            |
| 14 | No React error boundary existed                          | `ErrorBoundary.tsx` / `main.tsx` | Fixed — application-level error boundary added                       |
| 15 | Full keyboard grid navigation was missing                | `AssetGrid.tsx`                  | Left — not completed within the submission time                      |

---

## Key decisions

For each significant choice: what you did, what you rejected, and why. Three to

six of these is about right.

**Data fetching and caching**

Kept asset fetching centralized through the existing API client and `useAssets` hook. Added structured API errors, cancellation, retry handling, and cursor-based pagination rather than introducing a larger data-fetching library for the assessment.

**Stale response handling**

Used `AbortController` to cancel obsolete requests and request identity checks to prevent an older response from updating the current UI. This handles both actual cancellation and responses that race with newer requests.

**Virtualization approach**

Full list virtualization was not completed. I prioritized cursor pagination, bounded page loading, and a real scroll container first. With more time I would add virtualization for very large loaded result sets and measure the effect before choosing the final implementation.

**Optimistic updates and rollback**

Bulk status changes update the UI immediately. The previous status of each selected asset is retained so failed items can be rolled back individually. Successful items remain updated, while failed items remain selected so the user can retry them.

**Retry and backoff policy**

Transient failures such as 429, 503, and the API's transient write failure are retried with exponential backoff and jitter. `Retry-After` is honored when provided, and retries are bounded. Non-transient validation/conflict responses are not blindly retried. Bulk version conflicts are retried once for the affected IDs.

**State placement and URL sync**

Asset data remains in the `useAssets` state while query controls such as search, status, and sort are synchronized to the URL. Search input is debounced before it becomes the API query.

---

## Performance

Formal 5,000-row performance benchmarking was not completed before submission, so I have not included estimated numbers.

| Metric                                          | Before       | After        | How measured                          |
| ----------------------------------------------- | ------------ | ------------ | ------------------------------------- |
| Rendered DOM nodes at 5,000 rows loaded         | Not measured | Not measured | Not formally benchmarked              |
| Cards re-rendered when toggling one selection   | Not measured | Not measured | Not formally benchmarked              |
| Longest task during sustained scroll            | Not measured | Not measured | Not formally benchmarked              |
| Requests fired while typing a 6-character query | 6            | 1            | Browser Network panel; 300ms debounce |
| Production bundle, gzipped                      | Not measured | Not measured | Not formally benchmarked              |

The main observable bottleneck during investigation was unnecessary network activity from search input and the lack of proper cursor-driven scrolling. I addressed those before spending time on deeper performance optimization.

---

## Accessibility

Native checkboxes are used for selection, including Shift-click range selection. Checkbox interaction is separated from opening the asset detail view, and visible UI feedback is provided for offline and error states.

The complete custom keyboard grid interaction model was not implemented. In particular, roving tabindex, arrow-key grid navigation, focus management into and back from the detail panel, and full screen-reader testing remain known gaps.

---

## Interface decisions

The interface was kept focused on the existing MediaVault structure while improving the states that are most important during unreliable API interactions. The main UI decisions were to provide clear loading/error/offline feedback, keep selection interactions predictable, and avoid broken thumbnail imagery.

* **Visual system.** Existing application styling was retained. Grid sizing and card dimensions were adjusted so the scrollable asset area behaves predictably across viewport sizes.
* **Status treatment.** Status changes are communicated through text and UI state rather than relying only on color.
* **States.** Loading, empty/error handling, missing thumbnails, offline state, and partial bulk-update failures are explicitly represented.
* **Contrast.** No formal WCAG AA contrast audit was completed.
* **Copy.** Error and failure messages were kept actionable, for example reporting how many items were updated and how many failed.

---

## Trade-offs and cuts

The main deliberate cuts were full keyboard grid navigation, full virtualization, formal performance benchmarking, and a formal WCAG AA contrast audit.

Given the submission time, I prioritized correctness around search, stale requests, cursor pagination, bulk operations, optimistic rollback, transient failures, offline state, and error handling.

With another day, I would prioritize the complete keyboard interaction model first, followed by virtualization and measured performance optimization, then a more systematic accessibility audit.

## Critique of the API

The cursor is tied to the query state, so the client needs to reset pagination whenever the query changes.

The bulk API returning per-item results, including partial success, requires client-side reconciliation and rollback logic.

The transient failure and rate-limit behavior also makes centralized retry handling important. Otherwise, each feature would need to implement its own backoff and `Retry-After` handling.

A richer conflict response could provide more information about the current asset version and make conflict resolution more explicit instead of requiring a client retry.

## Anything you would like us to look at

The areas I would especially highlight are:

* Search cancellation, debouncing, and stale-response protection
* Cursor pagination and scroll-triggered loading
* Bulk update chunking and bounded concurrency
* Optimistic updates with per-item rollback
* Version-conflict retry handling
* Structured API errors and retry/backoff behavior
* Missing-thumbnail and offline/error states
