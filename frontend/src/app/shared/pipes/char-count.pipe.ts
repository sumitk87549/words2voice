import { Pipe, PipeTransform } from '@angular/core';

/**
 * Pure Pipe: charCount
 * Formats character count as "used / max chars" with locale-aware number formatting.
 * Examples:
 *   (1234, 5000) → "1,234 / 15,000 chars"
 *   (0, 5000)    → "0 / 15,000 chars"
 *
 * Usage: {{ text.length | charCount:maxChars }}
 * Or just count: {{ text.length | charCount }}
 */
@Pipe({
  name: 'charCount',
  pure: true,
  standalone: true,
})
export class CharCountPipe implements PipeTransform {
  transform(used: number, max?: number): string {
    const usedStr = used.toLocaleString('en-IN');
    if (max !== undefined) {
      const maxStr = max.toLocaleString('en-IN');
      return `${usedStr} / ${maxStr} chars`;
    }
    return `${usedStr} chars`;
  }
}
