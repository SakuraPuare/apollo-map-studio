import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';
import { type ScrollAreaOrientation } from './scroll-area-classes';

interface ScrollAreaProps extends ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  orientation?: ScrollAreaOrientation;
  viewportClassName?: string;
}

export function ScrollArea({
  className,
  children,
  orientation = 'vertical',
  viewportClassName,
  ...props
}: ScrollAreaProps) {
  const showVertical = orientation === 'vertical' || orientation === 'both';
  const showHorizontal = orientation === 'horizontal' || orientation === 'both';

  return (
    <ScrollAreaPrimitive.Root
      className={cn('relative overflow-hidden', className)}
      type="auto"
      {...props}
    >
      <ScrollAreaPrimitive.Viewport className={cn('h-full w-full', viewportClassName)}>
        {children}
      </ScrollAreaPrimitive.Viewport>
      {showVertical && <ScrollBar orientation="vertical" />}
      {showHorizontal && <ScrollBar orientation="horizontal" />}
      {orientation === 'both' && <ScrollAreaPrimitive.Corner className="bg-transparent" />}
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  orientation,
}: {
  orientation: Extract<ScrollAreaOrientation, 'vertical' | 'horizontal'>;
}) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      orientation={orientation}
      className={cn(
        'flex touch-none select-none p-0.5 transition-colors',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent',
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent',
      )}
    >
      <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-zinc-500/35 hover:bg-zinc-400/55" />
    </ScrollAreaPrimitive.Scrollbar>
  );
}
