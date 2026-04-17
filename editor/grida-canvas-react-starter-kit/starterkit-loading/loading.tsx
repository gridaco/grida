import { GridaLogo } from "../starterkit-icons";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  easeIn,
  easeOut,
  animate,
} from "motion/react";
import { Progress as ProgressPrimitive } from "radix-ui";
import { cn } from "@/components/lib/utils";
import { useEffect, useState, useRef } from "react";

// Using motion's built-in easing functions

/**
 * Custom hook that manages UX progress value with fake progress behavior.
 *
 * @param loading - Whether the loading operation is active
 * @param expectedDuration - Expected duration in milliseconds for the loading operation
 * @param maxFakedProgress - Maximum progress value to reach before completion (0-1)
 * @returns The current progress value (0-100)
 */
function useUXProgressValue(
  loading: boolean,
  expectedDuration: number = 3000,
  maxFakedProgress: number = 0.9
) {
  const [progress, setProgress] = useState(0);
  const progressValue = useMotionValue(0);
  const activeAnimationsRef = useRef<Array<{ stop: () => void }>>([]);

  const clearAllAnimations = () => {
    activeAnimationsRef.current.forEach((animation) => animation.stop());
    activeAnimationsRef.current = [];
  };

  useEffect(() => {
    // Per-effect cancellation guard. Motion resolves a stopped animation's
    // promise (it does not reject), so every `await` inside this effect
    // must be followed by a cancelled check to avoid chaining a new
    // animation after the effect has been torn down or superseded.
    let cancelled = false;

    // Monotonic writer: UX progress must never move backwards while a
    // single loading cycle is in flight. Explicit resets (to 0 on a fresh
    // load, or to 100 on completion) bypass this via setProgress(value).
    const pushProgress = (v: number) => {
      if (cancelled) return;
      setProgress((prev) => (v > prev ? v : prev));
    };

    const createAsymptoticAnimation = (
      targetValue: number,
      startValue: number
    ) => {
      const k = Math.log(2) / 2; // Mathematical decay rate

      const animation = animate(progressValue, targetValue, {
        duration: Infinity,
        ease: (t: number) => {
          // Asymptotic function: approaches target asymptotically
          const easedTime = easeOut(t);
          return (
            startValue +
            (targetValue - startValue) * (1 - Math.exp(-k * easedTime * 10))
          );
        },
        onUpdate: (value: number) => pushProgress(value),
      });

      activeAnimationsRef.current.push(animation);
      return animation;
    };

    const createLinearAnimation = async (maxProgress: number) => {
      const targetProgress = maxProgress * 0.8;

      const animation = animate(progressValue, targetProgress, {
        duration: expectedDuration / 1000,
        ease: easeIn,
        onUpdate: (value: number) => pushProgress(value),
      });

      activeAnimationsRef.current.push(animation);
      await animation;
      if (cancelled) return;

      createAsymptoticAnimation(maxProgress, targetProgress);
    };

    if (loading) {
      // Fresh load cycle — stop anything still running from a prior cycle
      // and hard-reset to 0. This is the only path that moves progress
      // backwards, and it is intentional.
      clearAllAnimations();
      progressValue.set(0);
      setProgress(0);

      void createLinearAnimation(maxFakedProgress * 100);
    } else {
      // Loading completed — stop the faked progress animation so it can
      // no longer overwrite progressValue, then run a short tween to 100
      // so the bar reads as "done" before the overlay fades out.
      clearAllAnimations();
      const current = progressValue.get();
      if (current >= 100) {
        setProgress(100);
      } else {
        const completion = animate(progressValue, 100, {
          duration: 0.25,
          ease: easeOut,
          onUpdate: (value: number) => {
            if (cancelled) return;
            setProgress(value);
          },
        });
        activeAnimationsRef.current.push(completion);
      }
    }

    return () => {
      cancelled = true;
      clearAllAnimations();
    };
  }, [loading, expectedDuration, maxFakedProgress, progressValue]);

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
  maxFakedProgress?: number;
  className?: string;
}

function UXProgress({
  loading,
  expectedDuration = 3000,
  maxFakedProgress = 0.9,
  className,
}: UXProgressProps) {
  const progress = useUXProgressValue(
    loading,
    expectedDuration,
    maxFakedProgress
  );

  return <Progress value={progress} className={className} />;
}

export function FullscreenLoadingOverlay({
  loading,
  expectedDuration = 3000,
  minDuration = 1000,
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
              maxFakedProgress={maxFakedProgress}
              className="w-52"
            />
            {errmsg ? (
              <motion.p
                className="text-xs text-destructive"
                role="alert"
                aria-live="assertive"
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
