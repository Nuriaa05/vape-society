import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { backupsRepository } from "./backups-repository";

describe("database import repository", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("uploads the original file as SQLite without JSON encoding", async () => {
    const file = new File(["SQLite format 3\0"], "respaldo.db");
    const preview = { id: "import-1", counts: { products: 10 } };
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(preview));

    await expect(backupsRepository.validateImport(file)).resolves.toEqual(
      preview,
    );

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("/api/backups/import/validate");
    expect(options).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/vnd.sqlite3" },
    });
    expect(options?.body).toBe(file);
  });

  it("sends explicit confirmation for the validated upload", async () => {
    const result = { imported: true, safetyBackup: { filename: "previo.db" } };
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(result));

    await expect(backupsRepository.confirmImport("import-1")).resolves.toEqual(
      result,
    );

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("/api/backups/import/import-1/confirm");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(String(options?.body))).toEqual({ confirmed: true });
  });

  it("discards the temporary upload when the user cancels", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      backupsRepository.discardImport("import-1"),
    ).resolves.toBeUndefined();

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("/api/backups/import/import-1");
    expect(options?.method).toBe("DELETE");
  });
});
