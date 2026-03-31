import { describe, expect, it } from "vitest";
import { reviewRockCommand } from "../../src/cli/command.js";

describe("CLI Command Definition", () => {
  it("should be a valid Command instance", () => {
    expect(reviewRockCommand).toBeDefined();
    // @effect/cli Command objects are internal structures
    // Best way to test is to verify it's the right type
    expect(typeof reviewRockCommand).toBe("object");
  });

  it("should be importable and usable", () => {
    // If the command is properly defined, it should be importable
    // The actual execution will be tested in integration tests
    expect(reviewRockCommand).toBeTruthy();
  });
});
