import { Context, Effect, Layer } from "effect";
import type { ClassificationResult } from "../types/pr-classification.js";
import { ConfigService } from "./config.js";

/**
 * Check if a file path matches frontend patterns
 * @param filePath - The file path to check
 * @param frontendPatterns - Array of frontend path prefixes
 * @returns true if the path starts with any frontend pattern
 */
export const isFrontendPath = (
  filePath: string,
  frontendPatterns: ReadonlyArray<string>
): boolean => {
  return frontendPatterns.some((pattern) => filePath.startsWith(pattern));
};

/**
 * ClassificationService analyzes changed file paths to classify PRs
 * as frontend, backend, or mixed.
 *
 * Frontend paths: apps/react-webapp, lib/core-ui-system
 * All other paths are considered backend.
 */
export interface ClassificationService {
  /**
   * Classify a PR based on its changed files
   * @param changedFiles - Array of file paths that changed in the PR
   * @returns Effect that resolves to classification result
   */
  readonly classifyPR: (
    changedFiles: ReadonlyArray<string>
  ) => Effect.Effect<ClassificationResult, never>;
}

/**
 * ClassificationService tag for dependency injection
 */
export const ClassificationService = Context.GenericTag<ClassificationService>(
  "@services/ClassificationService"
);

/**
 * Live implementation of ClassificationService
 */
export const ClassificationServiceLive = Layer.effect(
  ClassificationService,
  Effect.gen(function* () {
    const configService = yield* ConfigService;

    return ClassificationService.of({
      classifyPR: (changedFiles: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const config = yield* configService.getConfig.pipe(
            Effect.orElse(() =>
              Effect.succeed({
                repository: "",
                pollingIntervalMinutes: 5,
                claimLabel: "",
                frontendPaths: [],
                skills: { frontend: "", backend: "", mixed: "" },
              })
            )
          );
          const frontendPatterns = config.frontendPaths;

          // Separate files into frontend and backend arrays
          const frontendFiles = changedFiles.filter((file) =>
            isFrontendPath(file, frontendPatterns)
          );
          const backendFiles = changedFiles.filter(
            (file) => !isFrontendPath(file, frontendPatterns)
          );

          const hasFrontend = frontendFiles.length > 0;
          const hasBackend = backendFiles.length > 0;

          // Classify based on which files are present
          if (hasFrontend && hasBackend) {
            return {
              type: "mixed" as const,
              matchedPaths: [...frontendFiles, ...backendFiles],
            };
          }

          if (hasFrontend) {
            return {
              type: "frontend" as const,
              matchedPaths: frontendFiles,
            };
          }

          // Default to backend (including empty case)
          return {
            type: "backend" as const,
            matchedPaths: backendFiles,
          };
        }),
    });
  })
);
