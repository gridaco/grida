# react-p-queue

A React library for handling promise-based queue management with support for batch processing, throttling, and concurrency control using `p-queue`.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [QueueProvider](#queueprovider)
  - [useQueue Hook](#usequeue-hook)
  - [Example](#example)
- [API Reference](#api-reference)
  - [QueueProvider Props](#queueprovider-props)
  - [useQueue](#usequeue)
  - [useQueueStore](#usequeuestore)
- [License](#license)

## Introduction

`react-p-queue` is a React library designed to simplify and optimize the management of promise-based queues in React applications. It leverages [`p-queue`](https://github.com/sindresorhus/p-queue) for concurrency control and includes a batch processing mechanism to handle tasks efficiently.

This is particularly useful in scenarios where you need to process a large number of asynchronous tasks, such as loading data from a database or fetching resources from an API, without overwhelming the system or exceeding rate limits.

## Features

- **Concurrency Control**: Limit the number of concurrent promises using `p-queue`.
- **Batch Processing**: Accumulate tasks and process them in batches to improve performance.
- **Throttling**: Control the rate at which batches are processed.
- **Modular and Generic**: Designed to be flexible and reusable across different use cases.
- **TypeScript Support**: Written in TypeScript with full type definitions.

## Installation

```bash
pnpm add react-p-queue
```

## Usage

### QueueProvider

Wrap your application or component tree with the `QueueProvider` to set up the queue context.

```tsx
import React from "react";
import QueueProvider from "react-p-queue";
import PQueue from "p-queue";

const queue = new PQueue({ concurrency: 5 });

function App() {
  return (
    <QueueProvider
      queue={queue}
      batch={100}
      throttle={500}
      config={{
        identifier: "id", // The unique identifier for your tasks/results
      }}
      resolver={async (...tasks) => {
        // Your batch resolver function
        const results = await fetchDataForTasks(tasks);
        return { data: results, error: null };
      }}
    >
      {/_ Your application components _/}
    </QueueProvider>
  );
}
```

### useQueue Hook

Use the `useQueue` hook to add tasks to the queue and manage them.

```tsx
import React from "react";
import { useQueue } from "react-p-queue";

function MyComponent() {
  const { add, clear } = useQueue<ResultType, TaskType>();

  const handleAddTask = async (task: TaskType) => {
    try {
      const result = await add(task);
      // Handle the result
    } catch (error) {
      // Handle the error
    }
  };

  return <div>{/_ Your component UI _/}</div>;
}
```

### Example

Here's a complete example demonstrating how to use `react-p-queue` to manage a queue of tasks with batch processing:

```tsx
import React, { useEffect } from "react";
import QueueProvider, { useQueue, useQueueStore } from "react-p-queue";
import PQueue from "p-queue";

// Define your task and result types
type TaskType = { id: string; data: any };
type ResultType = { id: string; result: any };

const queue = new PQueue({ concurrency: 5 });

function App() {
  return (
    <QueueProvider<ResultType, TaskType>
      queue={queue}
      batch={10}
      throttle={1000}
      config={{ identifier: "id" }}
      resolver={async (...tasks) => {
        // Simulate batch processing
        const results = tasks.map((task) => ({
          id: task.id,
          result: processData(task.data),
        }));
        return { data: results, error: null };
      }}
    >
      <MyComponent />
    </QueueProvider>
  );
}

function MyComponent() {
  const { add } = useQueue<ResultType, TaskType>();
  const store = useQueueStore<ResultType, TaskType>();

  useEffect(() => {
    const task: TaskType = { id: "task1", data: {} };
    add(task).then((result) => {
      console.log("Task result:", result);
    });
  }, [add]);

  return (
    <div>
      <h1>Queue Store</h1>
      <pre>{JSON.stringify(store, null, 2)}</pre>
    </div>
  );
}

export default App;
```

## API Reference

### QueueProvider Props

| Prop       | Type                                                    | Description                                                                                                                                                         |
| ---------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queue`    | `PQueue`                                                | An instance of `p-queue` to control concurrency.                                                                                                                    |
| `batch`    | `number` &#124; `null` &#124; `false`                   | The maximum number of tasks to process in a batch. If `null` or `false`, batch processing is disabled.                                                              |
| `throttle` | `number` &#124; `null` &#124; `false`                   | The throttle time in milliseconds before processing a batch. If `null` or `false`, throttling is disabled.                                                          |
| `config`   | `PQConfig<T>`                                           | Configuration object containing the `identifier` key used to match tasks and results.                                                                               |
| `resolver` | `PQBatchResolver<T, P>` &#124; `PQSingleResolver<T, P>` | The resolver function that processes tasks. In batch mode, it should accept multiple tasks and return their results. In single mode, it processes individual tasks. |
| `children` | `React.ReactNode`                                       | The child components that will have access to the queue context.                                                                                                    |

### useQueue

The `useQueue` hook provides methods to add tasks to the queue and clear the queue.

typescript

Copy code

`function useQueue<T, P>(): {
  add: (task: P) => Promise<PQResolverResult<T>>;
  clear: () => void;
}`

#### Returns

- `add`: A function to add a task to the queue. Returns a promise that resolves with the result of the task.
- `clear`: A function to clear the queue and any stored results.

### useQueueStore

The `useQueueStore` hook returns the current store of task results.

typescript

Copy code

`function useQueueStore<T, P>(): PQResolverResult<T, any>[]`

## License

MIT License

---

**Note**: This library assumes you have an understanding of promises, asynchronous programming, and React hooks. Make sure to install `p-queue` and include any necessary polyfills if you are targeting environments that lack support for certain JavaScript features.

**BatchQueue Explanation:**

The `BatchQueue` class in `batch.ts` is designed to accumulate tasks and process them in batches based on size or time constraints. It handles the queuing logic and works in conjunction with `p-queue` to control concurrency.
