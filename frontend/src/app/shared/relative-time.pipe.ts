import { Pipe, PipeTransform } from '@angular/core';

/** "Posted 2h ago", "3d", "Yesterday" — short, design-system style. */
@Pipe({ name: 'relTime', standalone: true, pure: true })
export class RelativeTimePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    if (!value) return '';
    const then = typeof value === 'string' ? new Date(value) : value;
    const diffMs = Date.now() - then.getTime();
    const min = Math.floor(diffMs / 60_000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w ago`;
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}
