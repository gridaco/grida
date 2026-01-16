// Shared test setup for this package (Vitest).

// Mock FontFace constructor for testing
const MockFontFace: any = vi.fn().mockImplementation(function (
  this: any,
  family: string,
  src: string | ArrayBuffer,
  descriptors: any
) {
  this.family = family;
  this.src = src;
  this.style = descriptors.style || "normal";
  this.weight = descriptors.weight || "400";
  this.stretch = descriptors.stretch || "normal";
  this.display = descriptors.display || "auto";
  this.load = vi.fn().mockResolvedValue(this);
  return this;
});

// Mock global FontFace
(globalThis as any).FontFace = MockFontFace;

// Mock document.fonts
Object.defineProperty(globalThis, "document", {
  value: {
    fonts: {
      add: vi.fn(),
      check: vi.fn().mockReturnValue(false),
      delete: vi.fn(),
    },
  },
  writable: true,
});

// Mock fetch
(globalThis as any).fetch = vi.fn().mockImplementation((_url: string) => {
  return Promise.resolve({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    json: () => Promise.resolve({}),
  });
});

// Mock window for Typr library
const NativeTextDecoder = (globalThis as any).TextDecoder;
(globalThis as any).window = {
  TextDecoder: NativeTextDecoder,
};

