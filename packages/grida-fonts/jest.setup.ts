// Mock FontFace constructor for testing
const MockFontFace = jest.fn().mockImplementation(function (
  this: any,
  family: string,
  src: string,
  descriptors: any
) {
  this.family = family;
  this.src = src;
  this.style = descriptors.style || "normal";
  this.weight = descriptors.weight || "400";
  this.stretch = descriptors.stretch || "normal";
  this.display = descriptors.display || "auto";
  this.load = jest.fn().mockResolvedValue(this);
  return this;
});

// Mock global FontFace
(global as any).FontFace = MockFontFace;

// Mock document.fonts
Object.defineProperty(global, "document", {
  value: {
    fonts: {
      add: jest.fn(),
      check: jest.fn().mockReturnValue(false),
      delete: jest.fn(),
    },
  },
  writable: true,
});

// Mock fetch
(global as any).fetch = jest.fn().mockImplementation((url: string) => {
  return Promise.resolve({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    json: () => Promise.resolve({}),
  });
});

// Mock window for Typr library
(global as any).window = {
  TextDecoder: class TextDecoder {
    constructor() {}
    decode(buffer: Uint8Array): string {
      return new TextDecoder().decode(buffer);
    }
  },
};
