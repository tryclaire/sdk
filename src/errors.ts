function retryDelay(value: string | null): number | null {
  if (value === null) return null;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : null;
}

/** A non-success HTTP response. Requests are never retried automatically. */
export class ClaireAPIError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;
  readonly headers: Headers;

  constructor(response: Response, code: string, message: string, requestId: string | null) {
    super(message);
    this.name = "ClaireAPIError";
    this.status = response.status;
    this.code = code;
    this.requestId = requestId;
    this.retryAfterSeconds = retryDelay(response.headers.get("retry-after"));
    this.headers = response.headers;
  }
}

/** A successful HTTP response that is not a Claire JSON envelope. */
export class ClaireResponseError extends Error {
  readonly status: number;
  readonly requestId: string | null;

  constructor(response: Response) {
    super("The server returned an invalid Claire API response.");
    this.name = "ClaireResponseError";
    this.status = response.status;
    this.requestId = response.headers.get("x-request-id");
  }
}
