import { Schema } from "@effect/schema";
import { Context, Effect, Config as EffectConfig, Layer } from "effect";
import type { Config } from "../config/schema.js";
import { ConfigSchema } from "../config/schema.js";

/**
 * ConfigService provides access to validated application configuration.
 *
 * Configuration is loaded with the following precedence (highest to lowest):
 * 1. Configuration file (review-rock.config.ts)
 * 2. Environment variables (REVIEW_ROCK_*)
 * 3. Default values
 */
export interface ConfigService {
  /**
   * Get the validated application configuration
   */
  readonly getConfig: Effect.Effect<Config, Error>;
}

/**
 * ConfigService tag for dependency injection
 */
export const ConfigService = Context.GenericTag<ConfigService>("@services/ConfigService");

/**
 * Default configuration values
 */
const defaultConfig: Config = {
  repository: "",
  pollingIntervalMinutes: 5,
  claimLabel: "review-rock-claimed",
  frontendPaths: [],
  skills: {
    frontend: "",
    backend: "",
    mixed: "",
  },
};

/**
 * Load configuration from environment variables with REVIEW_ROCK_ prefix
 */
const loadFromEnv = Effect.gen(function* () {
  const repository = yield* EffectConfig.string("REVIEW_ROCK_REPOSITORY").pipe(
    Effect.catchAll(() => Effect.succeed(defaultConfig.repository))
  );

  const pollingIntervalMinutes = yield* EffectConfig.number(
    "REVIEW_ROCK_POLLING_INTERVAL_MINUTES"
  ).pipe(Effect.catchAll(() => Effect.succeed(defaultConfig.pollingIntervalMinutes)));

  const claimLabel = yield* EffectConfig.string("REVIEW_ROCK_CLAIM_LABEL").pipe(
    Effect.catchAll(() => Effect.succeed(defaultConfig.claimLabel))
  );

  const frontendPathsStr = yield* EffectConfig.string("REVIEW_ROCK_FRONTEND_PATHS").pipe(
    Effect.catchAll(() => Effect.succeed(""))
  );
  const frontendPaths = frontendPathsStr
    ? frontendPathsStr.split(",")
    : defaultConfig.frontendPaths;

  const frontendSkill = yield* EffectConfig.string("REVIEW_ROCK_SKILL_FRONTEND").pipe(
    Effect.catchAll(() => Effect.succeed(defaultConfig.skills.frontend))
  );

  const backendSkill = yield* EffectConfig.string("REVIEW_ROCK_SKILL_BACKEND").pipe(
    Effect.catchAll(() => Effect.succeed(defaultConfig.skills.backend))
  );

  const mixedSkill = yield* EffectConfig.string("REVIEW_ROCK_SKILL_MIXED").pipe(
    Effect.catchAll(() => Effect.succeed(defaultConfig.skills.mixed))
  );

  return {
    repository,
    pollingIntervalMinutes,
    claimLabel,
    frontendPaths,
    skills: {
      frontend: frontendSkill,
      backend: backendSkill,
      mixed: mixedSkill,
    },
  };
});

/**
 * Validate configuration against schema
 */
const validateConfig = (config: unknown): Effect.Effect<Config, Error> => {
  return Effect.try({
    try: () => Schema.decodeUnknownSync(ConfigSchema)(config),
    catch: (error) => new Error(`Configuration validation failed: ${error}`),
  });
};

/**
 * Live implementation of ConfigService
 *
 * Loads configuration from environment variables and validates against schema.
 */
export const ConfigServiceLive = Layer.succeed(
  ConfigService,
  ConfigService.of({
    getConfig: Effect.gen(function* () {
      // Load configuration from environment
      const envConfig = yield* loadFromEnv;

      // Validate configuration
      const validatedConfig = yield* validateConfig(envConfig);

      return validatedConfig;
    }),
  })
);
