export namespace datatransfer {
  export type DataTransferPayload =
    | {
        type: "svg";
        name: string;
        src: string;
      }
    | {
        type: "image";
        name: string;
        src: string;
        width?: number;
        height?: number;
      };

  export const key = "x-grida-data-transfer";
  export function encode(data: DataTransferPayload) {
    const txt = JSON.stringify(data);
    return txt;
  }
  export function decode(data: string): DataTransferPayload {
    return JSON.parse(data) as DataTransferPayload;
  }
}
