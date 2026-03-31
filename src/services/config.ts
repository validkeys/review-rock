import { Schema } from "@effect/schema";
import { Context, Effect, Layer } from "effect";
import * as path from "node:path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
import type { Config } from "../config/schema.js";
import { ConfigSchema } from "../config/schema.js";

/**
 * ConfigService provides access to validated application configuration.
 *
 * Configuration is loaded from review-rock.config.ts file in the current directory.
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
 * Create ConfigService layer from a preloaded config
 */
export const makeConfigServiceLayer = (config: Config): Layer.Layer<ConfigService> =>
  Layer.succeed(
    ConfigService,
    ConfigService.of({
      getConfig: Effect.succeed(config),
    })
  );

/**
 * RepositoryService provides access to the configured repository
 */
export interface RepositoryService {
  readonly getRepository: Effect.Effect<string>;
}

export const RepositoryService = Context.GenericTag<RepositoryService>("@services/RepositoryService");

/**
 * Create RepositoryService layer from config
 */
export const makeRepositoryServiceLayer = (config: Config): Layer.Layer<RepositoryService> =>
  Layer.succeed(
    RepositoryService,
    RepositoryService.of({
      getRepository: Effect.succeed(config.repository),
    })
  );

/**
 * Load config from file as a plain Promise for use at startup
 */
export const loadConfig = async (): Promise<Config> => {
  const configPath = path.resolve(process.cwd(), "review-rock.config.ts");

  // Check if file exists
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Configuration file not found: ${configPath}\n\n` +
        `Please create a review-rock.config.ts file in the current directory.\n` +
        `You can copy the example from: node_modules/review-rock/review-rock.config.example.ts`
    );
  }

  // Import the config file using dynamic import
  const fileUrl = pathToFileURL(configPath).href;
  const configModule = await import(fileUrl);

  if (!configModule.default) {
    throw new Error(`Configuration file ${configPath} must have a default export`);
  }

  const config = configModule.default as Config;

  // Validate
  try {
    return Schema.decodeUnknownSync(ConfigSchema)(config);
  } catch (error) {
    throw new Error(`Configuration validation failed: ${error}`);
  }
};
