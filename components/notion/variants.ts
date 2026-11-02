// Adapted from steeeee0223/notion-kit (MIT); see vendor/notion-ui/LICENSE.
import { cva, type VariantProps } from "class-variance-authority";

const typographyVariants = cva("", {
  variants: {
    type: {
      h1: "text-[40px]/tight font-bold",
      /**
       * @prop h2
       * @note tx-heading-17-semi
       */
      h2: "text-lg/[22px] font-semibold",
      /**
       * @prop h3
       * @note tx-uiregular-14-semi
       */
      h3: "text-sm/5 font-semibold",
      /**
       * @prop body
       * @note tx-body-14-reg
       */
      body: "text-sm/5 font-normal",
      label: "text-xs/4.5 font-medium",
      desc: "text-xs/4",
    },
  },
});
export type Typography = VariantProps<typeof typographyVariants>["type"];
export const typography = (type: Typography) => typographyVariants({ type });

export const buttonVariants = cva(
  [
    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[4px] text-sm font-medium whitespace-nowrap select-none transition-colors duration-75",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent",
    "disabled:cursor-not-allowed disabled:bg-transparent disabled:opacity-40",
    "[&_svg]:block [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary:
          "border border-ds-control-border bg-ds-surface fill-current text-ds-primary hover:bg-ds-hover active:bg-ds-active",
        icon: "size-9 rounded-md border border-ds-control-border text-ds-secondary hover:bg-ds-hover active:bg-ds-active",
        "nav-icon":
          "size-7 text-ds-secondary hover:bg-ds-hover active:bg-ds-active",
        link: "text-foreground underline-offset-4 hover:bg-transparent hover:underline",
        solid:
          "border border-ds-action bg-ds-action text-ds-action-foreground hover:bg-ds-action-hover active:bg-ds-action-hover disabled:bg-ds-action/40",
        "soft-blue":
          "bg-ds-muted text-ds-primary hover:bg-ds-active disabled:bg-ds-muted",
        hint: "font-medium text-muted-foreground",
        red: "border border-ds-danger/50 text-ds-danger hover:bg-ds-danger-bg focus:bg-ds-danger-bg",
        "red-fill":
          "bg-ds-danger-fill text-ds-danger-foreground hover:brightness-95 disabled:bg-ds-danger-fill/40",
        white: "border border-white text-white",
        cell: "flex justify-normal rounded-none",
        /**
         * For close icon only
         */
        close:
          "flex size-[18px] shrink-0 rounded-full bg-ds-muted text-ds-primary hover:bg-ds-active",
      },
      size: {
        xs: "h-6 px-1.5 text-xs",
        sm: "h-8 px-3",
        md: "h-9 px-4 py-2",
        lg: "h-10 rounded-md px-8",
        circle: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);
export type ButtonVariants = VariantProps<typeof buttonVariants>;

export const menuItemVariants = cva(
  [
    "mx-1 flex min-h-7 w-[calc(100%-8px)] animate-bg-in cursor-pointer items-center rounded-md px-2 text-sm/tight select-none hover:bg-ds-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent",
    "fill-menu-icon [&_svg]:block [&_svg]:shrink-0",
    "data-highlighted:bg-ds-hover",
    "data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        default: "text-foreground",
        secondary: "fill-current text-ds-secondary",
        sidebar:
          "fill-current text-sidebar-primary aria-selected:bg-ds-active aria-selected:text-foreground",
        warning: "hover:fill-current hover:text-ds-danger",
        error: "fill-current text-ds-danger",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);
export type MenuItemVariants = VariantProps<typeof menuItemVariants>;

export const inputVariants = cva(
  [
    "relative flex w-full cursor-text items-center rounded-md bg-ds-surface text-foreground transition-colors",
    "[&_input]:block [&_input]:w-full [&_input]:bg-transparent [&_input]:p-0 [&_input]:text-inherit",
  ],
  {
    variants: {
      variant: {
        default: [
          "ring-1 ring-ring ring-inset focus-within:shadow-notion",
          "has-[input[aria-invalid='true']]:bg-ds-danger-bg has-[input[aria-invalid='true']]:ring-2 has-[input[aria-invalid='true']]:ring-ds-danger",
        ],
        /**
         * default style but not focusable
         */
        plain: [
          "ring-1 ring-ring ring-inset",
          "has-[input[aria-invalid='true']]:bg-ds-danger-bg has-[input[aria-invalid='true']]:ring-2 has-[input[aria-invalid='true']]:ring-ds-danger",
        ],
        /**
         * transparent and without border
         */
        flat: "bg-transparent",
      },
      size: {
        default: "h-7 px-1.5 text-sm",
        lg: "h-[34px] px-2.5 text-[15px]/[26px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
export type InputVariants = VariantProps<typeof inputVariants>;

export const groupVariants = cva("flex flex-col gap-px py-1");
