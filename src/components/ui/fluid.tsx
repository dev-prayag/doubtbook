import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const GlassSurface = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("aqua-glass", className)} {...props} />
  ),
);
GlassSurface.displayName = "GlassSurface";

export const FluidButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn("fluid-control", className)}
      {...props}
    />
  ),
);
FluidButton.displayName = "FluidButton";

export function SpringSheet({
  side = "bottom",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { side?: "bottom" | "left" | "center" }) {
  return (
    <GlassSurface
      className={cn(
        "spring-sheet",
        side === "bottom" && "spring-sheet-bottom",
        side === "left" && "spring-sheet-left",
        side === "center" && "spring-sheet-center",
        className,
      )}
      {...props}
    />
  );
}