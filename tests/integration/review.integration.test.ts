import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("ReviewService Integration (Mock claudecode)", () => {
  // Helper to get path to mock script
  const getMockScriptPath = () => {
    return `${process.cwd()}/tests/fixtures/mock-claudecode.sh`;
  };

  it("should successfully execute mock claudecode and get review output", () => {
    const mockScriptPath = getMockScriptPath();
    const result = execSync(`${mockScriptPath} skill test-skill`, { encoding: "utf-8" });

    expect(result).toContain("Code Review for test-skill");
    expect(result).toContain("mock review");
    expect(result).toContain("Everything looks good");
  });

  it("should detect AWS token expiry error from mock script", () => {
    const mockScriptPath = getMockScriptPath();

    try {
      execSync(`${mockScriptPath} skill test-skill`, {
        encoding: "utf-8",
        env: { ...process.env, MOCK_TOKEN_EXPIRED: "1" },
      });
      // Should not reach here
      expect.fail("Expected command to fail");
    } catch (error: unknown) {
      const err = error as { stderr: Buffer };
      const stderr = err.stderr.toString();
      expect(stderr.toLowerCase()).toContain("token has expired");
    }
  });

  it("should detect skill not found error from mock script", () => {
    const mockScriptPath = getMockScriptPath();

    try {
      execSync(`${mockScriptPath} skill unknown-skill`, {
        encoding: "utf-8",
        env: { ...process.env, MOCK_SKILL_NOT_FOUND: "1" },
      });
      expect.fail("Expected command to fail");
    } catch (error: unknown) {
      const err = error as { stderr: Buffer };
      const stderr = err.stderr.toString();
      expect(stderr.toLowerCase()).toContain("skill not found");
    }
  });

  it("should handle generic command errors from mock script", () => {
    const mockScriptPath = getMockScriptPath();

    try {
      execSync(`${mockScriptPath} skill test-skill`, {
        encoding: "utf-8",
        env: { ...process.env, MOCK_COMMAND_ERROR: "1" },
      });
      expect.fail("Expected command to fail");
    } catch (error: unknown) {
      const err = error as { stderr: Buffer };
      const stderr = err.stderr.toString();
      expect(stderr).toContain("Command execution failed");
    }
  });
});
