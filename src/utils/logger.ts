/**
 * Frontend Logger - Bridges to Electron main process logger
 * 
 * Provides the same API as the backend Logger but sends logs
 * to the main process for unified logging and file persistence.
 */

// ==================== TYPES ====================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
  stack?: string;
}

// ==================== CONSTANTS ====================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Check if we're in development mode
const isDev = import.meta.env.DEV;

// Current log level (can be changed at runtime)
let currentLogLevel: LogLevel = isDev ? "debug" : "info";

// ==================== LOGGER CLASS ====================

/**
 * Frontend Logger that mirrors backend Logger API
 */
export class FrontendLogger {
  private context: string;
  private static isElectron: boolean = typeof window !== "undefined" && "electron" in window;

  constructor(context: string) {
    this.context = context;
  }

  /**
   * Set the minimum log level
   */
  static setLogLevel(level: LogLevel): void {
    currentLogLevel = level;
  }

  /**
   * Get the current log level
   */
  static getLogLevel(): LogLevel {
    return currentLogLevel;
  }

  // ==================== LOG METHODS ====================

  /**
   * Log a debug message
   */
  debug(message: string, data?: unknown): void {
    this.log("debug", message, data);
  }

  /**
   * Log an info message
   */
  info(message: string, data?: unknown): void {
    this.log("info", message, data);
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: unknown): void {
    this.log("warn", message, data);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: unknown): void {
    let data: unknown;
    let stack: string | undefined;

    if (error instanceof Error) {
      data = { message: error.message, name: error.name };
      stack = error.stack;
    } else if (error !== undefined) {
      data = error;
    }

    this.log("error", message, data, stack);
  }

  /**
   * Create a child logger with additional context
   */
  child(subContext: string): FrontendLogger {
    return new FrontendLogger(`${this.context}:${subContext}`);
  }

  // ==================== TIMING HELPERS ====================

  /**
   * Start a timer for performance measurement
   */
  time(label: string): () => void {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.debug(`${label} completed`, { durationMs: duration.toFixed(2) });
    };
  }

  /**
   * Log an async operation with timing
   */
  async timed<T>(label: string, operation: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await operation();
      const duration = performance.now() - start;
      this.debug(`${label} completed`, { durationMs: duration.toFixed(2) });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`${label} failed after ${duration.toFixed(2)}ms`, error);
      throw error;
    }
  }

  // ==================== INTERNAL ====================

  private log(level: LogLevel, message: string, data?: unknown, stack?: string): void {
    // Check if this level should be logged
    if (LOG_LEVELS[level] < LOG_LEVELS[currentLogLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      data,
      stack,
    };

    // Always log to console in frontend
    this.logToConsole(entry);

    // Send to main process if in Electron
    if (FrontendLogger.isElectron) {
      this.sendToMainProcess(entry);
    }
  }

  private logToConsole(entry: LogEntry): void {
    const prefix = `[${entry.context}]`;
    const dataStr = entry.data !== undefined 
      ? (typeof entry.data === "object" ? JSON.stringify(entry.data) : String(entry.data))
      : "";

    switch (entry.level) {
      case "debug":
        console.debug(`%c${prefix}`, "color: #6b7280", entry.message, dataStr);
        break;
      case "info":
        console.info(`%c${prefix}`, "color: #3b82f6", entry.message, dataStr);
        break;
      case "warn":
        console.warn(`%c${prefix}`, "color: #f59e0b", entry.message, dataStr);
        break;
      case "error":
        console.error(`%c${prefix}`, "color: #ef4444", entry.message, dataStr);
        if (entry.stack) {
          console.error(entry.stack);
        }
        break;
    }
  }

  private sendToMainProcess(entry: LogEntry): void {
    try {
      // Use the exposed electron API to send logs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const electron = (window as any).electron;
      if (electron?.logging?.log) {
        electron.logging.log(entry);
      }
    } catch {
      // Silently fail if IPC is not available
    }
  }
}

// ==================== FACTORY FUNCTION ====================

/**
 * Create a frontend logger for a specific module/context
 * 
 * @example
 * ```ts
 * const log = createLogger("ModpackView");
 * log.info("Loading modpack...");
 * log.error("Failed to load", error);
 * ```
 */
export function createLogger(context: string): FrontendLogger {
  return new FrontendLogger(context);
}

// ==================== PRE-CREATED LOGGERS ====================

export const appLogger = createLogger("App");
export const storeLogger = createLogger("Store");
export const viewLogger = createLogger("View");
export const composableLogger = createLogger("Composable");

export default FrontendLogger;
