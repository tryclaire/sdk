import { ClaireAPIError, ClaireResponseError } from "./errors.js";
import type {
  ContextResponse, KnowledgeListResponse, KnowledgeItemResponse,
  AssetsResponse, AssetResponse, TelegramChatsResponse, TelegramMessagesResponse,
  XMentionsResponse, TokenResponse, ListKnowledgeParams, GetKnowledgeItemParams,
  ListAssetsParams, ListTelegramChatsParams, ListTelegramMessagesParams,
  ListXMentionsParams,
} from "./types.js";

export interface ClaireOptions {
  /** A workspace-scoped developer key. Never expose it in browser code. */
  apiKey: string;
  /** Full API base URL, including /api/v1. Only trusted servers should be used. */
  baseUrl?: string;
  /** Whole-request deadline, including reading the response body. Default: 30 seconds. */
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface HTTPMetadata {
  status: number;
  requestId: string | null;
  etag: string | null;
  headers: Headers;
}

export type SDKResponse<T> = T & { http: HTTPMetadata };

function timeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new TypeError("timeoutMs must be an integer between 1 and 2147483647.");
  }
  return value;
}

function resourceId(id: string): string {
  if (typeof id !== "string" || !id.trim() || id === "." || id === "..") {
    throw new TypeError("A non-empty resource ID is required.");
  }
  return encodeURIComponent(id);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Server-side, read-only client. One request per call; no retries or private cache. */
export class Claire {
  #apiKey: string;
  #baseUrl: string;
  #timeoutMs: number;
  #fetch: typeof globalThis.fetch;

  constructor(options: ClaireOptions) {
    if (typeof options?.apiKey !== "string" || !options.apiKey || /\s/.test(options.apiKey)) {
      throw new TypeError("apiKey must be a non-empty key without whitespace.");
    }
    const url = new URL(options.baseUrl ?? "https://app.tryclaire.net/api/v1");
    const localHTTP = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localHTTP) || url.username || url.password || url.search || url.hash) {
      throw new TypeError("baseUrl must use HTTPS (or loopback HTTP), without credentials, query, or fragment.");
    }
    this.#apiKey = options.apiKey;
    this.#baseUrl = url.href.replace(/\/+$/, "") + "/";
    this.#timeoutMs = timeout(options.timeoutMs ?? 30_000);
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  readonly context = {
    get: (options?: RequestOptions) => this.#get<ContextResponse>("context", {}, options),
  };

  readonly knowledge = {
    list: (query: ListKnowledgeParams = {}, options?: RequestOptions) =>
      this.#get<KnowledgeListResponse>("knowledge", query, options),
    get: (id: string, query: GetKnowledgeItemParams = {}, options?: RequestOptions) =>
      this.#get<KnowledgeItemResponse>(`knowledge/${resourceId(id)}`, query, options),
  };

  readonly assets = {
    list: (query: ListAssetsParams = {}, options?: RequestOptions) =>
      this.#get<AssetsResponse>("assets", query, options),
    get: (id: string, options?: RequestOptions) =>
      this.#get<AssetResponse>(`assets/${resourceId(id)}`, {}, options),
  };

  readonly telegram = {
    chats: {
      list: (query: ListTelegramChatsParams = {}, options?: RequestOptions) =>
        this.#get<TelegramChatsResponse>("telegram/chats", query, options),
    },
    messages: {
      /** chatId is Claire's chat UUID, not Telegram's numeric chat ID. */
      list: (chatId: string, query: ListTelegramMessagesParams = {}, options?: RequestOptions) =>
        this.#get<TelegramMessagesResponse>(`telegram/chats/${resourceId(chatId)}/messages`, query, options),
    },
  };

  readonly x = {
    mentions: {
      list: (query: ListXMentionsParams = {}, options?: RequestOptions) =>
        this.#get<XMentionsResponse>("x/mentions", query, options),
    },
  };

  readonly token = {
    get: (options?: RequestOptions) => this.#get<TokenResponse>("token", {}, options),
  };

  async #get<T>(path: string, query: object, options: RequestOptions = {}): Promise<SDKResponse<T>> {
    const url = new URL(path, this.#baseUrl);
    for (const [name, value] of Object.entries(query)) {
      if (value === undefined) continue;
      if (!["string", "number", "boolean"].includes(typeof value) ||
          (typeof value === "number" && !Number.isFinite(value))) {
        throw new TypeError(`Invalid query value for ${name}.`);
      }
      url.searchParams.set(name, String(value));
    }
    const deadline = AbortSignal.timeout(timeout(options.timeoutMs ?? this.#timeoutMs));
    const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
    signal.throwIfAborted();
    const response = await this.#fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.#apiKey}`, Accept: "application/json" },
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal,
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok) throw new ClaireResponseError(response);
    }
    const requestId = response.headers.get("x-request-id");
    if (!response.ok) {
      const error = record(payload) && record(payload.error) ? payload.error : null;
      throw new ClaireAPIError(
        response,
        typeof error?.code === "string" ? error.code : "http_error",
        typeof error?.message === "string" ? error.message : `Claire API request failed (HTTP ${response.status}).`,
        requestId ?? (record(payload) && typeof payload.requestId === "string" ? payload.requestId : null),
      );
    }
    if (response.status !== 200 || !record(payload) || !Object.hasOwn(payload, "data") ||
        !record(payload.meta) || typeof payload.meta.organizationId !== "string" ||
        !record(payload.meta.freshness)) {
      throw new ClaireResponseError(response);
    }
    return {
      ...payload,
      http: { status: response.status, requestId, etag: response.headers.get("etag"), headers: response.headers },
    } as SDKResponse<T>;
  }
}
