# Submission

## Video walkthrough

Paste your Loom (or equivalent) link here. 5–10 minutes.

**Link:**

---

## How to run it

```bash
npm install
npm run dev
```

The application expects the provided API/server to be running according to the instructions in `API.md`.

No changes were made to `server/` or `API.md`.

## Time spent

Approximately 10–14 focused hours.

Time was primarily split across:

* Baseline investigation and defect identification
* Search correctness and request handling
* Cursor pagination and infinite scrolling
* Bulk selection and bulk status operations
* Retry/resilience behavior
* Optimistic updates and rollback
* Error/offline handling
* UI fixes and regression testing

---

## Baseline defects found

| #  | Defect                                                      | Where                            | Fixed / left / out of scope                          |
| -- | ----------------------------------------------------------- | -------------------------------- | ---------------------------------------------------- |
| 1  | Bulk update sends >50 ids in one call                       | `App.tsx`                        | **Fixed** — IDs are chunked into groups of 50        |
| 2  | Search sends a request on every keystroke                   | `App.tsx` / asset fetching       | **Fixed** — 300ms debounce                           |
| 3  | Older search responses can overwrite newer results          | `useAssets.ts`                   | **Fixed** — request cancellation + request identity  |
| 4  | Cursor pagination was not implemented                       | `useAssets.ts` / `AssetGrid.tsx` | **Fixed**                                            |
| 5  | Asset grid did not scroll/load additional cursor pages      | `AssetGrid.tsx` / CSS            | **Fixed**                                            |
| 6  | Missing thumbnails can display broken images                | `AssetGrid.tsx`                  | **Fixed** — placeholder when `hasThumbnail` is false |
| 7  | Bulk partial failures were not handled per asset            | `App.tsx`                        | **Fixed**                                            |
| 8  | Bulk conflicts were not retried                             | `App.tsx`                        | **Fixed** — conflict retry once                      |
| 9  | Bulk updates were not optimistic                            | `App.tsx` / `useAssets.ts`       | **Fixed**                                            |
| 10 | Failed optimistic updates were not rolled back individually | `App.tsx`                        | **Fixed**                                            |
| 11 | Checkbox clicks opened asset details                        | `AssetGrid.tsx`                  | **Fixed**                                            |
| 12 | Shift-click range selection was missing                     | `AssetGrid.tsx` / `App.tsx`      | **Fixed**                                            |
| 13 | Browser offline state was not surfaced                      | `App.tsx`                        | **Fixed**                                            |
| 14 | Unexpected React rendering errors had no recovery UI        | App root                         | **Fixed** — Error Boundary                           |
| 15 | Full keyboard grid navigation was missing                   | `AssetGrid.tsx`                  | **Left** — not completed within submission time      |

---

## Key decisions

**### Data fetching and caching**

I kept the existing API client structure rather than introducing a large data-fetching library. The API client handles structured API errors, retry behavior, `Retry-After`, and request cancellation. Asset pagination remains cursor-based because the API provides an opaque cursor.

**### Stale response handling**

Search requests use `AbortController` and request identity tracking. Pagination requests also use request identity tracking so an obsolete request cannot append results after the user changes the query.

**### Virtualization approach**

Full virtualization was not completed. The implementation uses cursor pagination to avoid loading the entire dataset at once, while the loaded asset list is progressively appended as the user scrolls. Full virtualization was left as a further performance improvement rather than introducing a large change late in the implementation.

**### Optimistic updates and rollback**

Bulk status changes update the visible assets optimistically. Previous statuses are captured before the update. Successful assets retain the new status, while assets that ultimately fail are rolled back individually and remain selected so the user can identify them.

**### Retry and backoff policy**

Transient API failures such as `429`, `503`, and `500 write_failed` are retried with exponential backoff and jitter. `Retry-After` is respected when provided. Non-transient errors are not blindly retried. Bulk `conflict` results are retried once at the individual-result level.

**### State placement and URL sync**

Asset data remains owned by `useAssets`. Search, status, and sort state are kept in the application state and synchronized to the URL so the current search state can be refreshed/shared without introducing a second copy of the asset list in `App.tsx`.

---

## Performance

