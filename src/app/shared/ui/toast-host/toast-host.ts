import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  NotificationService,
  type Toast,
  type ToastKind,
} from '@core/services/notification.service';
import { ButtonDirective } from '../button/button';
import { Icon, type IconName } from '../icon/icon';

const ICONS: Readonly<Record<ToastKind, IconName>> = {
  info: 'info',
  success: 'check',
  warning: 'warning',
  error: 'warning',
};

/** Renders the app-wide toast stack. Mounted once, in the shell. */
@Component({
  selector: 'i3d-toast-host',
  imports: [Icon, ButtonDirective],
  templateUrl: './toast-host.html',
  styleUrl: './toast-host.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHost {
  private readonly notifications = inject(NotificationService);

  protected readonly toasts = this.notifications.toasts;

  protected iconFor(kind: ToastKind): IconName {
    return ICONS[kind];
  }

  protected dismiss(id: string): void {
    this.notifications.dismiss(id);
  }

  protected runAction(toast: Toast): void {
    toast.action?.run();
    this.dismiss(toast.id);
  }
}
