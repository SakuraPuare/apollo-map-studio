import { cn } from '@/lib/utils';

export type ScrollAreaOrientation = 'vertical' | 'horizontal' | 'both';

export const scrollbarClassName = 'ams-scrollbar';

const orientationClassName: Record<ScrollAreaOrientation, string> = {
  vertical: 'overflow-y-auto overflow-x-hidden',
  horizontal: 'overflow-x-auto overflow-y-hidden',
  both: 'overflow-auto',
};

export function scrollAreaClassName(
  className?: string,
  orientation: ScrollAreaOrientation = 'vertical',
) {
  return cn(scrollbarClassName, orientationClassName[orientation], className);
}
