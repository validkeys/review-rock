/**
 * Type of PR based on changed files
 */
export type PRType = "frontend" | "backend" | "mixed";

/**
 * Result of PR classification
 */
export interface ClassificationResult {
  readonly type: PRType;
  readonly matchedPaths: ReadonlyArray<string>;
}
