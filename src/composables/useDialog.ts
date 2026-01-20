import { ref, shallowRef } from 'vue';
import { createLogger } from '@/utils/logger';

const log = createLogger('Dialog');

export type DialogVariant = 'default' | 'danger' | 'warning' | 'info' | 'success';
export type DialogIcon = 'trash' | 'warning' | 'info' | 'alert' | 'question' | 'success' | 'edit' | 'none';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
  icon?: DialogIcon;
}

export interface AlertOptions {
  title: string;
  message: string;
  buttonText?: string;
  variant?: DialogVariant;
  icon?: DialogIcon;
}

export interface InputOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
  inputType?: 'text' | 'password' | 'number' | 'email' | 'url';
  validation?: (value: string) => string | null; // Returns error message or null if valid
}

export interface SelectOptions<T = string> {
  title: string;
  message?: string;
  options: Array<{ label: string; value: T; disabled?: boolean }>;
  defaultValue?: T;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
}

// Dialog state
const isOpen = ref(false);
const dialogType = ref<'confirm' | 'alert' | 'input' | 'select'>('confirm');
const dialogOptions = shallowRef<ConfirmOptions | AlertOptions | InputOptions | SelectOptions>({
  title: '',
  message: '',
});
const inputValue = ref('');
const inputError = ref<string | null>(null);
const selectedValue = ref<any>(null);

// Promise resolvers
let resolvePromise: ((value: any) => void) | null = null;
let rejectPromise: ((reason?: any) => void) | null = null;

function closeDialog() {
  log.debug('Closing dialog', { dialogType: dialogType.value });
  isOpen.value = false;
  resolvePromise = null;
  rejectPromise = null;
  inputValue.value = '';
  inputError.value = null;
  selectedValue.value = null;
}

function handleConfirm() {
  log.debug('Dialog confirmed', { dialogType: dialogType.value });
  if (dialogType.value === 'input') {
    const opts = dialogOptions.value as InputOptions;
    if (opts.validation) {
      const error = opts.validation(inputValue.value);
      if (error) {
        log.debug('Input validation failed', { error });
        inputError.value = error;
        return;
      }
    }
    resolvePromise?.(inputValue.value);
  } else if (dialogType.value === 'select') {
    resolvePromise?.(selectedValue.value);
  } else {
    resolvePromise?.(true);
  }
  closeDialog();
}

function handleCancel() {
  log.debug('Dialog cancelled', { dialogType: dialogType.value });
  if (dialogType.value === 'confirm' || dialogType.value === 'input' || dialogType.value === 'select') {
    resolvePromise?.(dialogType.value === 'input' ? null : false);
  } else {
    resolvePromise?.(undefined);
  }
  closeDialog();
}

export function useDialog() {
  /**
   * Show a confirmation dialog
   * @returns Promise<boolean> - true if confirmed, false if cancelled
   */
  const confirm = (options: ConfirmOptions): Promise<boolean> => {
    log.debug('Opening confirm dialog', { title: options.title, variant: options.variant });
    return new Promise((resolve) => {
      dialogType.value = 'confirm';
      dialogOptions.value = {
        confirmText: 'Continue',
        cancelText: 'Cancel',
        variant: 'default',
        icon: 'question',
        ...options,
      };
      resolvePromise = resolve;
      isOpen.value = true;
    });
  };

  /**
   * Show an alert dialog
   * @returns Promise<void>
   */
  const alert = (options: AlertOptions): Promise<void> => {
    log.debug('Opening alert dialog', { title: options.title, variant: options.variant });
    return new Promise((resolve) => {
      dialogType.value = 'alert';
      dialogOptions.value = {
        buttonText: 'OK',
        variant: 'default',
        icon: 'info',
        ...options,
      };
      resolvePromise = resolve;
      isOpen.value = true;
    });
  };

  /**
   * Show an input dialog
   * @returns Promise<string | null> - input value or null if cancelled
   */
  const input = (options: InputOptions): Promise<string | null> => {
    log.debug('Opening input dialog', { title: options.title, inputType: options.inputType });
    return new Promise((resolve) => {
      dialogType.value = 'input';
      dialogOptions.value = {
        confirmText: 'Submit',
        cancelText: 'Cancel',
        variant: 'default',
        inputType: 'text',
        ...options,
      };
      inputValue.value = options.defaultValue || '';
      inputError.value = null;
      resolvePromise = resolve;
      isOpen.value = true;
    });
  };

  /**
   * Show a select dialog
   * @returns Promise<T | null> - selected value or null if cancelled
   */
  const select = <T = string>(options: SelectOptions<T>): Promise<T | null> => {
    log.debug('Opening select dialog', { title: options.title, optionsCount: options.options.length });
    return new Promise((resolve) => {
      dialogType.value = 'select';
      dialogOptions.value = options as SelectOptions;
      selectedValue.value = options.defaultValue ?? (options.options[0]?.value || null);
      resolvePromise = resolve as (value: any) => void;
      isOpen.value = true;
    });
  };

  // Convenience methods for common dialogs
  const confirmDelete = (itemName: string, itemCount: number = 1): Promise<boolean> => {
    return confirm({
      title: itemCount > 1 ? `Delete ${itemCount} items?` : 'Delete this item?',
      message: itemCount > 1 
        ? `You're about to delete ${itemCount} ${itemName}. This can't be undone.`
        : `You're about to delete this ${itemName}. This can't be undone.`,
      confirmText: 'Yes, delete',
      cancelText: 'Keep it',
      variant: 'danger',
      icon: 'trash',
    });
  };

  const confirmAction = (title: string, message: string): Promise<boolean> => {
    return confirm({
      title,
      message,
      confirmText: 'Continue',
      variant: 'warning',
      icon: 'warning',
    });
  };

  const alertError = (title: string, message: string): Promise<void> => {
    return alert({
      title,
      message,
      variant: 'danger',
      icon: 'alert',
    });
  };

  const alertSuccess = (title: string, message: string): Promise<void> => {
    return alert({
      title,
      message,
      variant: 'success',
      icon: 'success',
    });
  };

  const promptText = (title: string, options?: Partial<InputOptions>): Promise<string | null> => {
    return input({
      title,
      confirmText: 'Submit',
      ...options,
    });
  };

  return {
    // State (for DialogProvider component)
    isOpen,
    dialogType,
    dialogOptions,
    inputValue,
    inputError,
    selectedValue,
    handleConfirm,
    handleCancel,
    
    // Main methods
    confirm,
    alert,
    input,
    select,
    
    // Convenience methods
    confirmDelete,
    confirmAction,
    alertError,
    alertSuccess,
    promptText,
  };
}
