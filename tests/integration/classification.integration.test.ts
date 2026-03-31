import { Effect, Layer } from "effect";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ClassificationService,
  ClassificationServiceLive,
} from "../../src/services/classification.js";
import { ConfigServiceLive } from "../../src/services/config.js";

describe("ClassificationService Integration", () => {
  beforeAll(() => {
    // Set up environment variables for real config testing
    process.env.REVIEW_ROCK_FRONTEND_PATHS = "apps/react-webapp,lib/core-ui-system";
  });
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
      program.pipe(Effect.provide(ClassificationServiceLive.pipe(Layer.provide(ConfigServiceLive))))
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
      program.pipe(Effect.provide(ClassificationServiceLive.pipe(Layer.provide(ConfigServiceLive))))
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
      program.pipe(Effect.provide(ClassificationServiceLive.pipe(Layer.provide(ConfigServiceLive))))
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
      program.pipe(Effect.provide(ClassificationServiceLive.pipe(Layer.provide(ConfigServiceLive))))
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
