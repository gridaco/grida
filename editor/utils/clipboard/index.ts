import toast from "react-hot-toast";

export function copy(data: string, options?: { notify?: boolean }): void {
  // Copy the data to the clipboard
  navigator.clipboard.writeText(data);

  if (options?.notify) {
    // Notify the user that the data has been copied
    toast.success("Copied to clipboard");
  }
}
