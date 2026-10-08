type QueryValue = string | number | boolean | undefined | null;
type QueryParams = Record<string, QueryValue>;

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3002/api";

declare global {
  interface Window {
    retailCore?: {
      apiBaseUrl?: string;
      printer?: {
        listPrinters: () => Promise<
          Array<{
            name: string;
            displayName: string;
            isDefault: boolean;
            recommended: boolean;
          }>
        >;
        getSettings: () => Promise<{
          mode: "system-dialog" | "silent";
          deviceName: string | null;
          paperWidthMm: 58;
        }>;
        saveSettings: (settings: {
          mode?: "system-dialog" | "silent";
          deviceName?: string | null;
          paperWidthMm?: 58;
        }) => Promise<{
          mode: "system-dialog" | "silent";
          deviceName: string | null;
          paperWidthMm: 58;
        }>;
        printSaleReceipt: (request: {
          saleId: string;
          source: "new-sale" | "history";
        }) => Promise<{ ok: true }>;
        saveSaleReceiptPdf: (request: {
          saleId: string;
          source: "new-sale" | "history";
        }) => Promise<
          | {
              ok: true;
              filePath: string;
            }
          | {
              ok: false;
              canceled: true;
            }
        >;
      };
    };
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getApiBaseUrl(): string {
  const desktopApiBaseUrl =
    typeof window === "undefined" ? undefined : window.retailCore?.apiBaseUrl;

  return (
    desktopApiBaseUrl ??
    import.meta.env.VITE_API_BASE_URL ??
    getBrowserApiBaseUrl() ??
    DEFAULT_API_BASE_URL
  ).replace(/\/$/, "");
}

function getBrowserApiBaseUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const location = (window as { location?: Location }).location;
  if (!location) return undefined;
  if (location.protocol !== "http:" && location.protocol !== "https:") {
    return undefined;
  }

  return `${location.origin}/api`;
}

function buildUrl(path: string, query?: QueryParams): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${getApiBaseUrl()}${normalizedPath}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function request<T>(
  path: string,
  options: RequestInit & { query?: QueryParams } = {},
): Promise<T> {
  const { query, headers, body, ...init } = options;
  const response = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body,
  });

  if (!response.ok) {
    let details: unknown;
    try {
      details = await response.json();
    } catch {
      details = undefined;
    }

    const message =
      typeof details === "object" && details !== null && "message" in details
        ? String((details as { message: unknown }).message)
        : `Error HTTP ${response.status}`;

    throw new ApiError(message, response.status, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  get<T>(path: string, query?: QueryParams): Promise<T> {
    return request<T>(path, { method: "GET", query });
  },

  post<T>(path: string, payload?: unknown): Promise<T> {
    return request<T>(path, {
      method: "POST",
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  },

  upload<T>(path: string, file: File, query?: QueryParams): Promise<T> {
    return request<T>(path, {
      method: "POST",
      query,
      body: file,
      headers: { "Content-Type": "application/vnd.sqlite3" },
    });
  },

  patch<T>(path: string, payload?: unknown): Promise<T> {
    return request<T>(path, {
      method: "PATCH",
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  },

  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: "DELETE" });
  },
};
