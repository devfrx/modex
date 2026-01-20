import { ref } from 'vue';
import { createLogger } from '@/utils/logger';

const log = createLogger('Toast');

export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

const messages = ref<ToastMessage[]>([]);
let nextId = 1;

export function useToast() {
  const show = (
    type: ToastMessage['type'],
    title: string,
    message?: string,
    duration?: number
  ) => {
    const id = nextId++;
    log.debug('Showing toast', { id, type, title, message });
    messages.value.push({ id, type, title, message, duration });
  };

  const success = (title: string, message?: string, duration?: number) => {
    show('success', title, message, duration);
  };

  const error = (title: string, message?: string, duration?: number) => {
    show('error', title, message, duration);
  };

  const warning = (title: string, message?: string, duration?: number) => {
    show('warning', title, message, duration);
  };

  const info = (title: string, message?: string, duration?: number) => {
    show('info', title, message, duration);
  };

  const remove = (id: number) => {
    const index = messages.value.findIndex(m => m.id === id);
    if (index !== -1) {
      log.debug('Removing toast', { id });
      messages.value.splice(index, 1);
    }
  };

  return {
    messages,
    show,
    success,
    error,
    warning,
    info,
    remove,
  };
}
