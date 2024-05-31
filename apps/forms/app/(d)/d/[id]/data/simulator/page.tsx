"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SimulationPlan,
  Simulator,
  SimulatorSubmission,
} from "@/lib/simulator";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useStopwatch, useTimer } from "react-timer-hook";

type SimulatorStatus = "none" | "idle" | "running" | "paused";

const START_COUNTDOWN = 5 * 1000;

export default function SimulatorPage({
  params,
}: {
  params: {
    id: string;
  };
}) {
  const form_id = params.id;
  const [status, setStatus] = useState<SimulatorStatus>("none");
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [plan, setPlan] = useState<SimulationPlan | null>(null);

  return (
    <main className="p-10 font-mono h-full">
      <Dialog open={status === "none"}>
        <DialogContent>
          <SimulationPlanner
            onStartQueued={(plan) => {
              setPlan(plan);
              setStatus("idle");
              setStartsAt(new Date(Date.now() + START_COUNTDOWN));
              setTimeout(() => {
                const width = 1280;
                const height = 720;
                const left = screen.width - width - 50;
                const top = screen.height - height - 100;

                window.open(
                  "./analytics",
                  "_blank",
                  `width=${width},height=${height},left=${left},top=${top}`
                );
              }, 200);
            }}
          />
        </DialogContent>
      </Dialog>
      {status === "idle" && (
        <WillStartSoon
          at={startsAt!}
          onExpire={() => {
            if (status === "idle") {
              setStatus("running");
              toast.success("Simulation started");
            }
          }}
        />
      )}
      {status === "running" && <TaskHandler form_id={form_id} plan={plan!} />}
    </main>
  );
}