I did not complete the formal 5,000-row performance benchmark requested by the template, so I am intentionally not inventing measurements.

| Metric                                          | Before       | After               | How measured          |
| ----------------------------------------------- | ------------ | ------------------- | --------------------- |
| Rendered DOM nodes at 5,000 rows loaded         | Not measured | Not measured        | Not completed         |
| Cards re-rendered when toggling one selection   | Not measured | Not measured        | Not completed         |
| Longest task during sustained scroll            | Not measured | Not measured        | Not completed         |
| Requests fired while typing a 6-character query | 6 requests   | 1 debounced request | Browser Network panel |
| Production bundle, gzipped                      | Not measured | Not measured        | Not completed         |

The most immediate performance/correctness bottlenecks found during development were unnecessary search requests, stale out-of-order responses, and lack of cursor pagination.

Search was changed to debounce input, obsolete requests are cancelled/ignored, and pagination now loads additional results only as the user approaches the end of the loaded asset grid.

---

## Accessibility

Native checkbox controls are used for selection, including Shift-click range selection. Checkbox interaction is separated from the card's activation behavior so selecting an asset does not unexpectedly open the details panel. Offline and error states expose appropriate alert semantics.

The full custom keyboard grid model requested by the assessment was not completed. In particular, roving tabindex, arrow-key navigation, focus management around the detail panel, and full screen-reader grid interaction remain known gaps.

No full screen-reader test was completed.

---

## Interface decisions

The interface work prioritized clarity of asset state, predictable selection behavior, and clear feedback during asynchronous operations. The asset grid is a dedicated scroll container so pagination can happen naturally as the user approaches the end of the loaded content. Bulk operations provide immediate optimistic feedback while preserving failed assets for review.

* **Visual system.** Existing application styling was retained and extended rather than introducing a new design system late in the implementation. Grid spacing and card sizing were adjusted to maintain a usable asset grid and real scrollable content area.

* **Status treatment.** Asset status continues to use the existing status presentation. Bulk-operation feedback also provides text-based success/failure information rather than relying only on color.

* **States.** Loading, empty, error, offline, missing-thumbnail, and partial-bulk-failure states were handled explicitly. Missing thumbnails use a stable placeholder. Offline state displays an offline banner. Partial failures identify failure codes when available.

* **Contrast.** No formal WCAG contrast audit was completed.

* **Copy.** Bulk feedback was made more actionable by including failure reasons where available, for example `5 legal_hold`, rather than only showing a generic failed count.

---

## Trade-offs and cuts

The main deliberate cut was the complete keyboard-accessible grid interaction model. Implementing roving tabindex, arrow navigation, focus return, and screen-reader behavior correctly would require additional testing and could introduce regressions close to submission.

Full virtualization and formal performance benchmarking were also not completed.

With another day, I would prioritize:

1. Complete keyboard and screen-reader interaction.
2. Add true virtualization for very large loaded result sets.
3. Add formal performance measurements using the requested metrics.
4. Complete a WCAG AA contrast/accessibility audit.
5. Expand automated tests around search races, pagination races, and partial bulk failures.

---

## Critique of the API

The API's intentionally hostile behavior makes the client resilient, but several aspects increase client complexity.

The opaque cursor is correctly bound to the query, which requires the client to reset pagination whenever query state changes. This is safe but requires careful stale-cursor handling.

The bulk-status API returning `207` with per-item results is useful for partial success, but it requires the client to reconcile each result individually and maintain selection/rollback state.

The combination of random transient failures, rate limiting, and `Retry-After` requires centralized retry logic in the client. Retrying requests also consumes rate-limit capacity, so retry policy must be conservative.

The `conflict` result is also useful, but a richer version/conflict response could make conflict resolution more explicit.

---

## Anything you would like us to look at

The areas I would particularly like reviewers to inspect are:

* Search cancellation and stale-response protection
* Cursor pagination and scroll loading
* Bulk chunking and bounded concurrency
* Optimistic updates and per-asset rollback
* Conflict retry handling
* Structured API error/retry behavior
* The separation of asset state inside `useAssets` from UI state in `App.tsx`

The biggest known gap is the incomplete keyboard-accessibility model, which I would address next with additional time.
