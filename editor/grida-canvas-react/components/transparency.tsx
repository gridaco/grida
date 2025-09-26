import React from "react";

interface TransparencyProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

/**
 * A reusable transparency component that provides a checkerboard background pattern
 * to visualize transparent areas in images and graphics.
 *
 * This component is commonly used in image editors, design tools, and graphics applications
 * to show transparency in a clear, recognizable pattern. The transparency grid helps users
 * distinguish between transparent and opaque areas of images.
 *
 * @keywords transparency, transparency grid, checker board, checkerboard, alpha channel, transparent background
 *
 * @example
 * ```tsx
 * // Basic usage with an image
 * <Transparency className="w-64 h-64">
 *   <img src="transparent-image.png" alt="Transparent image" />
 * </Transparency>
 * ```
 *
 * @example
 * ```tsx
 * // With custom styling
 * <Transparency
 *   className="border rounded-lg"
 *   style={{ width: '200px', height: '200px' }}
 * >
 *   <YourTransparentContent />
 * </Transparency>
 * ```
 *
 * @example
 * ```tsx
 * // As a background for image previews
 * <Transparency className="w-full h-full">
 *   <ImageView src={imageSrc} />
 * </Transparency>
 * ```
 */
export const Transparency: React.FC<TransparencyProps> = ({
  children,
  className = "",
  style,
  ...props
}) => {
  return (
    <div
      className={`transparency ${className}`}
      style={{
        background:
          "rgba(50,50,50,0.25) repeating-conic-gradient(rgba(50,50,50,0.25) 0% 25%, transparent 0% 50%) 50% / 10px 10px",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};
