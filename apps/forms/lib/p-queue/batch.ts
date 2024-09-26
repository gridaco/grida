/**
 * Class representing a batch queue with size and time-based flush control.
 * Accumulates tasks until the batch size is met or a timeout occurs, and then
 * processes them using a provided resolver function.
 *
 * @template T - The type of the tasks being queued.
 */
class BatchQueue<T> {
  private batchSize: number;
  private throttleTime: number;
  private resolver: (batch: T[]) => Promise<void>;
  private buffer: T[];
  private timeout: NodeJS.Timeout | null;

  /**
   * Creates an instance of BatchQueue.
   *
   * @param {Object} params - Configuration parameters for the batch queue.
   * @param {number} params.batchSize - The maximum size of the batch before triggering a flush.
   * @param {number} params.throttleTime - The maximum time (in milliseconds) to wait before triggering a flush.
   * @param {(batch: T[]) => Promise<void>} params.resolver - The function to call with the batch of tasks.
   */
  constructor({
    batchSize,
    throttleTime,
    resolver,
  }: {
    batchSize: number;
    throttleTime: number;
    resolver: (batch: T[]) => Promise<void>;
  }) {
    this.batchSize = batchSize;
    this.throttleTime = throttleTime;
    this.resolver = resolver;
    this.buffer = [];
    this.timeout = null;
  }

  /**
   * Adds a task to the batch queue. If the batch size is reached, it triggers an immediate flush.
   * Otherwise, it waits for the specified throttle time before flushing the remaining tasks.
   *
   * @param {T} task - The task to be added to the batch queue.
   */
  addTask(task: T): void {
    this.buffer.push(task);
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    } else {
      if (!this.timeout) {
        this.timeout = setTimeout(() => this.flush(), this.throttleTime);
      }
    }
  }

  /**
   * Flushes the current batch of tasks. This will clear the buffer and call the resolver function
   * with the current batch. If a timeout was set, it will be cleared.
   *
   * @returns {Promise<void>} A promise that resolves once the resolver function has completed.
   */
  async flush(): Promise<void> {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, this.batchSize);
      await this.resolver(batch);
    }
  }
}

export default BatchQueue;
