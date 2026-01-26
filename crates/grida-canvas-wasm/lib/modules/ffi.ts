export type WasmModuleLike = {
  _allocate(len: number): number;
  _deallocate(ptr: number, len: number): void;
  lengthBytesUTF8(str: string): number;
  stringToUTF8(str: string, outPtr: number, maxBytesToWrite: number): void;
  HEAPU8: Uint8Array;
};

export namespace ffi {
  const UTF8_DECODER = new TextDecoder("utf-8");

  export function allocString(
    module: WasmModuleLike,
    s: string
  ): [ptr: number, len: number] {
    const len = module.lengthBytesUTF8(s) + 1;
    const ptr = module._allocate(len);
    module.stringToUTF8(s, ptr, len);
    return [ptr, len];
  }

  export function free(module: WasmModuleLike, ptr: number, len: number) {
    module._deallocate(ptr, len);
  }

  export function allocBytes(
    module: WasmModuleLike,
    bytes: Uint8Array
  ): [ptr: number, len: number] {
    const len = bytes.length;
    const ptr = module._allocate(len);
    module.HEAPU8.set(bytes, ptr);
    return [ptr, len];
  }

  export function readLenPrefixedBytes(
    module: WasmModuleLike,
    outptr: number
  ): Uint8Array {
    // [u32 len][bytes...]
    const view = new DataView(
      module.HEAPU8.buffer,
      module.HEAPU8.byteOffset,
      module.HEAPU8.byteLength
    );
    const dataLength = view.getUint32(outptr, true);
    const data = module.HEAPU8.slice(outptr + 4, outptr + 4 + dataLength);
    module._deallocate(outptr, 4 + dataLength);
    return data;
  }

  export function readLenPrefixedString(
    module: WasmModuleLike,
    outptr: number
  ): string {
    const bytes = readLenPrefixedBytes(module, outptr);
    return UTF8_DECODER.decode(bytes);
  }
}
