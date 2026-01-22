/**
 * System IPC Handlers
 * System information and utilities
 */

import { ipcMain } from "electron";

export interface SystemIpcDeps {
  // No external dependencies needed
}

export function registerSystemHandlers(_deps: SystemIpcDeps): void {
  // Get system memory info
  ipcMain.handle("system:getMemoryInfo", async () => {
    const os = await import("os");
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const totalMB = Math.floor(totalMem / (1024 * 1024));
    // Suggested max: leave 4GB for system, or 25% of RAM, whichever is larger
    const reserveForSystem = Math.max(4096, Math.floor(totalMB * 0.25));
    const suggestedMax = Math.max(4096, totalMB - reserveForSystem);
    return {
      total: totalMB, // MB
      free: Math.floor(freeMem / (1024 * 1024)), // MB
      used: Math.floor((totalMem - freeMem) / (1024 * 1024)), // MB
      // Suggested max for Minecraft (conservative to leave room for system)
      suggestedMax: suggestedMax
    };
  });
}
