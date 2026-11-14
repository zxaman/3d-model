const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** Human readable byte size — used by the storage meter and project cards. */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  const digits = exponent === 0 || value >= 100 ? 0 : fractionDigits;

  return `${value.toFixed(digits)} ${BYTE_UNITS[exponent]}`;
}

const COMPACT_FORMATTER = new Intl.NumberFormat(undefined, { notation: 'compact' });

/** `12,345` for numbers people compare, `1.2M` for numbers they just scan. */
export function formatCount(value: number): string {
  return value < 10_000 ? value.toLocaleString() : COMPACT_FORMATTER.format(value);
}

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const RELATIVE_STEPS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.348],
  ['month', 12],
];

export function formatRelativeTime(value: number, now = Date.now()): string {
  let delta = (value - now) / 1000;

  for (const [unit, span] of RELATIVE_STEPS) {
    if (Math.abs(delta) < span) {
      return RELATIVE_FORMATTER.format(Math.round(delta), unit);
    }
    delta /= span;
  }

  return RELATIVE_FORMATTER.format(Math.round(delta), 'year');
}
