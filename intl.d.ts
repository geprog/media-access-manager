// `Intl.DurationFormat` ships in every runtime the app targets but not yet in
// TypeScript's own lib files, so declare the part the app uses until it does.
declare namespace Intl {
  interface DurationFormatOptions {
    style?: 'long' | 'short' | 'narrow' | 'digital'
  }

  type DurationInput = Partial<Record<
    'years' | 'months' | 'weeks' | 'days' | 'hours' | 'minutes' | 'seconds',
    number
  >>;

  class DurationFormat {
    constructor(locales?: string | string[], options?: DurationFormatOptions);
    format(duration: DurationInput): string;
  }
}
