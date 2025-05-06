import { useState } from "react";
import { unparse } from "papaparse";

/**
 * Maximum number of rows allowed for client-side CSV export.
 * This is a hard limit to prevent performance issues and browser memory constraints.
 */
const HARD_LIMIT_MAX_CLIENT_SIDE_BULK_EXPORT_ROWS_COUNT = 50000;

/**
 * Configuration object for the CSV export hook.
 * @template T - The type of data being exported
 */
type ExportConfig<T> = {
  /**
   * Function to fetch data with pagination and count.
   * This function should return both the data for the current page and the total count.
   * The hook will use this to determine the total number of pages and fetch all data.
   *
   * @param page - The current page number (1-based)
   * @param pageSize - Number of items per page
   * @returns Promise containing the data for the current page and total count
   */
  fetchData: (
    page: number,
    pageSize: number
  ) => Promise<{
    data: T[];
    count: number;
  }>;

  /**
   * Function to transform a single data item into CSV row values.
   * Each item in the returned array represents a column in the CSV.
   *
   * @param data - The data item to transform
   * @returns Array of string values for the CSV row
   */
  transformToCSV: (data: T) => string[];

  /**
   * Array of column headers for the CSV file.
   * These will be the first row in the exported CSV.
   */
  headers: string[];

  /**
   * Optional page size for pagination.
   * Defaults to 100 if not specified.
   */
  pageSize?: number;

  /**
   * Optional sleep duration in milliseconds between page fetches.
   * This helps prevent server overload when fetching large datasets.
   *
   * @default 100
   */
  interval?: number;
};

/**
 * A reusable hook for exporting data to CSV with pagination support.
 * This hook handles the entire export process including:
 * - Paginated data fetching
 * - Progress tracking
 * - CSV file generation and download
 * - Error handling
 * - Hard limit enforcement
 * - Optional sleep between page fetches to prevent server overload
 *
 * @template T - The type of data being exported
 * @param config - Configuration object for the export process
 * @returns Object containing export function and state
 *
 * @example
 * ```tsx
 * const { exportToCSV, isExporting, progress, error } = useExportCSV({
 *   fetchData: async (page, pageSize) => {
 *     const { data, count } = await supabase
 *       .from('table')
 *       .select('*', { count: 'exact' })
 *       .range((page - 1) * pageSize, page * pageSize - 1);
 *     return { data, count };
 *   },
 *   transformToCSV: (item) => [
 *     item.name,
 *     item.email,
 *     item.created_at
 *   ],
 *   headers: ['Name', 'Email', 'Created At'],
 *   sleepBetweenPages: 1000 // Sleep 1 second between pages
 * });
 * ```
 */
export function useExportCSV<T>(config: ExportConfig<T>) {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const reset = () => {
    setIsExporting(false);
    setProgress(0);
    setError(null);
    setIsComplete(false);
  };

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Exports data to CSV file.
   * This function:
   * 1. Fetches the total count of records
   * 2. Checks against the hard limit
   * 3. Fetches all data in pages
   * 4. Generates and downloads the CSV file
   *
   * @throws Error if:
   * - Total count exceeds HARD_LIMIT_MAX_CLIENT_SIDE_BULK_EXPORT_ROWS_COUNT
   * - Failed to get total count
   * - Any error during data fetching or CSV generation
   */
  const exportToCSV = async () => {
    setIsExporting(true);
    setProgress(0);
    setError(null);
    setIsComplete(false);

    try {
      const pageSize = config.pageSize || 100;
      const interval = config.interval || 100;

      // First fetch to get total count
      const { data: firstPage, count } = await config.fetchData(1, pageSize);

      if (!count) {
        throw new Error("Failed to get total count");
      }

      if (count > HARD_LIMIT_MAX_CLIENT_SIDE_BULK_EXPORT_ROWS_COUNT) {
        throw new Error(
          `Export limit exceeded. Maximum allowed rows: ${HARD_LIMIT_MAX_CLIENT_SIDE_BULK_EXPORT_ROWS_COUNT}`
        );
      }

      let allData: T[] = [...firstPage];
      const totalPages = Math.ceil(count / pageSize);

      // Fetch remaining pages
      for (let page = 2; page <= totalPages; page++) {
        // Sleep between pages if configured
        if (interval > 0) {
          await sleep(interval);
        }

        const { data } = await config.fetchData(page, pageSize);
        allData = [...allData, ...data];
        setProgress((page - 1) * pageSize);
      }

      // Convert data to CSV format using papaparse
      const csvData = allData.map((item) => config.transformToCSV(item));
      const csvContent = unparse(
        {
          fields: config.headers,
          data: csvData,
        },
        {
          quotes: true, // Quote fields to handle special characters
          escapeChar: '"', // Use double quotes for escaping
          delimiter: ",",
          newline: "\n",
          header: true,
        }
      );

      // Create and download CSV file
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `export-${new Date().toISOString()}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error exporting to CSV:", error);
      setError(
        error instanceof Error
          ? error.message
          : "An error occurred during export"
      );
      throw error;
    } finally {
      setIsComplete(true);
      setIsExporting(false);
      setProgress(0);
    }
  };

  return {
    /** Function to trigger the CSV export process */
    exportToCSV,
    /** Whether an export is currently in progress */
    isExporting,
    /** Current progress of the export (number of rows processed) */
    progress,
    /** Error message if the export failed, null if successful */
    error,
    /** Whether the export has completed successfully */
    isComplete,
    /** Reset the export state */
    reset,
  };
}
