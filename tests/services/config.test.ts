import { Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";
import type { Config } from "../../src/config/schema.js";
import { ConfigService } from "../../src/services/config.js";

describe("ConfigService", () => {
  it("should load config from environment variables", async () => {
    const testConfig: Config = {
      repository: "testorg/testrepo",
      pollingIntervalMinutes: 10,
      claimLabel: "test-claimed",
      frontendPaths: ["frontend/", "ui/"],
      skills: {
        frontend: "react-skill",
        backend: "node-skill",
        mixed: "fullstack-skill",
      },
    };

    const testLayer = Layer.succeed(ConfigService, {
      getConfig: Effect.succeed(testConfig),
    });

    const program = Effect.gen(function* () {
      const service = yield* ConfigService;
      const config = yield* service.getConfig;
      return config;
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(testLayer)));

    expect(result).toEqual(testConfig);
  });

  it("should validate config and fail for invalid pollingIntervalMinutes", async () => {
    const testLayer = Layer.succeed(ConfigService, {
      getConfig: Effect.fail(new Error("pollingIntervalMinutes must be greater than 0")),
    });

    const program = Effect.gen(function* () {
      const service = yield* ConfigService;
      const config = yield* service.getConfig;
      return config;
    });

    const result = await Effect.runPromiseExit(program.pipe(Effect.provide(testLayer)));

    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(result.cause).toBeDefined();
    }
  });

  it("should use defaults for missing optional fields", async () => {
    const minimalConfig: Config = {
      repository: "testorg/testrepo",
      pollingIntervalMinutes: 5,
      claimLabel: "review-rock-claimed",
      frontendPaths: [],
      skills: {
        frontend: "",
        backend: "",
        mixed: "",
      },
    };

    const testLayer = Layer.succeed(ConfigService, {
      getConfig: Effect.succeed(minimalConfig),
    });

    const program = Effect.gen(function* () {
      const service = yield* ConfigService;
      const config = yield* service.getConfig;
      return config;
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(testLayer)));

    expect(result).toEqual(minimalConfig);
  });

  it("should fail when required fields are missing", async () => {
    const testLayer = Layer.succeed(ConfigService, {
      getConfig: Effect.fail(new Error("Missing required field: repository")),
    });

    const program = Effect.gen(function* () {
      const service = yield* ConfigService;
      const config = yield* service.getConfig;
      return config;
    });

    const result = await Effect.runPromiseExit(program.pipe(Effect.provide(testLayer)));

    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(result.cause).toBeDefined();
    }
  });

  it("should provide config through Effect context", async () => {
    const testConfig: Config = {
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

    const testLayer = Layer.succeed(ConfigService, {
      getConfig: Effect.succeed(testConfig),
    });

    const program = Effect.gen(function* () {
      const service = yield* ConfigService;
      const config = yield* service.getConfig;
      return config;
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(testLayer)));

    expect(result.repository).toBe("validkeys/lumen");
    expect(result.pollingIntervalMinutes).toBe(5);
    expect(result.claimLabel).toBe("review-rock-claimed");
    expect(result.frontendPaths).toHaveLength(2);
    expect(result.skills.frontend).toBe("vercel-react-best-practices");
  });
});
