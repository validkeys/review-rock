import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { Config } from "../../src/config/schema.js";
import {
  ClassificationService,
  makeClassificationServiceLayer,
} from "../../src/services/classification.js";

describe("ClassificationService Integration", () => {
  const testConfig: Config = {
    repository: "test/repo",
    pollingIntervalMinutes: 5,
    labels: {
      readyForReview: "ready-for-review",
      reviewInProgress: "review-in-progress",
      reviewRefactorRequired: "review-refactor-required",
      reviewApproved: "review-approved",
    },
    frontendPaths: ["apps/react-webapp", "lib/core-ui-system"],
    skills: {
      frontend: "frontend-skill",
      backend: "backend-skill",
      mixed: "mixed-skill",
    },
  };
  it("should classify frontend paths from real config", async () => {
    const program = Effect.gen(function* () {
      const service = yield* ClassificationService;
      const result = yield* service.classifyPR([
        "apps/react-webapp/src/App.tsx",
        "apps/react-webapp/src/components/Header.tsx",
      ]);
      return result;
    });

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(makeClassificationServiceLayer(testConfig)))
    );

    expect(result.type).toBe("frontend");
    expect(result.matchedPaths).toEqual([
      "apps/react-webapp/src/App.tsx",
      "apps/react-webapp/src/components/Header.tsx",
    ]);
  });

  it("should classify lib/core-ui-system paths from real config", async () => {
    const program = Effect.gen(function* () {
      const service = yield* ClassificationService;
      const result = yield* service.classifyPR([
        "lib/core-ui-system/components/Button.tsx",
        "lib/core-ui-system/components/Input/index.tsx",
      ]);
      return result;
    });

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(makeClassificationServiceLayer(testConfig)))
    );

    expect(result.type).toBe("frontend");
    expect(result.matchedPaths).toEqual([
      "lib/core-ui-system/components/Button.tsx",
      "lib/core-ui-system/components/Input/index.tsx",
    ]);
  });

  it("should classify backend paths from real config", async () => {
    const program = Effect.gen(function* () {
      const service = yield* ClassificationService;
      const result = yield* service.classifyPR([
        "apps/api/src/routes/user.ts",
        "package.json",
        "src/services/database.ts",
      ]);
      return result;
    });

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(makeClassificationServiceLayer(testConfig)))
    );

    expect(result.type).toBe("backend");
    expect(result.matchedPaths).toEqual([
      "apps/api/src/routes/user.ts",
      "package.json",
      "src/services/database.ts",
    ]);
  });

  it("should classify mixed PR from real config", async () => {
    const program = Effect.gen(function* () {
      const service = yield* ClassificationService;
      const result = yield* service.classifyPR([
        "apps/react-webapp/src/App.tsx",
        "lib/core-ui-system/Button.tsx",
        "apps/api/src/routes/user.ts",
        "package.json",
      ]);
      return result;
    });

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(makeClassificationServiceLayer(testConfig)))
    );

    expect(result.type).toBe("mixed");
    expect(result.matchedPaths).toEqual([
      "apps/react-webapp/src/App.tsx",
      "lib/core-ui-system/Button.tsx",
      "apps/api/src/routes/user.ts",
      "package.json",
    ]);
  });
});
