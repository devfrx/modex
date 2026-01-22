/**
 * Logging IPC Handlers
 * Log management and viewer integration
 */

import { ipcMain, shell } from "electron";
import { Logger, createLogger, LogEntry } from "../services/LoggerService.js";

export interface LoggingIpcDeps {
  // No external dependencies needed - uses static Logger class
}

export function registerLoggingHandlers(_deps: LoggingIpcDeps): void {
  // Logger for renderer process logs
  const rendererLogger = createLogger("Renderer");

  // Receive logs from renderer process (using ipcMain.on, not handle)
  ipcMain.on("logging:log", (_, entry: LogEntry) => {
    const childLog = rendererLogger.child(entry.context);
    switch (entry.level) {
      case "debug":
        childLog.debug(entry.message, entry.data);
        break;
      case "info":
        childLog.info(entry.message, entry.data);
        break;
      case "warn":
        childLog.warn(entry.message, entry.data);
        break;
      case "error":
        childLog.error(entry.message, entry.data);
        break;
    }
  });

  // Get recent log entries
  ipcMain.handle("logging:getRecentLogs", async (_, count?: number) => {
    return Logger.getRecentLogs(count);
  });

  // Get current log file path
  ipcMain.handle("logging:getLogFilePath", async () => {
    return Logger.getLogFilePath();
  });

  // Get all log files
  ipcMain.handle("logging:getLogFiles", async () => {
    return Logger.getLogFiles();
  });

  // Clear all log files
  ipcMain.handle("logging:clearLogs", async () => {
    await Logger.clearLogs();
    console.info("Log files cleared");
  });

  // Open logs folder in file explorer
  ipcMain.handle("logging:openLogsFolder", async () => {
    const logPath = Logger.getLogFilePath();
    if (logPath) {
      shell.showItemInFolder(logPath);
    }
  });
}
