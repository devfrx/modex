/**
 * Error handling utilities for type-safe error handling
 */

/**
 * Type for caught errors (unknown by default in TypeScript strict mode)
 */
export type CaughtError = unknown;

/**
 * Type guard to check if error is an Error instance
 */
export function isError(error: CaughtError): error is Error {
  return error instanceof Error;
}

/**
 * Type guard to check if error has a message property
 */
export function hasMessage(error: CaughtError): error is { message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  );
}

/**
 * Type guard to check if error has a code property (Node.js style)
 */
export function hasCode(error: CaughtError): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  );
}

/**
 * Extract error message from any caught error
 */
export function getErrorMessage(error: CaughtError): string {
  if (isError(error)) {
    return error.message;
  }
  if (hasMessage(error)) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error occurred";
}

/**
 * Extract error code if available (Node.js style errors)
 */
export function getErrorCode(error: CaughtError): string | undefined {
  if (hasCode(error)) {
    return error.code;
  }
  return undefined;
}

/**
 * Convert any caught error to a standardized error object
 */
export function normalizeError(error: CaughtError): Error {
  if (isError(error)) {
    return error;
  }
  const message = getErrorMessage(error);
  const normalizedError = new Error(message);
  
  // Preserve stack if available
  if (
    typeof error === "object" &&
    error !== null &&
    "stack" in error &&
    typeof (error as { stack: unknown }).stack === "string"
  ) {
    normalizedError.stack = (error as { stack: string }).stack;
  }
  
  return normalizedError;
}

/**
 * Type-safe error handler wrapper
 * 
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   const { message, code } = handleCatchError(error);
 *   console.error(`Error [${code}]: ${message}`);
 * }
 * ```
 */
export function handleCatchError(error: CaughtError): {
  message: string;
  code?: string;
  original: CaughtError;
} {
  return {
    message: getErrorMessage(error),
    code: getErrorCode(error),
    original: error,
  };
}

/**
 * Create a typed error with additional context
 */
export class TypedError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "TypedError";
  }
}

/**
 * Network/API error with status code
 */
export class ApiError extends TypedError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    context?: Record<string, unknown>
  ) {
    super(message, `HTTP_${statusCode ?? "UNKNOWN"}`, context);
    this.name = "ApiError";
  }
}

/**
 * File system operation error
 */
export class FileSystemError extends TypedError {
  constructor(
    message: string,
    public readonly path: string,
    code?: string,
    context?: Record<string, unknown>
  ) {
    super(message, code ?? "FS_ERROR", { ...context, path });
    this.name = "FileSystemError";
  }
}

/**
 * Validation error for invalid input
 */
export class ValidationError extends TypedError {
  constructor(
    message: string,
    public readonly field?: string,
    context?: Record<string, unknown>
  ) {
    super(message, "VALIDATION_ERROR", { ...context, field });
    this.name = "ValidationError";
  }
}
