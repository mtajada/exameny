import React from 'react';
import { cn } from '@/lib/utils';

const List = React.forwardRef<
  HTMLUListElement,
  React.HTMLAttributes<HTMLUListElement>
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn('space-y-2', className)} // Basic vertical spacing
    {...props}
  />
));
List.displayName = 'List';

const ListItem = React.forwardRef<
  HTMLLIElement,
  React.LiHTMLAttributes<HTMLLIElement>
>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    className={cn(
      'flex items-center justify-between p-2 border-b last:border-b-0',
       // Basic styling: flex, padding, bottom border (except last)
      className
    )}
    {...props}
  />
));
ListItem.displayName = 'ListItem';

export { List, ListItem };
