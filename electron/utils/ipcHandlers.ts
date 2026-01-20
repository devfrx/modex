/**
 * IPC Handler utilities for type-safe, validated handlers
 */

import { ipcMain, IpcMainInvokeEvent } from "electron";
import { InputValidationError } from "./validation";
import { getErrorMessage } from "./errors";
import { createLogger } from "../services/LoggerService.js";

const log = createLogger("IPC");

/**
 * Result type for IPC handlers
 */
export interface IpcResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * Create a success result
 */
export function success<T>(data: T): IpcResult<T> {
  return { success: true, data };
}

/**
 * Create an error result
 */
export function failure(error: string, code?: string): IpcResult<never> {
  return { success: false, error, code };
}

/**
 * Wrap an IPC handler with automatic error handling and validation
 * 
 * @example
 * ```typescript
 * registerHandler("mods:getById", async (event, id) => {
 *   assertNonEmptyString(id, "id");
 *   const mod = await metadataManager.getModById(id);
 *   if (!mod) {
 *     throw new Error("Mod not found");
 *   }
 *   return mod;
 * });
 * ```
 */
export function registerHandler<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: TArgs) => Promise<TResult>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const result = await handler(event, ...(args as TArgs));
      return result;
    } catch (error) {
      // Re-throw validation errors with clear messages
      if (error instanceof InputValidationError) {
        log.warn(`Validation error in ${channel}:`, { error: error.message });
        throw new Error(`Validation error: ${error.message}`);
      }

      // Log and re-throw other errors
      log.error(`Error in ${channel}:`, { error: getErrorMessage(error) });
      throw error;
    }
  });
}

/**
 * Wrap an IPC handler that returns a result object instead of throwing
 * 
 * @example
 * ```typescript
 * registerSafeHandler("mods:delete", async (event, id) => {
 *   assertNonEmptyString(id, "id");
 *   const deleted = await metadataManager.deleteMod(id);
 *   if (!deleted) {
 *     return failure("Mod not found", "NOT_FOUND");
 *   }
 *   return success({ deleted: true });
 * });
 * ```
 */
export function registerSafeHandler<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: TArgs) => Promise<IpcResult<TResult>>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const result = await handler(event, ...(args as TArgs));
      return result;
    } catch (error) {
      // Convert validation errors to result objects
      if (error instanceof InputValidationError) {
        return failure(error.message, "VALIDATION_ERROR");
      }

      // Convert other errors to result objects
      return failure(getErrorMessage(error), "INTERNAL_ERROR");
    }
  });
}

/**
 * Helper to validate common IPC parameter patterns
 */
export const validators = {
  /**
   * Validate a mod ID parameter
   */
  modId: (value: unknown): string => {
    if (!value || typeof value !== "string") {
      throw new InputValidationError("Invalid mod ID", "modId", value);
    }
    return value;
  },

  /**
   * Validate a modpack ID parameter
   */
  modpackId: (value: unknown): string => {
    if (!value || typeof value !== "string") {
      throw new InputValidationError("Invalid modpack ID", "modpackId", value);
    }
    return value;
  },

  /**
   * Validate an instance ID parameter
   */
  instanceId: (value: unknown): string => {
    if (!value || typeof value !== "string") {
      throw new InputValidationError("Invalid instance ID", "instanceId", value);
    }
    return value;
  },

  /**
   * Validate a file path parameter
   */
  filePath: (value: unknown): string => {
    if (!value || typeof value !== "string") {
      throw new InputValidationError("Invalid file path", "path", value);
    }
    // Basic path traversal check
    if (value.includes("..") || value.includes("\0")) {
      throw new InputValidationError("Invalid path characters", "path", value);
    }
    return value;
  },

  /**
   * Validate a positive integer (like CurseForge IDs)
   */
  positiveInt: (value: unknown, fieldName: string = "value"): number => {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      throw new InputValidationError(
        `${fieldName} must be a positive integer`,
        fieldName,
        value
      );
    }
    return value;
  },

  /**
   * Validate a string array
   */
  stringArray: (value: unknown, fieldName: string = "value"): string[] => {
    if (!Array.isArray(value)) {
      throw new InputValidationError(
        `${fieldName} must be an array`,
        fieldName,
        value
      );
    }
    if (!value.every((item) => typeof item === "string")) {
      throw new InputValidationError(
        `${fieldName} must contain only strings`,
        fieldName,
        value
      );
    }
    return value;
  },

  /**
   * Validate optional value - returns undefined if null/undefined
   */
  optional: <T>(value: T | null | undefined): T | undefined => {
    if (value === null || value === undefined) {
      return undefined;
    }
    return value;
  },
};
