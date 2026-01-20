/**
 * LoggerService - Centralized logging system for ModEx
 * 
 * Provides structured logging with:
 * - Multiple log levels (debug, info, warn, error)
 * - Context/module tagging
 * - File persistence with rotation
 * - Console output with colors
 * - Timestamp and metadata support
 * - Performance timing helpers
 */

import * as fs from "fs-extra";
import * as path from "path";
import { app } from "electron";

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

export interface LoggerOptions {
  /** Log level threshold (default: "info" in prod, "debug" in dev) */
  level?: LogLevel;
  /** Enable console output (default: true) */
  console?: boolean;
  /** Enable file logging (default: true in prod) */
  file?: boolean;
  /** Max log file size in bytes before rotation (default: 10MB) */
  maxFileSize?: number;
  /** Number of rotated files to keep (default: 5) */
  maxFiles?: number;
  /** Log directory path */
  logDir?: string;
}

interface LoggerConfig {
  level: LogLevel;
  console: boolean;
  file: boolean;
  maxFileSize: number;
  maxFiles: number;
  logDir: string;
}

// ==================== CONSTANTS ====================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[36m", // Cyan
  info: "\x1b[32m",  // Green
  warn: "\x1b[33m",  // Yellow
  error: "\x1b[31m", // Red
};

const RESET_COLOR = "\x1b[0m";
const DIM_COLOR = "\x1b[2m";
const BRIGHT_COLOR = "\x1b[1m";

// ==================== LOGGER CLASS ====================

/**
 * Logger instance for a specific context/module
 */
export class Logger {
  private context: string;
  private static globalConfig: LoggerConfig;
  private static logFilePath: string | null = null;
  private static writeStream: fs.WriteStream | null = null;
  private static currentFileSize: number = 0;
  private static isInitialized: boolean = false;
  private static pendingLogs: LogEntry[] = [];

  constructor(context: string) {
    this.context = context;
  }

  // ==================== STATIC INITIALIZATION ====================

  /**
   * Initialize the logging system
   * Should be called once at app startup
   */
  static async initialize(options: LoggerOptions = {}): Promise<void> {
    const isDev = !app.isPackaged;
    
    Logger.globalConfig = {
      level: options.level ?? (isDev ? "debug" : "info"),
      console: options.console ?? true,
      file: options.file ?? !isDev,
      maxFileSize: options.maxFileSize ?? 10 * 1024 * 1024, // 10MB
      maxFiles: options.maxFiles ?? 5,
      logDir: options.logDir ?? path.join(app.getPath("userData"), "logs"),
    };

    if (Logger.globalConfig.file) {
      await Logger.initializeFileLogging();
    }

    Logger.isInitialized = true;

    // Flush any pending logs
    for (const entry of Logger.pendingLogs) {
      Logger.writeLog(entry);
    }
    Logger.pendingLogs = [];

    // Log initialization
    const initLogger = new Logger("Logger");
    initLogger.info("Logging system initialized", {
      level: Logger.globalConfig.level,
      console: Logger.globalConfig.console,
      file: Logger.globalConfig.file,
      logDir: Logger.globalConfig.logDir,
    });
  }

  /**
   * Initialize file logging with rotation
   */
  private static async initializeFileLogging(): Promise<void> {
    try {
      await fs.ensureDir(Logger.globalConfig.logDir);
      
      const timestamp = new Date().toISOString().split("T")[0];
      Logger.logFilePath = path.join(
        Logger.globalConfig.logDir,
        `modex-${timestamp}.log`
      );

      // Check if file exists and get its size
      if (await fs.pathExists(Logger.logFilePath)) {
        const stats = await fs.stat(Logger.logFilePath);
        Logger.currentFileSize = stats.size;
        
        // Rotate if too large
        if (Logger.currentFileSize >= Logger.globalConfig.maxFileSize) {
          await Logger.rotateLogFile();
        }
      }

      Logger.writeStream = fs.createWriteStream(Logger.logFilePath, { flags: "a" });
      
      // Handle stream errors
      Logger.writeStream.on("error", (err) => {
        console.error("[Logger] Write stream error:", err);
        Logger.writeStream = null;
      });
    } catch (error) {
      console.error("[Logger] Failed to initialize file logging:", error);
    }
  }

  /**
   * Rotate log files when size limit is reached
   */
  private static async rotateLogFile(): Promise<void> {
    if (!Logger.logFilePath) return;

    try {
      // Close current stream
      if (Logger.writeStream) {
        Logger.writeStream.end();
        Logger.writeStream = null;
      }

      // Rotate existing files
      const basePath = Logger.logFilePath;
      for (let i = Logger.globalConfig.maxFiles - 1; i >= 1; i--) {
        const oldPath = `${basePath}.${i}`;
        const newPath = `${basePath}.${i + 1}`;
        if (await fs.pathExists(oldPath)) {
          if (i + 1 >= Logger.globalConfig.maxFiles) {
            await fs.remove(oldPath);
          } else {
            await fs.rename(oldPath, newPath);
          }
        }
      }

      // Rename current file
      if (await fs.pathExists(basePath)) {
        await fs.rename(basePath, `${basePath}.1`);
      }

      // Create new stream
      Logger.writeStream = fs.createWriteStream(basePath, { flags: "a" });
      Logger.currentFileSize = 0;
    } catch (error) {
      console.error("[Logger] Failed to rotate log file:", error);
    }
  }

