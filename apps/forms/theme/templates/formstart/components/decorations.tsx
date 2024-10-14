import { cn } from "@/utils";
import { PlusIcon } from "@radix-ui/react-icons";
import { motion } from "framer-motion";

export function ScreenDecorations({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="absolute inset-0 w-full h-full z-50 pointer-events-none select-none">
      {children}
    </div>
  );
}

export function ScreenCameraCrossDecoration({
  crossSize,
  className,
}: {
  crossSize?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative inset-0 w-full h-full pointer-events-none select-none p-4",
        className
      )}
    >
      <div className="relative w-full h-full">
        {/* top left */}
        <Rotate className="absolute top-0 left-0">
          <PlusIcon style={{ width: crossSize, height: crossSize }} />
        </Rotate>
        {/* top right */}
        <Rotate className="absolute top-0 right-0">
          <PlusIcon style={{ width: crossSize, height: crossSize }} />
        </Rotate>
        {/* bottom left */}
        <Rotate className="absolute bottom-0 left-0">
          <PlusIcon style={{ width: crossSize, height: crossSize }} />
        </Rotate>
        {/* bottom right */}
        <Rotate className="absolute bottom-0 right-0">
          <PlusIcon style={{ width: crossSize, height: crossSize }} />
        </Rotate>
      </div>
    </div>
  );
}

export function LinearBoxScaleDecoration({
  className,
  length,
  orientation,
  boxSize = 10,
  reverse = false,
}: {
  className?: string;
  length: number;
  orientation: "horizontal" | "vertical";
  boxSize?: number;
  reverse?: boolean;
}) {
  return (
    <div
      data-orientation={orientation}
      data-reverse={reverse}
      className={cn(
        "flex gap-2 w-0 h-0 data-[orientation=horizontal]:flex-row data-[orientation=vertical]:flex-col data-[reverse=true]:flex-row-reverse",
        className
      )}
    >
      {Array.from({ length }).map((_, i) => (
        <Rotate
          key={i}
          className="w-full h-full bg-inherit"
          style={{
            width: boxSize,
            height: boxSize / i,
            minWidth: boxSize,
            minHeight: boxSize / (i + 1),
          }}
        />
      ))}
    </div>
  );
}

function Rotate({
  children,
  ...props
}: React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
}>) {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{
        repeatDelay: 3,
        duration: 1,
        repeat: Infinity,
        repeatType: "loop",
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
