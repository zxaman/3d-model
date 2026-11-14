import { Directive, booleanAttribute, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Button styling as an attribute directive, so callers keep a real
 * `<button>`/`<a>` element: correct semantics and keyboard behaviour come free.
 *
 *   <button i3dButton="primary" [disabled]="busy">Generate</button>
 */
@Directive({
  selector: 'button[i3dButton], a[i3dButton]',
  host: {
    class: 'i3d-button',
    '[class.i3d-button--block]': 'block()',
    '[class.is-busy]': 'busy()',
    '[class.is-icon-only]': 'iconOnly()',
    '[attr.data-variant]': 'i3dButton()',
    '[attr.data-size]': 'size()',
    '[attr.aria-disabled]': 'disabled() ? "true" : null',
    '[attr.aria-busy]': 'busy() ? "true" : null',
    // Declaring a `disabled` input shadows the native property, so the value has
    // to be reflected back onto the element for the button to really be inert.
    // An attribute binding (rather than `[disabled]`) also keeps `<a i3dButton>`
    // type-checking, where `disabled` is not a known property.
    '[attr.disabled]': 'disabled() ? "" : null',
  },
})
export class ButtonDirective {
  /** Variant; also the selector so `<button i3dButton="primary">` reads well. */
  readonly i3dButton = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  readonly block = input(false, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });
  readonly iconOnly = input(false, { transform: booleanAttribute });

  /**
   * Mirrors the native `disabled` attribute. Kept as an input so `<a i3dButton>`
   * can be marked unavailable too (anchors ignore `disabled`).
   */
  readonly disabled = input(false, { transform: booleanAttribute });
}
