import { cn } from "@/components/lib/utils";
import * as React from "react";

/**
 * blendmode icon
 * 2 paths, one as stroke path, one as fill path
 * filll path serves as active highlight
 */
export const BlendModeIcon = ({
  active,
  className,
  ...props
}: React.SVGProps<SVGSVGElement> & { active?: boolean }) => {
  return (
    <svg
      width="15"
      height="15"
      data-active={active}
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("group/icon", className)}
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.5 1.5C4.5 4.25 3 6.5 3 9C3 11.4853 5.01472 13.5 7.5 13.5C9.98528 13.5 12 11.4853 12 9C12 6.5 10.5 4.25 7.5 1.5ZM4 9C4 7.11203 5.02686 5.27195 7.5 2.87357C9.65265 5.12106 11 7 11 9C11 11 9 12.5 7.5 12.5C6 12.5 4 10.888 4 9Z"
        fill="currentColor"
      />
      {/* highlight when active */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.5 2.87357C5.02686 5.27195 4 7.11203 4 9C4 10.888 6 12.5 7.5 12.5C9 12.5 11 11 11 9C11 7 9.65265 5.12106 7.5 2.87357Z"
        className="group-data-[active=true]/icon:opacity-50"
        fill="currentColor"
        opacity="0"
      />
    </svg>
  );
};
