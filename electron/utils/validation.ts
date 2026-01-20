/**
 * Input validation utilities for IPC handlers
 * 
 * Provides simple runtime validation for IPC parameters
 * without requiring Zod or other heavy validation libraries.
 */

/**
 * Validation error thrown when input is invalid
 */
export class InputValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown
  ) {
    super(message);
    this.name = "InputValidationError";
  }
}

/**
 * Assert that a value is defined (not null/undefined)
 */
export function assertDefined<T>(
  value: T | null | undefined,
  fieldName: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new InputValidationError(
      `${fieldName} is required`,
      fieldName,
      value
    );
  }
}

/**
 * Assert that a value is a non-empty string
 */
export function assertString(
  value: unknown,
  fieldName: string,
  options: { minLength?: number; maxLength?: number; pattern?: RegExp } = {}
): asserts value is string {
  if (typeof value !== "string") {
    throw new InputValidationError(
      `${fieldName} must be a string`,
      fieldName,
      value
    );
  }

  if (options.minLength !== undefined && value.length < options.minLength) {
    throw new InputValidationError(
      `${fieldName} must be at least ${options.minLength} characters`,
      fieldName,
      value
    );
  }

  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw new InputValidationError(
      `${fieldName} must be at most ${options.maxLength} characters`,
      fieldName,
      value
    );
  }

  if (options.pattern && !options.pattern.test(value)) {
    throw new InputValidationError(
      `${fieldName} has invalid format`,
      fieldName,
      value
    );
  }
}

/**
 * Assert that a value is a non-empty string (shorthand)
 */
export function assertNonEmptyString(
  value: unknown,
  fieldName: string
): asserts value is string {
  assertString(value, fieldName, { minLength: 1 });
}

/**
 * Assert that a value is a number
 */
export function assertNumber(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
): asserts value is number {
  if (typeof value !== "number" || isNaN(value)) {
    throw new InputValidationError(
      `${fieldName} must be a number`,
      fieldName,
      value
    );
  }

  if (options.integer && !Number.isInteger(value)) {
    throw new InputValidationError(
      `${fieldName} must be an integer`,
      fieldName,
      value
    );
  }

  if (options.min !== undefined && value < options.min) {
    throw new InputValidationError(
      `${fieldName} must be at least ${options.min}`,
      fieldName,
      value
    );
  }

  if (options.max !== undefined && value > options.max) {
    throw new InputValidationError(
      `${fieldName} must be at most ${options.max}`,
      fieldName,
      value
    );
  }
}

/**
 * Assert that a value is a positive integer
 */
export function assertPositiveInteger(
  value: unknown,
  fieldName: string
): asserts value is number {
  assertNumber(value, fieldName, { min: 1, integer: true });
}

/**
 * Assert that a value is a boolean
 */
export function assertBoolean(
  value: unknown,
  fieldName: string
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new InputValidationError(
      `${fieldName} must be a boolean`,
      fieldName,
      value
    );
  }
}

/**
 * Assert that a value is an array
 */
export function assertArray<T>(
  value: unknown,
  fieldName: string,
  options: { minLength?: number; maxLength?: number } = {}
): asserts value is T[] {
  if (!Array.isArray(value)) {
    throw new InputValidationError(
      `${fieldName} must be an array`,
      fieldName,
      value
    );
  }

  if (options.minLength !== undefined && value.length < options.minLength) {
    throw new InputValidationError(
      `${fieldName} must have at least ${options.minLength} items`,
      fieldName,
      value
    );
  }

  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw new InputValidationError(
      `${fieldName} must have at most ${options.maxLength} items`,
      fieldName,
      value
    );
  }
}

/**
 * Assert that a value is an object (not null, not array)
 */
export function assertObject(
  value: unknown,
  fieldName: string
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InputValidationError(
      `${fieldName} must be an object`,
      fieldName,
      value
    );
  }
}

/**
 * Assert that a value is one of the allowed values
 */
