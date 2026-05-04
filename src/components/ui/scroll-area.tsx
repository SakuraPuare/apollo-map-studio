import type { ComponentPropsWithoutRef } from 'react';
import { scrollAreaClassName, type ScrollAreaOrientation } from './scroll-area-classes';

interface ScrollAreaProps extends ComponentPropsWithoutRef<'div'> {
  orientation?: ScrollAreaOrientation;
}

export function ScrollArea({ className, orientation = 'vertical', ...props }: ScrollAreaProps) {
  return <div className={scrollAreaClassName(className, orientation)} {...props} />;
}
