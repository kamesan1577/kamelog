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
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#37352f]",
    "disabled:cursor-not-allowed disabled:bg-transparent disabled:opacity-40",
    "[&_svg]:block [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary:
          "border border-[#d3d1cb] bg-white fill-primary text-[#37352f] shadow-[0_1px_1px_rgba(15,15,15,0.04)] hover:bg-[#f7f7f5] active:bg-[#efefed]",
        icon: "size-9 rounded-md border border-[#e3e2de] text-[#787774] hover:bg-black/5 active:bg-black/10",
        "nav-icon": "size-7 text-[#787774] hover:bg-black/5 active:bg-black/10",
        link: "text-foreground underline-offset-4 hover:bg-transparent hover:underline",
        solid:
          "border border-[#37352f] bg-[#37352f] text-white shadow-[0_1px_1px_rgba(15,15,15,0.08)] hover:bg-[#292824] hover:text-white active:bg-[#1f1e1b] disabled:bg-[#37352f]/40",
        "soft-blue":
          "bg-[#efefed] text-[#37352f] shadow-xs hover:bg-[#e3e2df] disabled:bg-[#efefed]",
        hint: "font-medium text-muted",
        red: "border border-[#e5484d]/50 text-[#e5484d] hover:bg-[#e5484d]/10 focus:bg-[#e5484d]/10",
        "red-fill":
          "bg-[#e5484d] text-white hover:bg-[#d93d42] disabled:bg-[#e5484d]/40 dark:hover:bg-[#d93d42]",
        white: "border border-white text-white",
        cell: "flex justify-normal rounded-none",
        /**
         * For close icon only
         */
        close:
          "flex size-[18px] shrink-0 rounded-full bg-default/5 hover:bg-default/15 dark:hover:bg-default/0",
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
    "mx-1 flex min-h-7 w-[calc(100%-8px)] animate-bg-in cursor-pointer items-center rounded-md px-2 text-sm/tight select-none hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#37352f]",
    "fill-menu-icon [&_svg]:block [&_svg]:shrink-0",
    "data-highlighted:bg-default/10",
    "data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        default: "text-foreground",
        secondary: "fill-secondary text-secondary",
        sidebar:
          "fill-secondary text-sidebar-primary aria-selected:bg-default/10 aria-selected:text-foreground",
        warning: "hover:fill-red hover:text-red",
        error: "fill-red text-red",
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
    "relative flex w-full cursor-text items-center rounded-md bg-input text-foreground transition-colors",
    "[&_input]:block [&_input]:w-full [&_input]:bg-transparent [&_input]:p-0 [&_input]:text-inherit",
  ],
  {
    variants: {
      variant: {
        default: [
          "ring-1 ring-ring ring-inset focus-within:shadow-notion",
          "has-[input[aria-invalid='true']]:bg-red/15 has-[input[aria-invalid='true']]:ring-2 has-[input[aria-invalid='true']]:ring-red",
        ],
        /**
         * default style but not focusable
         */
        plain: [
          "ring-1 ring-ring ring-inset",
          "has-[input[aria-invalid='true']]:bg-red/15 has-[input[aria-invalid='true']]:ring-2 has-[input[aria-invalid='true']]:ring-red",
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