function TaskHandler({
  form_id,
  plan,
}: {
  form_id: string;
  plan: SimulationPlan;
}) {
  const simulator = useMemo(
    () => new Simulator(form_id, plan),
    [form_id, plan]
  );

  const [isEnded, setIsEnded] = useState(false);
  const [responses, setResponses] = useState<SimulatorSubmission[]>([]);

  useEffect(() => {
    const handleNewResponse = (id: string, payload: SimulatorSubmission) => {
      setResponses((prev) => {
        const index = prev.findIndex((r) => r._id === id);
        if (index >= 0) {
          const copy = [...prev];
          copy[index] = payload;
          return copy;
        } else {
          return [...prev, payload];
        }
      });
    };

    simulator.onResponse(handleNewResponse);

    simulator.onEnd(() => {
      setIsEnded(true);
      toast.success("Simulation ended", {
        duration: 10000,
      });
    });

    simulator.start();

    return () => {
      simulator.pause();
      simulator.offResponse(handleNewResponse);
    };
  }, [simulator]);

  return (
    <div className="relative h-full flex flex-col pb-20">
      <div className="fixed z-10 flex gap-10">
        <StartedAndCounting
          isEnded={isEnded}
          onRunningChange={(running) => {
            if (!running) {
              simulator.pause();
            } else {
              simulator.resume();
            }
          }}
        />
        <Card>
          <CardHeader>
            <h2>Responses</h2>
            <small className="text-muted-foreground">
              Responses from the simulation
            </small>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span>
                <strong>Total:</strong> {responses.length}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="mt-40 grow">
        <Table className="h-full">
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Resolved At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="overflow-y-auto">
            {responses.map((response, index) => (
              <TableRow key={index}>
                <TableCell>
                  <StatusBadge status={response.status as number} />
                </TableCell>
                <TableCell>
                  <small className="text-muted-foreground">
                    {response._id}
                  </small>
                </TableCell>
                <TableCell>
                  {response.resolvedAt
                    ? format(response.resolvedAt, "HH:mm:ss.SSS")
                    : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const status_colors = {
  0: "gray",
  200: "green",
  400: "yellow",
  500: "red",
};

const status_texts = {
  0: "idle",
  200: "ok",
  400: "bad",
  500: "error",
};

function StatusBadge({ status }: { status?: number }) {
  return (
    <span>
      <div
        style={{
          display: "inline-block",
          width: 10,
          height: 10,
          borderRadius: "50%",
          backgroundColor: (status_colors as any)[status ?? 0],
        }}
      />
      <span className="ms-2">{(status_texts as any)[status ?? 0]}</span>
    </span>
  );
}

function SimulationPlanner({
  onStartQueued,
}: {
  onStartQueued?: (plan: SimulationPlan) => void;
}) {
  const [n, setN] = useState(50);
  const [maxq, setMaxQ] = useState(5);
  const [delay, setDelay] = useState(800);
  const [randomness, setRandomness] = useState(0.5);

  return (
    <div className="max-w-xl flex flex-col gap-8">
      <header>
        <h1 className="text-xl font-bold">New Simulation</h1>
        <small className="text-muted-foreground">
          This is a simulator to simulate the form submission. This is useful
          for testing purposes.{" "}
          <i>Note: Closing this page will stop the simulation.</i>
        </small>
      </header>
      <hr className="my-4" />
      <div className="grid gap-4">
        <Label htmlFor="n">Number of Bots</Label>
        <Input
          id="n"
          min={1}
          max={1000}
          type="number"
          placeholder="100"
          value={n}
          onChange={(e) => setN(Number(e.target.value))}
        />
      </div>
      <div className="grid gap-4">
        <Label htmlFor="maxq">
          Max Q{" "}
          <small className="text-muted-foreground">
            (max number of concurrent submissions)
          </small>
        </Label>
        <Slider
          id="maxq"
          min={1}
          step={1}
          max={100}
          value={[maxq]}
          onValueChange={(v) => setMaxQ(v[0])}
        />
        <small>{maxq}</small>
      </div>
      <div className="grid gap-4">
        <Label htmlFor="delay">
          Delay in Millisecond{" "}
          <small className="text-muted-foreground">(1s = 1,000ms)</small>
        </Label>
        <Slider
          id="delay"
          min={0}
          max={10000}
          value={[delay]}
          onValueChange={(v) => setDelay(v[0])}
        />
        <small>{delay}ms</small>
      </div>
      <div className="grid gap-4">
        <Label htmlFor="randomness">
          Random Coefficient{" "}
          <small className="text-muted-foreground">
            (randomness across simulation)
          </small>
        </Label>
        <Slider
          id="randomness"
          min={0}
          max={1}
          step={0.01}
          value={[randomness]}
          onValueChange={(v) => setRandomness(v[0])}
        />
        <small>{randomness}</small>
      </div>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant={"secondary"}>Start Simulation</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>About This Simulation</DialogTitle>
            <DialogDescription>
              <strong>Note:</strong> Starting simulation <u>WILL INSERT</u>{" "}
              actual data.
              <br />
              <br />
              bots will act as humans and submit the form. Existing data will
              not be affected, although global attributes such as Inventory,
              etc. will be affected.
              <br />
              <br />
              This is only recommended for testing purposes and before going
              production.
            </DialogDescription>
          </DialogHeader>
          <div></div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button
                variant={"destructive"}
                onClick={() => {
                  onStartQueued?.({
                    n,
                    delaybetween: delay,
                    queue: maxq,
                    randomness,
                  });
                }}
              >
                Understood, Start Simulation
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WillStartSoon({ at, onExpire }: { at: Date; onExpire?: () => void }) {
  const {
    seconds,
    minutes,
    hours,
    days,
    isRunning,
    start,
    pause,
    resume,
    restart,
  } = useTimer({
    // +10 seconds
    expiryTimestamp: at,
    onExpire,
  });

  return (
    <Card>
      <CardHeader>
        <h2>Simulation will start in</h2>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 items-center">
          <div className="text-4xl font-bold">
            {days}d {hours}h {minutes}m {seconds}s
          </div>
          <div className="ms-10">
            {isRunning ? (
              <Button
                variant="destructive"
                onClick={() => {
                  pause();
                  toast.success("Simulation aborted");
                }}
              >
                Abort
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  restart(new Date(Date.now() + 10000));
                  toast.success("Simulation restarted");
                }}
              >
                Restart
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StartedAndCounting({
  isEnded,
  onRunningChange,
}: {
  isEnded?: boolean;
  onRunningChange?: (running: boolean) => void;
}) {
  const { seconds, minutes, hours, days, isRunning, start, pause } =
    useStopwatch({
      autoStart: true,
    });

  useEffect(() => {
    onRunningChange?.(isRunning);
  }, [isRunning, onRunningChange]);

  useEffect(() => {
    if (isEnded) {
      pause();
    }
  }, [isEnded]);

  return (
    <Card>
      <CardHeader>
        {isEnded ? <h2>Simulation Ended</h2> : <h2>Simulation is Running</h2>}
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 items-center">
          <div className="text-4xl font-bold">
            {days}d {hours}h {minutes}m {seconds}s
          </div>
          <div className="ms-10">
            {isEnded ? (
              <></>
            ) : (
              <>
                {isRunning ? (
                  <Button variant="secondary" onClick={pause}>
                    Pause
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={start}>
                    Resume
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
