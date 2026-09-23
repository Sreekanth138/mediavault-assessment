import type { Asset, AssetPage, AssetQuery, BulkResult } from "@/lib/types";

/**
 * Baseline client. It works on a good network and falls apart on a bad one.
 *
 * Known gaps, all of which are yours to close:
 *   - no request cancellation
 *   - no retry, no backoff, no handling of Retry-After
 *   - no de-duplication of concurrent identical requests
 *   - error information is flattened into a string
 *   - callers cannot distinguish "retry this" from "do not retry this"
 */

function toSearchParams(query: AssetQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status?.length) params.set("status", query.status.join(","));
  if (query.kind?.length) params.set("kind", query.kind.join(","));
  if (query.tag?.length) params.set("tag", query.tag.join(","));
  if (query.collectionId) params.set("collectionId", query.collectionId);
  if (query.owner) params.set("owner", query.owner);
  if (query.sort) params.set("sort", query.sort);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  return params.toString();
}

export class ApiError extends Error {
  status: number;
  code: string;
  requestId?: string;
  retryAfter?: number;

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
    retryAfter?: number,
  ) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

function isRetryableError(error: unknown): boolean {
  if (isAbortError(error)) {
    return false;
  }

  if (error instanceof ApiError) {
    if (error.status === 429 || error.status === 503) {
      return true;
    }

    if (error.status === 500 && error.code === "write_failed") {
      return true;
    }

    return false;
  }

  return error instanceof TypeError;
}

function getRetryDelay(error: unknown, attempt: number): number {
  if (error instanceof ApiError && error.retryAfter !== undefined) {
    return error.retryAfter * 1000;
  }

  const exponentialDelay = BASE_DELAY_MS * 2 ** attempt;

  const jitter = Math.random() * 250;

  return exponentialDelay + jitter;
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Request aborted", "AbortError"));
      return;
    }

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Request aborted", "AbortError"));
      },
      { once: true },
    );
  });
}


async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      const res = await fetch(path, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(init?.headers ?? {}),
        },
      });

      if (!res.ok) {
        let code = "unknown_error";
        let message = res.statusText;

        try {
          const body = await res.json();

          code = body?.error?.code ?? code;
          message = body?.error?.message ?? message;
        } catch {
          // Response was not JSON.
        }

        const retryAfterHeader = res.headers.get("Retry-After");
        const retryAfter = retryAfterHeader
          ? Number(retryAfterHeader)
          : undefined;

        const requestId = res.headers.get("x-request-id") ?? undefined;

        throw new ApiError(res.status, code, message, requestId, retryAfter);
      }

      return res.json() as Promise<T>;
    } catch (error) {
      if (!isRetryableError(error) || attempt >= MAX_RETRIES) {
        throw error;
      }

      const delay = getRetryDelay(error, attempt);

      console.log(
        `Retrying ${path} in ${Math.round(delay)}ms (attempt ${attempt + 1})`,
      );

      await sleep(delay, init?.signal);

      attempt += 1;
    }
  }
}

export function listAssets(
  query: AssetQuery,
  signal?: AbortSignal,
): Promise<AssetPage> {
  return request<AssetPage>(
    `/api/assets?${toSearchParams(query)}`,
    { signal },
  );
}

export function getAsset(id: string): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`);
}

export function getAssetsByIds(
  ids: string[],
): Promise<{ items: Asset[]; missing: string[] }> {
  // Note: the endpoint rejects more than 25 ids per call.
  return request(`/api/assets/batch?ids=${ids.join(",")}`);
}

export function updateAsset(
  id: string,
  version: number,
  patch: Partial<Pick<Asset, "name" | "status" | "tags">>,
): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ version, patch }),
  });
}

export function bulkSetStatus(
  ids: string[],
  status: Asset["status"],
): Promise<BulkResult> {
  // Note: the endpoint rejects more than 50 ids per call.
  return request<BulkResult>("/api/assets/bulk-status", {
    method: "POST",
    body: JSON.stringify({ ids, status }),
  });
}

export const thumbnailUrl = (id: string) => `/api/thumb/${id}.svg`;
