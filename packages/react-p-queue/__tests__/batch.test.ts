import BatchQueue from "../batch";

interface Task {
  id: string;
  payload: string;
}

interface Result {
  id: string;
  status: string;
}

const mockResolver = async (batch: Task[]): Promise<Result[]> => {
  return batch.map((task) => ({
    id: task.id,
    status: `processed: ${task.payload}`,
  }));
};

describe("BatchQueue", () => {
  beforeAll(() => {
    vi.useFakeTimers(); // Use fake timers to control time-based events
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  let queue: BatchQueue<Task, Result, "id">;

  beforeEach(() => {
    queue = new BatchQueue<Task, Result, "id">({
      batchSize: 3, // Set a batch size of 3 for testing
      throttleTime: 1000, // Set throttle time to 1 second
      resolver: mockResolver,
      identifier: "id",
    });
  });

  it("should add tasks and resolve when batch size is reached", async () => {
    const promises = [
      queue.addTask({ id: "1", payload: "task1" }),
      queue.addTask({ id: "2", payload: "task2" }),
      queue.addTask({ id: "3", payload: "task3" }), // This should trigger flush
    ];

    await vi.runAllTimersAsync();

    const results = await Promise.all(promises);

    expect(results).toEqual([
      { id: "1", status: "processed: task1" },
      { id: "2", status: "processed: task2" },
      { id: "3", status: "processed: task3" },
    ]);
  });

  it("should flush the batch after throttle time if batch size is not reached", async () => {
    const promises = [
      queue.addTask({ id: "1", payload: "task1" }),
      queue.addTask({ id: "2", payload: "task2" }),
    ];

    await vi.advanceTimersByTimeAsync(1000);

    const results = await Promise.all(promises);

    expect(results).toEqual([
      { id: "1", status: "processed: task1" },
      { id: "2", status: "processed: task2" },
    ]);
  });

  it("should reject the promises if resolver fails", async () => {
    const errorResolver = async (batch: Task[]): Promise<Result[]> => {
      throw new Error("Resolver failed");
    };

    const errorQueue = new BatchQueue<Task, Result, "id">({
      batchSize: 2,
      throttleTime: 500,
      resolver: errorResolver,
      identifier: "id",
    });

    const promises = [
      errorQueue.addTask({ id: "1", payload: "task1" }),
      errorQueue.addTask({ id: "2", payload: "task2" }), // This should trigger flush
    ];

    // Attach handlers before timers run to avoid unhandled rejection warnings
    const settled = Promise.allSettled(promises);

    await vi.runAllTimersAsync();

    const results = await settled;

    expect(results).toEqual([
      { status: "rejected", reason: new Error("Resolver failed") },
      { status: "rejected", reason: new Error("Resolver failed") },
    ]);
  });
});
