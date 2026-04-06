// ---------------------------------------------------------------------------
// @grida/history — public API
// ---------------------------------------------------------------------------

// Types (re-export all interfaces)
export type {
  Delta,
  Transaction,
  TransactionState,
  Preview,
  PreviewState,
  Stack,
  History,
  HistoryProvider,
  HistoryEvents,
  CommittedTransaction,
  TransactionOrigin,
  TransactionOptions,
  Disposable,
} from "./types";

// Implementation (the only concrete export consumers need)
export { HistoryImpl } from "./history";
export type { HistoryOptions } from "./history";

// Test utilities (exported for consumers who write integration tests)
export { __resetTransactionIdCounter } from "./transaction";
export { __resetPreviewIdCounter } from "./preview";
