import { formatBytes } from "./formatBytes";

describe("formatBytes", () => {
  it("shows small files in whole kilobytes, never as 0", () => {
    expect(formatBytes(3 * 1024, "de")).toBe("3 KB");
    expect(formatBytes(10, "de")).toBe("1 KB");
  });

  it("shows larger files in megabytes with one decimal", () => {
    expect(formatBytes(1_843_200, "de")).toBe("1,8 MB");
    expect(formatBytes(20 * 1024 * 1024, "en")).toBe("20 MB");
  });
});
