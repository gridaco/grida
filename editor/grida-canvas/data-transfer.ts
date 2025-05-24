export namespace datatransfer {
  export const key = "x-grida-data-transfer";
  export function encode(data: any) {
    const txt = JSON.stringify(data);
    return txt;
  }
}