  // ==================== LOG METHODS ====================

  /**
   * Log a debug message (lowest priority)
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
  child(subContext: string): Logger {
    return new Logger(`${this.context}:${subContext}`);
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
    if (!Logger.globalConfig) {
      // Not initialized yet, queue the log
      Logger.pendingLogs.push({
        timestamp: new Date().toISOString(),
        level,
        context: this.context,
        message,
        data,
        stack,
      });
      return;
    }

    if (LOG_LEVELS[level] < LOG_LEVELS[Logger.globalConfig.level]) {
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

    Logger.writeLog(entry);
  }

  private static writeLog(entry: LogEntry): void {
    // Console output
    if (Logger.globalConfig.console) {
      Logger.writeToConsole(entry);
    }

    // File output
    if (Logger.globalConfig.file && Logger.writeStream) {
      Logger.writeToFile(entry);
    }
  }

  private static writeToConsole(entry: LogEntry): void {
    const color = LEVEL_COLORS[entry.level];
    const levelStr = entry.level.toUpperCase().padEnd(5);
    const timeStr = entry.timestamp.split("T")[1].split(".")[0];
    
    let output = `${DIM_COLOR}${timeStr}${RESET_COLOR} ${color}${BRIGHT_COLOR}${levelStr}${RESET_COLOR} ${DIM_COLOR}[${entry.context}]${RESET_COLOR} ${entry.message}`;

    if (entry.data !== undefined) {
      const dataStr = typeof entry.data === "object" 
        ? JSON.stringify(entry.data, null, 2)
        : String(entry.data);
      output += ` ${DIM_COLOR}${dataStr}${RESET_COLOR}`;
    }

    // Use appropriate console method
    switch (entry.level) {
      case "debug":
        console.debug(output);
        break;
      case "info":
        console.info(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "error":
        console.error(output);
        if (entry.stack) {
          console.error(`${DIM_COLOR}${entry.stack}${RESET_COLOR}`);
        }
        break;
    }
  }

  private static writeToFile(entry: LogEntry): void {
    if (!Logger.writeStream) return;

    const logLine = JSON.stringify({
      t: entry.timestamp,
      l: entry.level,
      c: entry.context,
      m: entry.message,
      d: entry.data,
      s: entry.stack,
    }) + "\n";

    const bytes = Buffer.byteLength(logLine);
    Logger.currentFileSize += bytes;

    Logger.writeStream.write(logLine, (err) => {
      if (err) {
        console.error("[Logger] Write error:", err);
      }
    });

    // Check for rotation
    if (Logger.currentFileSize >= Logger.globalConfig.maxFileSize) {
      Logger.rotateLogFile().catch(console.error);
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get the current log file path
   */
  static getLogFilePath(): string | null {
    return Logger.logFilePath;
  }

  /**
   * Get all log files
   */
  static async getLogFiles(): Promise<string[]> {
    if (!Logger.globalConfig?.logDir) return [];
    
    try {
      const files = await fs.readdir(Logger.globalConfig.logDir);
      return files
        .filter(f => f.endsWith(".log"))
        .map(f => path.join(Logger.globalConfig.logDir, f))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  /**
   * Read recent log entries from file
   */
  static async getRecentLogs(count: number = 100): Promise<LogEntry[]> {
    if (!Logger.logFilePath) return [];

    try {
      const content = await fs.readFile(Logger.logFilePath, "utf-8");
      const lines = content.trim().split("\n").slice(-count);
      
      const entries: LogEntry[] = [];
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          entries.push({
            timestamp: parsed.t,
            level: parsed.l as LogLevel,
            context: parsed.c,
            message: parsed.m,
            data: parsed.d,
            stack: parsed.s,
          });
        } catch {
          // Skip malformed lines
        }
      }
      return entries;
    } catch {
      return [];
    }
  }

  /**
   * Clear all log files
   */
  static async clearLogs(): Promise<void> {
    if (!Logger.globalConfig?.logDir) return;

    try {
      // Close current stream
      if (Logger.writeStream) {
        Logger.writeStream.end();
        Logger.writeStream = null;
      }

      // Remove all log files
      const files = await Logger.getLogFiles();
      for (const file of files) {
        await fs.remove(file);
      }

      // Reinitialize
      await Logger.initializeFileLogging();
    } catch (error) {
      console.error("[Logger] Failed to clear logs:", error);
    }
  }

  /**
   * Shutdown the logging system
   */
  static async shutdown(): Promise<void> {
    if (Logger.writeStream) {
      return new Promise((resolve) => {
        Logger.writeStream!.end(() => {
          Logger.writeStream = null;
          resolve();
        });
      });
    }
  }
}

// ==================== FACTORY FUNCTION ====================

/**
 * Create a logger for a specific module/context
 * 
 * @example
 * ```ts
 * const log = createLogger("MetadataManager");
 * log.info("Loading data...");
 * log.error("Failed to load", error);
 * ```
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}

// ==================== PRE-CREATED LOGGERS ====================

// Export commonly used loggers
export const mainLogger = createLogger("Main");
export const ipcLogger = createLogger("IPC");
export const apiLogger = createLogger("API");

export default Logger;