export function assertOneOf<T extends string | number>(
  value: unknown,
  fieldName: string,
  allowedValues: readonly T[]
): asserts value is T {
  if (!allowedValues.includes(value as T)) {
    throw new InputValidationError(
      `${fieldName} must be one of: ${allowedValues.join(", ")}`,
      fieldName,
      value
    );
  }
}

/**
 * Assert that a string is a valid ID format (alphanumeric with dashes/underscores)
 */
export function assertValidId(
  value: unknown,
  fieldName: string
): asserts value is string {
  assertString(value, fieldName, {
    minLength: 1,
    maxLength: 256,
    pattern: /^[a-zA-Z0-9_-]+$/,
  });
}

/**
 * Assert that a string is a valid mod ID format (cf-xxx-xxx or mr-xxx-xxx)
 */
export function assertModId(
  value: unknown,
  fieldName: string
): asserts value is string {
  assertString(value, fieldName, {
    minLength: 1,
    pattern: /^(cf|mr|hytale)-[a-zA-Z0-9_-]+(-[a-zA-Z0-9_-]+)?$/,
  });
}

/**
 * Assert that a string looks like a valid file path
 * (basic sanitization, not full path validation)
 */
export function assertSafePath(
  value: unknown,
  fieldName: string
): asserts value is string {
  assertString(value, fieldName, { minLength: 1, maxLength: 4096 });

  // Check for path traversal attempts
  const normalizedValue = value as string;
  if (
    normalizedValue.includes("..") ||
    normalizedValue.includes("\0") ||
    /^[a-zA-Z]:/.test(normalizedValue) === false &&
      normalizedValue.startsWith("/") === false &&
      normalizedValue.startsWith("\\") === false
  ) {
    // Allow both absolute and relative paths, but prevent obvious traversal
    if (normalizedValue.includes("..")) {
      throw new InputValidationError(
        `${fieldName} contains invalid path characters`,
        fieldName,
        value
      );
    }
  }
}

/**
 * Assert that a value is a valid URL
 */
export function assertUrl(
  value: unknown,
  fieldName: string,
  options: { protocols?: string[] } = {}
): asserts value is string {
  assertString(value, fieldName);

  try {
    const url = new URL(value);
    const protocols = options.protocols || ["http:", "https:"];
    if (!protocols.includes(url.protocol)) {
      throw new InputValidationError(
        `${fieldName} must use one of these protocols: ${protocols.join(", ")}`,
        fieldName,
        value
      );
    }
  } catch (e) {
    if (e instanceof InputValidationError) throw e;
    throw new InputValidationError(
      `${fieldName} must be a valid URL`,
      fieldName,
      value
    );
  }
}

/**
 * Optional value validation - only validates if value is defined
 */
export function optional<T>(
  value: T | null | undefined,
  validate: (value: T) => void
): void {
  if (value !== null && value !== undefined) {
    validate(value);
  }
}

/**
 * Validate an IPC handler's parameters and wrap errors appropriately
 */
export function validateIpcParams<T extends Record<string, unknown>>(
  params: unknown,
  validators: { [K in keyof T]: (value: unknown) => void }
): T {
  assertObject(params, "params");

  const result = {} as T;
  const paramObj = params as Record<string, unknown>;

  for (const [key, validate] of Object.entries(validators)) {
    try {
      validate(paramObj[key]);
      result[key as keyof T] = paramObj[key] as T[keyof T];
    } catch (e) {
      if (e instanceof InputValidationError) {
        throw e;
      }
      throw new InputValidationError(
        `Invalid value for ${key}`,
        key,
        paramObj[key]
      );
    }
  }

  return result;
}

/**
 * Sanitize a string for safe use (remove control characters, etc.)
 */
export function sanitizeString(value: string): string {
  // Remove control characters except newline and tab
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Sanitize a file name (remove path separators and dangerous characters)
 */
export function sanitizeFileName(value: string): string {
  return value
    .replace(/[/\\:*?"<>|]/g, "_") // Replace dangerous characters
    .replace(/\.+/g, ".") // Collapse multiple dots
    .replace(/^\./, "_") // Don't start with dot
    .trim();
}
