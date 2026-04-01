import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { Config } from "../../src/config/schema.js";
import {
  ClassificationService,
  isFrontendPath,
  makeClassificationServiceLayer,
} from "../../src/services/classification.js";

describe("ClassificationService", () => {
  describe("interface", () => {
    it("should have classifyPR method", () => {
      // Test stub - interface is defined
      expect(ClassificationService).toBeDefined();
    });
  });

  describe("isFrontendPath", () => {
    const frontendPatterns = ["apps/react-webapp", "lib/core-ui-system"];

    it("should identify apps/react-webapp path as frontend", () => {
      const result = isFrontendPath("apps/react-webapp/src/App.tsx", frontendPatterns);
      expect(result).toBe(true);
    });

    it("should identify lib/core-ui-system path as frontend", () => {
      const result = isFrontendPath("lib/core-ui-system/Button.tsx", frontendPatterns);
      expect(result).toBe(true);
    });

    it("should identify nested react-webapp path as frontend", () => {
      const result = isFrontendPath(
        "apps/react-webapp/src/components/Button.tsx",
        frontendPatterns
      );
      expect(result).toBe(true);
    });

    it("should identify nested core-ui-system path as frontend", () => {
      const result = isFrontendPath(
        "lib/core-ui-system/components/Button/index.tsx",
        frontendPatterns
      );
      expect(result).toBe(true);
    });

    it("should NOT identify backend path as frontend", () => {
      const result = isFrontendPath("src/services/api.ts", frontendPatterns);
      expect(result).toBe(false);
    });

    it("should NOT identify apps/api path as frontend", () => {
      const result = isFrontendPath("apps/api/routes.ts", frontendPatterns);
      expect(result).toBe(false);
    });

    it("should handle empty path", () => {
      const result = isFrontendPath("", frontendPatterns);
      expect(result).toBe(false);
    });

    it("should handle path that partially matches", () => {
      // "apps/react" does not start with "apps/react-webapp"
      const result = isFrontendPath("apps/react/file.ts", frontendPatterns);
      expect(result).toBe(false);
    });
  });

  describe("classifyPR", () => {
    const mockConfig: Config = {
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

    const testLayer = makeClassificationServiceLayer(mockConfig);

    it("should classify frontend-only PR", async () => {
      const program = Effect.gen(function* () {
        const service = yield* ClassificationService;
        const result = yield* service.classifyPR([
          "apps/react-webapp/src/App.tsx",
          "lib/core-ui-system/Button.tsx",
        ]);
        return result;
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(testLayer)));

      expect(result.type).toBe("frontend");
      expect(result.matchedPaths).toEqual([
        "apps/react-webapp/src/App.tsx",
        "lib/core-ui-system/Button.tsx",
      ]);
    });

    it("should classify backend-only PR", async () => {
      const program = Effect.gen(function* () {
        const service = yield* ClassificationService;
        const result = yield* service.classifyPR([
          "src/services/api.ts",
          "apps/api/routes.ts",
          "package.json",
        ]);
        return result;
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(testLayer)));

      expect(result.type).toBe("backend");
      expect(result.matchedPaths).toEqual([
        "src/services/api.ts",
        "apps/api/routes.ts",
        "package.json",
      ]);
    });

    it("should classify mixed PR", async () => {
      const program = Effect.gen(function* () {
        const service = yield* ClassificationService;
        const result = yield* service.classifyPR([
          "apps/react-webapp/src/App.tsx",
          "src/services/api.ts",
          "lib/core-ui-system/Button.tsx",
          "apps/api/routes.ts",
        ]);
        return result;
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(testLayer)));

      expect(result.type).toBe("mixed");
      expect(result.matchedPaths).toEqual([
        "apps/react-webapp/src/App.tsx",
        "lib/core-ui-system/Button.tsx",
        "src/services/api.ts",
        "apps/api/routes.ts",
      ]);
    });

    it("should handle empty file list", async () => {
      const program = Effect.gen(function* () {
        const service = yield* ClassificationService;
        const result = yield* service.classifyPR([]);
        return result;
      });

      const result = await Effect.runPromise(program.pipe(Effect.provide(testLayer)));

      expect(result.type).toBe("backend");
      expect(result.matchedPaths).toEqual([]);
    });
  });
});
