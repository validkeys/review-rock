import { Schema } from "@effect/schema";
import { describe, expect, it } from "vitest";
import { ConfigSchema } from "../../src/config/schema.js";

describe("ConfigSchema", () => {
  it("should validate a valid configuration", () => {
    const validConfig = {
      repository: "validkeys/lumen",
      pollingIntervalMinutes: 5,
      claimLabel: "review-rock-claimed",
      frontendPaths: ["apps/react-webapp", "lib/core-ui-system"],
      skills: {
        frontend: "vercel-react-best-practices",
        backend: "typescript-expert",
        mixed: "vercel-react-best-practices,typescript-expert",
      },
    };

    const result = Schema.decodeUnknownSync(ConfigSchema)(validConfig);
    expect(result).toEqual(validConfig);
  });

  it("should fail validation for pollingIntervalMinutes <= 0", () => {
    const invalidConfig = {
      repository: "validkeys/lumen",
      pollingIntervalMinutes: 0,
      claimLabel: "review-rock-claimed",
      frontendPaths: ["apps/react-webapp"],
      skills: {
        frontend: "vercel-react-best-practices",
        backend: "typescript-expert",
        mixed: "vercel-react-best-practices,typescript-expert",
      },
    };

    expect(() => {
      Schema.decodeUnknownSync(ConfigSchema)(invalidConfig);
    }).toThrow();
  });

  it("should fail validation for negative pollingIntervalMinutes", () => {
    const invalidConfig = {
      repository: "validkeys/lumen",
      pollingIntervalMinutes: -5,
      claimLabel: "review-rock-claimed",
      frontendPaths: ["apps/react-webapp"],
      skills: {
        frontend: "vercel-react-best-practices",
        backend: "typescript-expert",
        mixed: "vercel-react-best-practices,typescript-expert",
      },
    };

    expect(() => {
      Schema.decodeUnknownSync(ConfigSchema)(invalidConfig);
    }).toThrow();
  });

  it("should fail validation for missing required fields", () => {
    const incompleteConfig = {
      repository: "validkeys/lumen",
      // missing pollingIntervalMinutes
      claimLabel: "review-rock-claimed",
    };

    expect(() => {
      Schema.decodeUnknownSync(ConfigSchema)(incompleteConfig);
    }).toThrow();
  });

  it("should fail validation for missing repository", () => {
    const incompleteConfig = {
      pollingIntervalMinutes: 5,
      claimLabel: "review-rock-claimed",
      frontendPaths: ["apps/react-webapp"],
      skills: {
        frontend: "vercel-react-best-practices",
        backend: "typescript-expert",
        mixed: "vercel-react-best-practices,typescript-expert",
      },
    };

    expect(() => {
      Schema.decodeUnknownSync(ConfigSchema)(incompleteConfig);
    }).toThrow();
  });

  it("should validate with minimal required fields", () => {
    const minimalConfig = {
      repository: "validkeys/lumen",
      pollingIntervalMinutes: 10,
      claimLabel: "claimed",
      frontendPaths: [],
      skills: {
        frontend: "",
        backend: "",
        mixed: "",
      },
    };

    const result = Schema.decodeUnknownSync(ConfigSchema)(minimalConfig);
    expect(result).toEqual(minimalConfig);
  });
});
