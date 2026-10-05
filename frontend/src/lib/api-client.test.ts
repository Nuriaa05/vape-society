import { afterEach, describe, expect, it, vi } from "vitest";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

function mockJsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("api client runtime configuration", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("uses the apiBaseUrl exposed by desktop preload when available", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        retailCore: {
          apiBaseUrl: "http://127.0.0.1:48123/api",
        },
      },
    });
    const fetchMock = vi.fn(() => mockJsonResponse({ ok: true }));
    globalThis.fetch = fetchMock;

    const { apiClient } = await import("./api-client");
    await apiClient.get("/health");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:48123/api/health",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("uses the current HTTP origin when running in a local browser", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          origin: "http://localhost:4100",
          protocol: "http:",
        },
      },
    });

    const { getApiBaseUrl } = await import("./api-client");

    expect(getApiBaseUrl()).toBe("http://localhost:4100/api");
  });

  it("falls back safely when a partial browser mock has no location", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });

    const { getApiBaseUrl } = await import("./api-client");

    expect(getApiBaseUrl()).toBe("http://127.0.0.1:3002/api");
  });
});
