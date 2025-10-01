import { GridaLogo } from "../starterkit-icons";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  easeIn,
  easeOut,
  steps as motionSteps,
  animate,
  useTransform,
} from "motion/react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/components/lib/utils";
import { useEffect, useState } from "react";

// Using motion's built-in easing functions

/**
 * Custom hook that manages UX progress value with fake progress behavior.
 *
 * @param loading - Whether the loading operation is active
 * @param expectedDuration - Expected duration in milliseconds for the loading operation
 * @param steps - Total number of steps (optional)
 * @param step - Current step number (optional)
 * @param maxFakedProgress - Maximum progress value to reach before completion (0-1)
 * @returns The current progress value (0-100)
 */
function useUXProgressValue(
  loading: boolean,
  expectedDuration: number = 3000,
  steps?: number,
  step?: number,
  maxFakedProgress: number = 0.9
) {
  const [progress, setProgress] = useState(0);
  const progressValue = useMotionValue(0);

  const createAsymptoticAnimation = (
    targetValue: number,
    startValue: number
  ) => {
    const k = Math.log(2) / 2; // Mathematical decay rate

    return animate(progressValue, targetValue, {
      duration: Infinity,
      ease: (t: number) => {
        // Asymptotic function: approaches target asymptotically
        const easedTime = easeOut(t);
        return (
          startValue +
          (targetValue - startValue) * (1 - Math.exp(-k * easedTime * 10))
        );
      },
      onUpdate: (value: number) => setProgress(value),
    });
  };

  const createStepAnimation = async (
    stepProgress: number,
    nextStepProgress: number,
    maxProgress: number
  ) => {
    progressValue.set(stepProgress);
    setProgress(stepProgress);

    // Animate to next step
    await animate(progressValue, nextStepProgress, {
      duration: expectedDuration / 1000,
      ease: motionSteps(10, "end"),
      onUpdate: (value: number) => setProgress(value),
    });

    return createAsymptoticAnimation(maxProgress, nextStepProgress);
  };

  const createLinearAnimation = async (maxProgress: number) => {
    const targetProgress = maxProgress * 0.8;

    progressValue.set(0);
    setProgress(0);

    // Animate to 80% of max
    await animate(progressValue, targetProgress, {
      duration: expectedDuration / 1000,
      ease: easeIn,
      onUpdate: (value: number) => setProgress(value),
    });

    return createAsymptoticAnimation(maxProgress, targetProgress);
  };

  const startAnimation = async () => {
    progressValue.set(0);
    setProgress(0);
    const maxProgress = maxFakedProgress * 100;

    if (steps && step !== undefined) {
      await createStepAnimation(
        (step / steps) * maxProgress,
        ((step + 1) / steps) * maxProgress,
        maxProgress
      );
    } else {
      await createLinearAnimation(maxProgress);
    }
  };

  useEffect(() => {
    if (loading) {
      startAnimation();
    } else {
      setProgress(0);
      progressValue.set(0);
    }
  }, [loading, expectedDuration, steps, step, maxFakedProgress, progressValue]);

  useEffect(() => {
    if (!loading && progress > 0) {
      // Jump to 100% when loading completes
      progressValue.set(100);
      setProgress(100);
    }
  }, [loading, progress, progressValue]);

  return progress;
}

interface FullscreenLoadingOverlayProps {
  loading: boolean;
  /**
   * Expected duration in milliseconds for the loading operation.
   * The progress bar will linearly approach the max progress over this duration.
   * If loading takes longer, it will stay at max progress until completion.
   * @default 3000
   */
  expectedDuration?: number;
  /**
   * Minimum duration in milliseconds to show the loading overlay.
   * Prevents the overlay from "blinking" in fast loading scenarios.
   * @default 500
   */
  minDuration?: number;
  /**
   * Total number of steps for step-based progress.
   * When provided with `step`, progress will be chunked into steps.
   */
  steps?: number;
  /**
   * Current step number (0-based).
   * When provided with `steps`, progress will jump to this step and gradually approach the next.
   */
  step?: number;
  /**
   * Maximum progress value to reach before completion (0-1).
   * Progress will stay at this value until loading completes, then jump to 100%.
   * @default 0.9
   */
  maxFakedProgress?: number;
  /**
   * Callback fired when the overlay has completely finished its exit animation.
   * Use this to remove the component from the tree.
   */
  onExitComplete?: () => void;
  /**
   * Delay in milliseconds before starting the exit animation.
   * @default 0
   */
  exitDelay?: number;
  /**
   * Error message to display in the loading overlay.
   */
  errmsg?: string | null;
}

interface UXProgressProps {
  loading: boolean;
  expectedDuration?: number;
  steps?: number;
  step?: number;
  maxFakedProgress?: number;
  className?: string;
}

function UXProgress({
  loading,
  expectedDuration = 3000,
  steps,
  step,
  maxFakedProgress = 0.9,
  className,
}: UXProgressProps) {
  const progress = useUXProgressValue(
    loading,
    expectedDuration,
    steps,
    step,
    maxFakedProgress
  );

  return <Progress value={progress} className={className} />;
}

export function FullscreenLoadingOverlay({
  loading,
  expectedDuration = 3000,
  minDuration = 1000,
  steps,
  step,
  maxFakedProgress = 0.9,
  onExitComplete,
  exitDelay = 200,
  errmsg,
}: FullscreenLoadingOverlayProps) {
  const [showOverlay, setShowOverlay] = useState(true);
  const [startTime, setStartTime] = useState<number | null>(null);

  useEffect(() => {
    if (loading) {
      setStartTime(Date.now());
      setShowOverlay(true);
    } else if (startTime) {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minDuration - elapsed);

      if (remaining > 0) {
        // Wait for minimum duration before hiding
        const timer = setTimeout(() => {
          setShowOverlay(false);
        }, remaining);

        return () => clearTimeout(timer);
      } else {
        setShowOverlay(false);
      }
    }
  }, [loading, minDuration, startTime]);

  return (
    <AnimatePresence mode="wait" onExitComplete={onExitComplete}>
      {showOverlay ? (
        <motion.div
          key="loading"
          className="flex flex-col items-center justify-center py-12 absolute inset-0 z-[999999] bg-muted select-none pointer-events-auto"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: 0.3,
            ease: "easeInOut",
            delay: exitDelay / 1000,
          }}
        >
          <motion.div
            className="flex flex-col items-center justify-center gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              className="text-sm text-muted-foreground"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            >
              <GridaLogo />
            </motion.div>
            <UXProgress
              loading={loading}
              expectedDuration={expectedDuration}
              steps={steps}
              step={step}
              maxFakedProgress={maxFakedProgress}
              className="w-52"
            />
            {errmsg ? (
              <motion.p
                className="text-xs text-destructive"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                {errmsg}
              </motion.p>
            ) : null}
            {/* <motion.p
              className="text-sm text-muted-foreground"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            >
              Loading...
            </motion.p> */}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-1 w-full overflow-hidden",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all duration-100 ease-out"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
