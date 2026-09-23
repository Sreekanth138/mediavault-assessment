import { useEffect, useRef, useState } from "react";
import { bulkSetStatus } from "@/api/client";
import { AssetDetail } from "@/features/assets/AssetDetail";
import { AssetGrid } from "@/features/assets/AssetGrid";
import { useAssets } from "@/features/assets/useAssets";
import { statusLabel } from "@/lib/format";
import type { Asset, AssetStatus, AssetQuery, BulkResult } from "@/lib/types";

const STATUSES: AssetStatus[] = ["draft", "in_review", "approved", "archived"];
const SORTS: Array<{ value: NonNullable<AssetQuery["sort"]>; label: string }> =
  [
    { value: "updatedAt:desc", label: "Recently updated" },
    { value: "name:asc", label: "Name A–Z" },
    { value: "sizeBytes:desc", label: "Largest first" },
    { value: "createdAt:desc", label: "Newest" },
  ];

export function App() {
  const [q, setQ] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("q") ?? "";
  });
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState<AssetStatus[]>(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("status");

    if (!value) {
      return [];
    }

    return value
      .split(",")
      .filter((item): item is AssetStatus =>
        STATUSES.includes(item as AssetStatus),
      );
  });
  const [sort, setSort] = useState<NonNullable<AssetQuery["sort"]>>(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("sort");

    if (
      value === "updatedAt:desc" ||
      value === "name:asc" ||
      value === "sizeBytes:desc" ||
      value === "createdAt:desc"
    ) {
      return value;
    }

    return "updatedAt:desc";
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (q) {
      params.set("q", q);
    } else {
      params.delete("q");
    }

    if (status.length > 0) {
      params.set("status", status.join(","));
    } else {
      params.delete("status");
    }

    if (sort === "updatedAt:desc") {
      params.delete("sort");
    } else {
      params.set("sort", sort);
    }

    const queryString = params.toString();

    const newUrl = queryString
      ? `${window.location.pathname}?${queryString}`
      : window.location.pathname;

    window.history.replaceState(null, "", newUrl);
  }, [q, status, sort]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [q]);

  // Every keystroke sends a request. Nothing is debounced or cancelled.
  const {
    items,
    total,
    nextCursor,
    loading,
    loadingMore,
    error,
    loadMore,
    updateItems,
  } = useAssets({
    q: debouncedQ,
    status,
    sort,
    limit: 24,
  });

  const toggleSelect = (id: string, shiftKey: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (shiftKey && lastSelectedId) {
        const start = items.findIndex((asset) => asset.id === lastSelectedId);

        const end = items.findIndex((asset) => asset.id === id);

        if (start !== -1 && end !== -1) {
          const from = Math.min(start, end);
          const to = Math.max(start, end);

          for (let index = from; index <= to; index++) {
            const asset = items[index];

            if (asset) {
              next.add(asset.id);
            }
          }

          return next;
        }
      }

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });

    setLastSelectedId(id);
  };
  // const selectAllLoaded = () => {
  //   setSelectedIds(new Set(items.map((asset) => asset.id)));
  // };

  // const clearSelection = () => {
  //   setSelectedIds(new Set());
  // };

  function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }

    return chunks;
  }

  async function runWithConcurrency<T>(
    tasks: (() => Promise<T>)[],
    limit: number,
  ): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let nextIndex = 0;

    async function worker() {
      while (true) {
        const index = nextIndex++;

        if (index >= tasks.length) {
          return;
        }

        const task = tasks[index];

        if (!task) {
          return;
        }

        results[index] = await task();
      }
    }

    const workerCount = Math.min(limit, tasks.length);

    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return results;
  }

  async function applyBulkStatus(next: AssetStatus) {
    const ids = [...selectedIds];

    if (ids.length === 0) return;

    const previousStatuses = new Map(
      items
        .filter((asset) => selectedIds.has(asset.id))
        .map((asset) => [asset.id, asset.status]),
    );

    setNotice(null);

    // Optimistic update
    updateItems((currentItems) =>
      currentItems.map((asset) =>
        selectedIds.has(asset.id) ? { ...asset, status: next } : asset,
      ),
    );

    try {
      const chunks = chunk(ids, 50);

      let applied = 0;
      const failedIds: string[] = [];
      const failureCounts: Record<string, number> = {};

      const tasks = chunks.map((idsChunk) => async () => {
        const result = await bulkSetStatus(idsChunk, next);

        const conflictIds: string[] = [];
        const failedItems: Array<{
          id: string;
          code: string;
        }> = [];

        for (const item of result.results) {
          if (item.ok) {
            continue;
          }

          if (item.code === "conflict") {
            conflictIds.push(item.id);
          } else {
            failedItems.push({
              id: item.id,
              code: item.code,
            });
          }
        }

        let retryResult: BulkResult | null = null;

        if (conflictIds.length > 0) {
          retryResult = await bulkSetStatus(conflictIds, next);
        }

        return {
          result,
          retryResult,
          failedItems,
        };
      });

      const chunkResults = await runWithConcurrency(tasks, 2);

      for (const chunkResult of chunkResults) {
        applied += chunkResult.result.applied;

        for (const item of chunkResult.failedItems) {
          failedIds.push(item.id);

          failureCounts[item.code] = (failureCounts[item.code] ?? 0) + 1;
        }

        if (chunkResult.retryResult) {
          applied += chunkResult.retryResult.applied;

          for (const item of chunkResult.retryResult.results) {
            if (item.ok) {
              continue;
            }

            failedIds.push(item.id);

            failureCounts[item.code] = (failureCounts[item.code] ?? 0) + 1;
          }
        }
      }

      // Roll back only failed assets.
      if (failedIds.length > 0) {
        const failedIdSet = new Set(failedIds);

        updateItems((currentItems) =>
          currentItems.map((asset) => {
            if (!failedIdSet.has(asset.id)) {
              return asset;
            }

            const previousStatus = previousStatuses.get(asset.id);

            if (!previousStatus) {
              return asset;
            }

            return {
              ...asset,
              status: previousStatus,
            };
          }),
        );
      }

      const failed = failedIds.length;

      const failureDetails = Object.entries(failureCounts)
        .map(([code, count]) => `${count} ${code}`)
        .join(", ");

      setNotice(
        failureDetails
          ? `${applied} updated, ${failed} failed (${failureDetails}).`
          : `${applied} updated.`,
      );

      setSelectedIds(new Set(failedIds));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Bulk update failed");
    }
  }

  function handleSaved(_asset: Asset) {
    // The list is not told that anything changed, so it shows stale rows.
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>MediaVault</h1>
        <input
          className="search"
          type="search"
          placeholder="Search assets"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </header>

      <div className="filters">
        {STATUSES.map((s) => (
          <label key={s}>
            <input
              type="checkbox"
              checked={status.includes(s)}
              onChange={(e) =>
                setStatus((prev) =>
                  e.target.checked ? [...prev, s] : prev.filter((x) => x !== s),
                )
              }
            />
            {statusLabel(s)}
          </label>
        ))}
        <span className="muted">
          {loading
            ? "Loading…"
            : `${items.length} of ${total.toLocaleString()} shown`}
        </span>
      </div>

      {selectedIds.size > 0 && (
        <div className="bulkbar">
          <span>{selectedIds.size} selected</span>
          {STATUSES.map((s) => (
            <button key={s} onClick={() => applyBulkStatus(s)}>
              Set {statusLabel(s).toLowerCase()}
            </button>
          ))}
          <button onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}
      {!isOnline && (
        <div className="offline-banner" role="alert">
          You're offline. Changes will resume when your connection is restored.
        </div>
      )}
{/* 
      <button onClick={selectAllLoaded}>Select all loaded</button>

      <button onClick={clearSelection}>Clear selection</button> */}

      <main className="content">
        <AssetGrid
          assets={items}
          selectedIds={selectedIds}
          lastSelectedId={lastSelectedId}
          activeId={activeId}
          onToggleSelect={toggleSelect}
          onOpen={setActiveId}
          hasMore={Boolean(nextCursor)}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
        />

        {activeId && (
          <AssetDetail
            id={activeId}
            onClose={() => setActiveId(null)}
            onSaved={handleSaved}
          />
        )}
      </main>
    </div>
  );
}
