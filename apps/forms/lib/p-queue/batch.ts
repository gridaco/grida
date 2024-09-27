/**
 * Interface representing an object with an identifier.
 * This ensures that both task and result types have the same identifier property.
 */
interface Identifiable {
  [key: string]: any;
}
/**
 * Class representing a batch queue with size and time-based flush control.
 * Accumulates tasks until the batch size is met or a timeout occurs, and then
 * processes them using a provided resolver function.
 *
 * @template T - The type of the tasks being queued.
 * @template R - The type of the resolver result.
 */
class BatchQueue<
  T extends Identifiable,
  R extends Identifiable,
  K extends keyof T & keyof R,
> {
  private batchSize: number;
  private throttleTime: number;
  private resolver: (batch: T[]) => Promise<R[]>;
  private identifier: K;
  private buffer: {
    task: T;
    resolve: (result: R) => void;
    reject: (error: any) => void;
  }[];
  private timeout: NodeJS.Timeout | null;
  private flushing: boolean; // New flag to prevent multiple flushes

  /**
   * Creates an instance of BatchQueue.
   *
   * @param {Object} params - Configuration parameters for the batch queue.
   * @param {number} params.batchSize - The maximum size of the batch before triggering a flush.
   * @param {number} params.throttleTime - The maximum time (in milliseconds) to wait before triggering a flush.
   * @param {(batch: T[]) => Promise<R[]>} params.resolver - The function to call with the batch of tasks.
   * @param {keyof R} params.identifier - The property in the resolver result to match with the task.
   */
  constructor({
    batchSize,
    throttleTime,
    resolver,
    identifier,
  }: {
    batchSize: number;
    throttleTime: number;
    resolver: (batch: T[]) => Promise<R[]>;
    identifier: K;
  }) {
    this.batchSize = batchSize;
    this.throttleTime = throttleTime;
    this.resolver = resolver;
    this.identifier = identifier;
    this.buffer = [];
    this.timeout = null;
    this.flushing = false; // Initialize the flushing flag
  }

  /**
   * Adds a task to the batch queue. If the batch size is reached, it triggers an immediate flush.
   * Otherwise, it waits for the specified throttle time before flushing the remaining tasks.
   *
   * @param {T} task - The task to be added to the batch queue.
   * @returns {Promise<R>} A promise that resolves with the result of the task once handled.
   */
  addTask(task: T): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      this.buffer.push({ task, resolve, reject });

      if (this.buffer.length >= this.batchSize) {
        this.flush();
      } else {
        if (!this.timeout) {
          this.timeout = setTimeout(() => this.flush(), this.throttleTime);
        }
      }
    });
  }

  /**
   * Flushes the current batch of tasks. This will clear the buffer and call the resolver function
   * with the current batch. If a timeout was set, it will be cleared.
   *
   * @returns {Promise<void>} A promise that resolves once the resolver function has completed.
   */
  async flush(): Promise<void> {
    if (this.flushing) return; // Prevent concurrent flushes
    this.flushing = true;

    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, this.batchSize);
      try {
        const results = await this.resolver(batch.map((item) => item.task));
        results.forEach((result) => {
          const matchedTask = batch.find(
            (item) =>
              // @ts-expect-error
              item.task[this.identifier] === result[this.identifier]
          );
          if (matchedTask) {
            matchedTask.resolve(result);
          }
        });
      } catch (error) {
        batch.forEach((item) => item.reject(error));
      }
    }

    this.flushing = false; // Reset flushing flag after completion
  }
}

export default BatchQueue;
