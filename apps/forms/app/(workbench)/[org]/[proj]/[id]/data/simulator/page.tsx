"use client";

import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Env } from "@/env";
import { formerrorlink, formlink } from "@/lib/forms/url";
import {
  SimulationPlan,
  Simulator,
  SimulatorSubmission,
} from "@/lib/simulator";
import { useEditorState } from "@/scaffolds/editor";
import { FormSubmitErrorCode } from "@/types/private/api";
import { OpenInNewWindowIcon } from "@radix-ui/react-icons";
import { format } from "date-fns";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useStopwatch, useTimer } from "react-timer-hook";

type SimulatorStatus = "none" | "idle" | "running" | "paused";

const START_COUNTDOWN = 5 * 1000;

export default function SimulatorPage() {
  const [state] = useEditorState();
  const { form } = state;
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
      {status === "running" && (
        <TaskHandler form_id={form.form_id} plan={plan!} />
      )}
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const simulator = useMemo(
    () => new Simulator(form_id, plan),
    [form_id, plan]
  );

  const [isEnded, setIsEnded] = useState(false);
  const [requests, setRequests] = useState<SimulatorSubmission[]>([]);

  useEffect(() => {
    const handleRequestUpdate = (id: string, payload: SimulatorSubmission) => {
      setRequests((prev) => {
        const index = prev.findIndex((r) => r.__id === id);
        if (index >= 0) {
          const copy = [...prev];
          copy[index] = payload;
          return copy;
        } else {
          return [...prev, payload];
        }
      });

      // scroll to bottom
      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    };

    simulator.addOnRequestChangeListener(handleRequestUpdate);

    simulator.onEnd(() => {
      setIsEnded(true);
      toast.success("Simulation ended", {
        duration: 10000,
      });
    });

    simulator.start();

    return () => {
      simulator.pause();
      simulator.removeOnRequestChangeListener(handleRequestUpdate);
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
            <h2>Requests</h2>
            <small className="text-muted-foreground">
              Requests from the simulation
            </small>
          </CardHeader>
          <CardContent className="text-sm">
            <ul>
              <li>
                <strong>Total:</strong> {requests.length}
              </li>
              <li>
                <strong>Accepted:</strong>{" "}
                {requests.filter((r) => r.status === 200).length}
              </li>
              <li>
                <strong>Rejected:</strong>{" "}
                {
                  requests.filter(
                    (r) =>
                      (r.status as number) >= 400 && (r.status as number) < 500
                  ).length
                }
              </li>
              <li>
                <strong>Error:</strong>{" "}
                {requests.filter((r) => (r.status as number) >= 500).length}
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
      <div className="mt-64 grow">
        <Table className="h-full">
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Bot</TableHead>
              <TableHead>Requested At</TableHead>
              <TableHead>Resolved At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="overflow-y-auto">
            {requests.map((request, index) => (
              <TableRow key={index}>
                <TableCell>
                  <StatusBadge status={request.status as number} />
                </TableCell>
                <TableCell>
                  <ErrorCodeLink form_id={form_id} code={request.error?.code} />
                </TableCell>
                <TableCell>
                  {request.response?.id ? (
                    <>
                      <Link
                        href={
                          request.response.id
                            ? formlink(Env.web.HOST, form_id, "complete", {
                                rid: request.response?.id,
                              })
                            : "#"
                        }
                        target="_blank"
                        prefetch={false}
                      >
                        <small className="text-muted-foreground">
                          {request.response.id}
                          <OpenInNewWindowIcon className="inline w-3 h-3 ms-2 align-middle" />
                        </small>
                      </Link>
                    </>
                  ) : (
                    <>
                      <small className="text-muted-foreground">--</small>
                    </>
                  )}
                </TableCell>
                <TableCell>
                  <small className="text-muted-foreground">
                    {request.bot_id}
                  </small>
                </TableCell>
                <TableCell>
                  <small className="text-muted-foreground">
                    {format(request.requestedAt, "HH:mm:ss.S")}
                  </small>
                </TableCell>
                <TableCell>
                  <small className="text-muted-foreground">
                    {request.resolvedAt
                      ? format(request.resolvedAt, "mm:ss.S")
                      : ""}{" "}
                    {request.resolvedAt
                      ? `(${request.resolvedAt.getTime() - request.requestedAt.getTime()}ms)`
                      : ""}
                  </small>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div ref={bottomRef} className="mb-20" />
      </div>
    </div>
  );
}

function ErrorCodeLink({
  form_id,
  code,
}: {
  form_id: string;
  code?: FormSubmitErrorCode;
}) {
  if (!code) {
    return <>--</>;
  }

  let href = formerrorlink(Env.web.HOST, code, { form_id });

  return (
    <Link href={href} target="_blank" prefetch={false}>
      {code}
      <OpenInNewWindowIcon className="inline w-3 h-3 ms-2 align-middle" />
    </Link>
  );
}

const status_colors = {
  0: "gray",
  200: "green",
  400: "red",
  403: "orange",
  500: "red",
};

const status_texts = {
  0: "idle",
  200: "200",
  400: "400",
  403: "403",
  500: "500",
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
  const [bots, setBots] = useState(1);
  const [maxq, setMaxQ] = useState(5);
  const [delay, setDelay] = useState(800);
  const [randomness, setRandomness] = useState(0.5);
  const [loctype, setLoctype] = useState<"world" | "point">("world");
  const [point, setPoint] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useEffect(() => {
    if (loctype === "point") {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log(position);
          setPoint({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          console.error("geo/err", error);
          alert("Please allow location access to simulate the location");
        },
        { timeout: 5000 }
      );
    }
  }, [loctype]);

  return (
    <div className="max-w-xl flex flex-col gap-8">
      <header>
        <Badge className="mb-2" variant="outline">
          Beta
        </Badge>
        <h1 className="text-xl font-bold">New Simulation</h1>
        <small className="text-muted-foreground">
          Simulate high traffic on your form
        </small>
      </header>
      <hr className="my-4" />
      <div className="grid gap-4">
        <Label htmlFor="n">Number of Submissions</Label>
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
        <Label htmlFor="n">
          Number of Bots{" "}
          <small className="text-muted-foreground">
            Number of customer identities to simulate
          </small>
        </Label>
        <Input
          id="n"
          min={1}
          max={1000}
          type="number"
          value={bots}
          onChange={(e) => setBots(Number(e.target.value))}
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
          step={5}
          max={1000}
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
      <div className="grid gap-4">
        <Label htmlFor="loctype">
          Location{" "}
          <small className="text-muted-foreground">
            (where each submission will be from)
          </small>
        </Label>
        <Select
          value={loctype}
          // @ts-ignore
          onValueChange={setLoctype}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="world">World Wide</SelectItem>
            <SelectItem value="point">Based on Your Location</SelectItem>
          </SelectContent>
        </Select>
        <small className="text-muted-foreground">
          {loctype === "point" ? (
            <span>
              Your location:{" "}
              {point ? `${point.latitude}, ${point.longitude}` : "Loading..."}
            </span>
          ) : (
            "World wide"
          )}
        </small>
      </div>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant={"secondary"}>Start Simulation</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>About This Simulation</DialogTitle>
            <DialogDescription className="pt-4 prose prose-sm dark:prose-invert">
              <p>
                <i>
                  <strong>Note:</strong> Starting simulation <u>WILL INSERT</u>{" "}
                  actual data.
                </i>
                <br />
                <ul>
                  <li>
                    Recommended to run simulations on newly created forms, only.
                  </li>
                  <li>Existing data will not be affected.</li>
                  <li>This will create new customer entries</li>
                  <li>Bots will act as humans and submit the form.</li>
                  <li>Gloabl attributes such as Inventory will be affected</li>
                  <li>
                    You will have to clean up the data manually after the
                    simulation
                  </li>
                  <li>
                    <i>Note: Closing this page will stop the simulation.</i>
                  </li>
                </ul>
                This is only recommended for testing purposes and before going
                production. (You will be charged for the simulation, as it uses
                real data.)
              </p>
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
                    bots,
                    delaybetween: delay,
                    maxq: maxq,
                    randomness,
                    location:
                      loctype === "point"
                        ? {
                            type: "point",
                            latitude: point?.latitude ?? 0,
                            longitude: point?.longitude ?? 0,
                          }
                        : { type: "world" },
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
  }, [isEnded, pause]);

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
