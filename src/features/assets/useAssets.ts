import { useCallback, useEffect, useRef, useState } from "react";
import { listAssets } from "@/api/client";
import type { Asset, AssetQuery } from "@/lib/types";

interface State {
  items: Asset[];
  total: number;
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

/**
 * Baseline loader. Reviewers know this hook is wrong in several ways.
 * Replacing it wholesale is expected and encouraged.
 */
export function useAssets(query: AssetQuery) {
  const requestIdRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const loadMoreRequestIdRef = useRef(0);

  const [state, setState] = useState<State>({
    items: [],
    total: 0,
    nextCursor: null,
    loading: true,
    loadingMore: false,
    error: null,
  });

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    loadMoreRequestIdRef.current += 1;

    const controller = new AbortController();

    setState({
      items: [],
      total: 0,
      nextCursor: null,
      loading: true,
      loadingMore: false,
      error: null,
    });
    console.log("INITIAL REQUEST", {
      query,
      requestId,
    });
    listAssets(query, controller.signal)
      .then((page) => {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setState({
          items: page.items,
          total: page.total,
          nextCursor: page.nextCursor,
          loading: false,
          loadingMore: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        if (requestId !== requestIdRef.current) {
          return;
        }

        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Something went wrong",
        }));
      });

    return () => {
      controller.abort();
    };
  }, [JSON.stringify(query)]);

  const loadMore = useCallback(async () => {
    if (!state.nextCursor || state.loading || loadingMoreRef.current) {
      return;
    }

    const loadMoreRequestId = ++loadMoreRequestIdRef.current;

    loadingMoreRef.current = true;

    setState((s) => ({
      ...s,
      loadingMore: true,
      error: null,
    }));

    try {
      const page = await listAssets({
        ...query,
        cursor: state.nextCursor,
      });

      if (loadMoreRequestId !== loadMoreRequestIdRef.current) {
        return;
      }

      setState((s) => ({
        ...s,
        items: [...s.items, ...page.items],
        total: page.total,
        nextCursor: page.nextCursor,
        loadingMore: false,
        error: null,
      }));
    } catch (err: unknown) {
      if (loadMoreRequestId !== loadMoreRequestIdRef.current) {
        return;
      }

      setState((s) => ({
        ...s,
        loadingMore: false,
        error: err instanceof Error ? err.message : "Something went wrong",
      }));
    } finally {
      loadingMoreRef.current = false;
    }
  }, [query, state.nextCursor, state.loading]);

  const updateItems = (updater: (items: Asset[]) => Asset[]) => {
    setState((current) => ({
      ...current,
      items: updater(current.items),
    }));
  };

  return {
    ...state,
    loadMore,
    updateItems
  };
}
