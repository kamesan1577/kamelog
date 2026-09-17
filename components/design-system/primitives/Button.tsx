import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-ds-sm px-4 text-ds-sm font-medium leading-none whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-ds-accent text-white hover:bg-ds-accent-hover",
        secondary:
          "border border-ds-border bg-ds-surface text-ds-primary hover:bg-ds-hover",
        ghost: "text-ds-secondary hover:bg-ds-hover hover:text-ds-primary",
        danger: "bg-ds-danger text-white hover:brightness-95",
      },
      size: {
        sm: "min-h-8 px-3 ds-text-xs",
        md: "min-h-9",
        lg: "min-h-10 px-5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      data-ds="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
