import { Injectable, signal } from '@angular/core';
import { createId } from '@core/utils/id';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

export interface Toast {
  readonly id: string;
  readonly kind: ToastKind;
  readonly message: string;
  readonly detail?: string;
  /** Optional inline action (used for "Undo" after a destructive change). */
  readonly action?: ToastAction;
}

const DEFAULT_TIMEOUTS: Readonly<Record<ToastKind, number>> = {
  info: 4000,
  success: 4000,
  warning: 6000,
  error: 9000,
};

/** App-wide, signal-backed toasts. Rendered by `i3d-toast-host` in the shell. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly items = signal<readonly Toast[]>([]);
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly toasts = this.items.asReadonly();

  info(message: string, detail?: string, action?: ToastAction): string {
    return this.push('info', message, detail, action);
  }

  success(message: string, detail?: string, action?: ToastAction): string {
    return this.push('success', message, detail, action);
  }

  warning(message: string, detail?: string, action?: ToastAction): string {
    return this.push('warning', message, detail, action);
  }

  error(message: string, detail?: string, action?: ToastAction): string {
    return this.push('error', message, detail, action);
  }

  dismiss(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.items.update((list) => list.filter((toast) => toast.id !== id));
  }

  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.items.set([]);
  }

  private push(kind: ToastKind, message: string, detail?: string, action?: ToastAction): string {
    const id = createId();
    const toast: Toast = {
      id,
      kind,
      message,
      ...(detail ? { detail } : {}),
      ...(action ? { action } : {}),
    };

    // Keep the stack short: the oldest toast leaves when a fourth arrives.
    this.items.update((list) => [...list.slice(-2), toast]);
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), DEFAULT_TIMEOUTS[kind]),
    );

    return id;
  }
}
