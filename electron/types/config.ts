/**
 * Config value types for structured config editing
 * 
 * These types represent the possible values in config files
 * (TOML, JSON, Properties, etc.)
 */

/**
 * Primitive config value types
 */
export type ConfigPrimitive = string | number | boolean | null;

/**
 * JSON-like value type for config files
 * Uses a simplified recursive definition
 */
export type JsonValue = 
  | string 
  | number 
  | boolean 
  | null 
  | JsonValue[] 
  | { [key: string]: JsonValue };

/**
 * Config value - alias for JsonValue
 */
export type ConfigValue = JsonValue;

/**
 * Config object type
 */
export type ConfigObject = { [key: string]: JsonValue };

/**
 * Config array type
 */
export type ConfigArray = JsonValue[];

/**
 * Type discriminator for config values
 */
export type ConfigValueType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "null";

/**
 * Get the type of a config value
 */
export function getConfigValueType(value: ConfigValue): ConfigValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "null";
}

/**
 * Type guard for string config value
 */
export function isConfigString(value: ConfigValue): value is string {
  return typeof value === "string";
}

/**
 * Type guard for number config value
 */
export function isConfigNumber(value: ConfigValue): value is number {
  return typeof value === "number";
}

/**
 * Type guard for boolean config value
 */
export function isConfigBoolean(value: ConfigValue): value is boolean {
  return typeof value === "boolean";
}

/**
 * Type guard for null config value
 */
export function isConfigNull(value: ConfigValue): value is null {
  return value === null;
}

/**
 * Type guard for array config value
 */
export function isConfigArray(value: ConfigValue): value is ConfigArray {
  return Array.isArray(value);
}

/**
 * Type guard for object config value
 */
export function isConfigObject(value: ConfigValue): value is ConfigObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Safely access nested config value by path
 */
export function getConfigValueAtPath(
  obj: ConfigObject,
  path: string[]
): ConfigValue | undefined {
  let current: ConfigValue = obj;

  for (const key of path) {
    if (!isConfigObject(current)) {
      return undefined;
    }
    current = current[key];
    if (current === undefined) {
      return undefined;
    }
  }

  return current;
}

/**
 * Set a nested config value by path
 * Returns a new object (immutable update)
 */
export function setConfigValueAtPath(
  obj: ConfigObject,
  path: string[],
  value: ConfigValue
): ConfigObject {
  if (path.length === 0) {
    if (isConfigObject(value)) {
      return value;
    }
    throw new Error("Cannot set non-object value at root path");
  }

  const [first, ...rest] = path;
  const current = obj[first];

  if (rest.length === 0) {
    return { ...obj, [first]: value };
  }

  if (!isConfigObject(current)) {
    // Create intermediate object
    return { ...obj, [first]: setConfigValueAtPath({}, rest, value) };
  }

  return { ...obj, [first]: setConfigValueAtPath(current, rest, value) };
}

/**
 * Parse a path string to path array
 * Supports: "key.nested.value" and "[section].key"
 */
export function parseConfigPath(pathStr: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inBracket = false;

  for (const char of pathStr) {
    if (char === "[" && !inBracket) {
      if (current) {
        parts.push(current);
        current = "";
      }
      inBracket = true;
    } else if (char === "]" && inBracket) {
      if (current) {
        parts.push(current);
        current = "";
      }
      inBracket = false;
    } else if (char === "." && !inBracket) {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}
