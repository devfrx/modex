import { onMounted, onUnmounted } from "vue";
import { createLogger } from "@/utils/logger";

const log = createLogger("KeyboardShortcuts");

type ShortcutHandler = () => void;

interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: ShortcutHandler;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  log.debug('Registering keyboard shortcuts', { count: shortcuts.length });

  function handleKeyDown(event: KeyboardEvent) {
    // Ignore if typing in input/textarea
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      return;
    }

    for (const shortcut of shortcuts) {
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
      const ctrlMatch = shortcut.ctrl ? event.ctrlKey : !event.ctrlKey;
      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
      const altMatch = shortcut.alt ? event.altKey : !event.altKey;

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        event.preventDefault();
        log.debug('Shortcut triggered', { key: shortcut.key, ctrl: shortcut.ctrl, shift: shortcut.shift, alt: shortcut.alt });
        shortcut.handler();
        return;
      }
    }
  }

  onMounted(() => {
    window.addEventListener("keydown", handleKeyDown);
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", handleKeyDown);
  });
}
