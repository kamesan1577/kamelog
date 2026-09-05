// Adapted from steeeee0223/notion-kit (MIT); see vendor/notion-ui/LICENSE.
import * as React from "react";

import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border transition-colors focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-white hover:bg-default/80",
        gray: "border-transparent bg-[#cecdca]/50 text-[#686763] dark:bg-default/5",
        blue: "border-none bg-[#e7f3f8] text-[#337ea9]",
        orange: "border-none bg-[#f6c05042] font-normal text-orange",
        tag: "truncate border-none bg-[#cecdca]/50 text-foreground",
      },
      size: {
        md: "px-2.5 py-0.5 text-[13px] font-normal",
        sm: "px-1.5 text-xs font-medium",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface BadgeProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
