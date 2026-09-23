import { useEffect, useRef } from "react";
import { thumbnailUrl } from "@/api/client";
import { formatBytes, formatDate, statusLabel } from "@/lib/format";
import type { Asset } from "@/lib/types";

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onOpen: (id: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  lastSelectedId: string | null;
}

export function AssetGrid({
  assets,
  selectedIds,
  activeId,
  onToggleSelect,
  onOpen,
  onLoadMore,
}: Props) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const shiftKeyRef = useRef(false);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const handleScroll = () => {
      const distanceFromBottom =
        grid.scrollHeight - grid.scrollTop - grid.clientHeight;

      if (distanceFromBottom < 300) {
        onLoadMore();
      }
    };

    grid.addEventListener("scroll", handleScroll);

    return () => {
      grid.removeEventListener("scroll", handleScroll);
    };
  }, [onLoadMore]);

  if (assets.length === 0) {
    return (
      <div className="empty">
        <p>Nothing matches these filters.</p>
        <p className="muted">
          Clear the search box or widen the status filter.
        </p>
      </div>
    );
  }
  console.log("GRID ELEMENT", gridRef.current);
  return (
    <div ref={gridRef} className="grid">
      {assets.map((asset) => (
        <div
          key={asset.id}
          className={
            "card" +
            (selectedIds.has(asset.id) ? " card--selected" : "") +
            (activeId === asset.id ? " card--active" : "")
          }
          onClick={() => onOpen(asset.id)}
        >
          {asset.hasThumbnail ? (
            <img className="card__thumb" src={thumbnailUrl(asset.id)} alt="" />
          ) : (
            <div
              className="card__thumb card__thumb--placeholder"
              aria-hidden="true"
            >
              No preview
            </div>
          )}

          <div className="card__body">
            <p className="card__name">{asset.name}</p>

            <p className="muted">
              {asset.kind} · {formatBytes(asset.sizeBytes)} ·{" "}
              {formatDate(asset.updatedAt)}
            </p>

            <span className={`pill pill--${asset.status}`}>
              {statusLabel(asset.status)}
            </span>
          </div>

          <input
            type="checkbox"
            className="card__check"
            checked={selectedIds.has(asset.id)}
            onMouseDown={(event) => {
              event.stopPropagation();
              shiftKeyRef.current = event.shiftKey;
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
            onChange={() => {
              onToggleSelect(asset.id, shiftKeyRef.current);
              shiftKeyRef.current = false;
            }}
          />
        </div>
      ))}
    </div>
  );
}
