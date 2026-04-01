import { Schema } from "@effect/schema";
import { describe, expect, it } from "vitest";
import { ConfigSchema } from "../../src/config/schema.js";

describe("ConfigSchema", () => {
  it("should validate a valid configuration", () => {
    const validConfig = {
      repository: "validkeys/lumen",
      pollingIntervalMinutes: 5,
      labels: {
        readyForReview: "ready-for-review",
        reviewInProgress: "review-in-progress",
        reviewRefactorRequired: "review-refactor-required",
        reviewApproved: "review-approved",
      },
      frontendPaths: ["apps/react-webapp", "lib/core-ui-system"],
      skills: {
        frontend: "vercel-react-best-practices",
        backend: "typescript-expert",
        mixed: "vercel-react-best-practices,typescript-expert",
      },
    };

    const result = Schema.decodeUnknownSync(ConfigSchema)(validConfig);
    expect(result).toEqual({
      ...validConfig,
      enableTeamsNotifications: false,
    });
  });

  it("should fail validation for pollingIntervalMinutes <= 0", () => {
    const invalidConfig = {
      repository: "validkeys/lumen",
      pollingIntervalMinutes: 0,
      labels: {
        readyForReview: "ready-for-review",
        reviewInProgress: "review-in-progress",
        reviewRefactorRequired: "review-refactor-required",
        reviewApproved: "review-approved",
      },
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
      labels: {
        readyForReview: "ready-for-review",
        reviewInProgress: "review-in-progress",
        reviewRefactorRequired: "review-refactor-required",
        reviewApproved: "review-approved",
      },
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
      labels: {
        readyForReview: "ready-for-review",
        reviewInProgress: "review-in-progress",
        reviewRefactorRequired: "review-refactor-required",
        reviewApproved: "review-approved",
      },
    };

    expect(() => {
      Schema.decodeUnknownSync(ConfigSchema)(incompleteConfig);
    }).toThrow();
  });

  it("should fail validation for missing repository", () => {
    const incompleteConfig = {
      pollingIntervalMinutes: 5,
      labels: {
        readyForReview: "ready-for-review",
        reviewInProgress: "review-in-progress",
        reviewRefactorRequired: "review-refactor-required",
        reviewApproved: "review-approved",
      },
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
      labels: {
        readyForReview: "ready-for-review",
        reviewInProgress: "review-in-progress",
        reviewRefactorRequired: "review-refactor-required",
        reviewApproved: "review-approved",
      },
      frontendPaths: [],
      skills: {
        frontend: "",
        backend: "",
        mixed: "",
      },
    };

    const result = Schema.decodeUnknownSync(ConfigSchema)(minimalConfig);
    expect(result).toEqual({
      ...minimalConfig,
      enableTeamsNotifications: false,
    });
  });
});
