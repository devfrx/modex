/**
 * useModpackGameLogs
 * 
 * Manages live game log streaming, filtering, and display.
 * Handles log listener setup/teardown and provides filtered log views.
 * 
 * Extracted from ModpackEditor.vue to reduce complexity and enable reuse.
 */
import { ref, computed, Ref, onUnmounted } from 'vue';
import { useInstances } from '@/composables/useInstances';
import type { ModexInstance } from '@/types';

export interface GameLogEntry {
  time: string;
  level: string;
  message: string;
}

export type LogLevelFilter = 'all' | 'info' | 'warn' | 'error';

interface UseModpackGameLogsOptions {
  instance: Ref<ModexInstance | null>;
  maxLogLines?: number;
}

export function useModpackGameLogs(options: UseModpackGameLogsOptions) {
  const { instance, maxLogLines = 200 } = options;
  const { onGameLogLine } = useInstances();

  // === STATE ===

  // Raw logs storage
  const gameLogs = ref<GameLogEntry[]>([]);

  // UI state
  const showLogConsole = ref(false);
  const logLevelFilter = ref<LogLevelFilter>('all');
  const logScrollRef = ref<HTMLDivElement | null>(null);

  // Listener cleanup function
  let removeLogListener: (() => void) | null = null;

  // === COMPUTED ===

  /**
   * Filtered logs based on selected level
   */
  const filteredGameLogs = computed(() => {
    if (logLevelFilter.value === 'all') return gameLogs.value;

    const filterMap: Record<string, string[]> = {
      info: ['INFO'],
      warn: ['WARN', 'WARNING'],
      error: ['ERROR', 'FATAL', 'SEVERE'],
    };

    const allowedLevels = filterMap[logLevelFilter.value] || [];
    return gameLogs.value.filter((log) =>
      allowedLevels.includes(log.level.toUpperCase())
    );
  });

  /**
   * Log level counts for badges
   */
  const logLevelCounts = computed(() => {
    const counts = { info: 0, warn: 0, error: 0 };

    for (const log of gameLogs.value) {
      const level = log.level.toUpperCase();
      if (level === 'INFO') {
        counts.info++;
      } else if (level === 'WARN' || level === 'WARNING') {
        counts.warn++;
      } else if (level === 'ERROR' || level === 'FATAL' || level === 'SEVERE') {
        counts.error++;
      }
    }

    return counts;
  });

  /**
   * Total log count
   */
  const totalLogCount = computed(() => gameLogs.value.length);

  /**
   * Has any errors in logs
   */
  const hasErrors = computed(() => logLevelCounts.value.error > 0);

  /**
   * Has any warnings in logs
   */
  const hasWarnings = computed(() => logLevelCounts.value.warn > 0);

  // === FUNCTIONS ===

  /**
   * Set up the game log listener
   * Should be called when the editor opens
   */
  function setupLogListener(): void {
    // Prevent duplicate listeners
    if (removeLogListener) {
      removeLogListener();
    }

    removeLogListener = onGameLogLine((instanceId, logLine) => {
      // Only process logs for the current instance
      if (instance.value && instanceId === instance.value.id) {
        gameLogs.value.push({
          time: logLine.time,
          level: logLine.level,
          message: logLine.message,
        });

        // Keep only last maxLogLines
        if (gameLogs.value.length > maxLogLines) {
          gameLogs.value = gameLogs.value.slice(-maxLogLines);
        }
      }
    });
  }

  /**
   * Clean up the log listener
   * Should be called when the editor closes
   */
  function cleanupLogListener(): void {
    if (removeLogListener) {
      removeLogListener();
      removeLogListener = null;
    }
  }

  /**
   * Clear all logs
   */
  function clearLogs(): void {
    gameLogs.value = [];
  }

  /**
   * Toggle log console visibility
   */
  function toggleLogConsole(): void {
    showLogConsole.value = !showLogConsole.value;
  }

  /**
   * Set log level filter
   */
  function setLogLevelFilter(level: LogLevelFilter): void {
    logLevelFilter.value = level;
  }

  /**
   * Scroll to bottom of log console
   */
  function scrollToBottom(): void {
    if (logScrollRef.value) {
      logScrollRef.value.scrollTop = logScrollRef.value.scrollHeight;
    }
  }

  /**
   * Get log level CSS class
   */
  function getLogLevelClass(level: string): string {
    const upperLevel = level.toUpperCase();
    if (upperLevel === 'ERROR' || upperLevel === 'FATAL' || upperLevel === 'SEVERE') {
      return 'text-red-400';
    }
    if (upperLevel === 'WARN' || upperLevel === 'WARNING') {
      return 'text-amber-400';
    }
    if (upperLevel === 'INFO') {
      return 'text-blue-400';
    }
    return 'text-muted-foreground';
  }

  // Clean up on component unmount
  onUnmounted(() => {
    cleanupLogListener();
  });

  return {
    // State
    gameLogs,
    showLogConsole,
    logLevelFilter,
    logScrollRef,

    // Computed
    filteredGameLogs,
    logLevelCounts,
    totalLogCount,
    hasErrors,
    hasWarnings,

    // Functions
    setupLogListener,
    cleanupLogListener,
    clearLogs,
    toggleLogConsole,
    setLogLevelFilter,
    scrollToBottom,
    getLogLevelClass,
  };
}
