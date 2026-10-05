import { appConfig } from "../src/config/app.config";

describe("appConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("allows PORT=0 so desktop can receive an OS-assigned loopback port", () => {
    process.env.PORT = "0";

    expect(appConfig().port).toBe(0);
  });

});
