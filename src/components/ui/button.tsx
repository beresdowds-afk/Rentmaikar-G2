import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-lg active:scale-[0.98]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-md hover:bg-destructive/90 hover:shadow-lg",
        outline:
          "border-2 border-primary bg-transparent text-primary hover:bg-primary hover:text-primary-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-md hover:bg-secondary/80 hover:shadow-lg",
        ghost: 
          "hover:bg-muted hover:text-accent-foreground",
        link: 
          "text-primary underline-offset-4 hover:underline",
        // Custom Rentmaikar variants
        hero: 
          "bg-accent text-accent-foreground shadow-glow hover:shadow-lg hover:bg-accent/90 active:scale-[0.98] font-bold",
        heroOutline:
          "border-2 border-white/80 bg-white/10 backdrop-blur-sm text-white hover:bg-white hover:text-primary font-bold",
        heroCTAGreen:
          "bg-[hsl(142_72%_38%)] text-white shadow-lg hover:bg-[hsl(142_72%_32%)] active:scale-[0.98] font-bold border-0",
        whatsapp:
          "bg-[hsl(142_70%_45%)] text-white shadow-md hover:bg-[hsl(142_70%_38%)] hover:shadow-lg active:bg-[hsl(142_70%_32%)] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[hsl(142_70%_45%)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        sms:
          "bg-primary text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-lg active:bg-primary/80 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        category:
          "bg-card text-card-foreground shadow-card hover:shadow-card-hover hover:-translate-y-1 border border-border",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        xl: "h-14 px-10 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
