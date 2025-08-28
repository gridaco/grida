describe("Typr Module", () => {
  it("should be able to import typr module", () => {
    // Test that the module can be imported without errors
    expect(() => {
      require("../dist/typr");
    }).not.toThrow();
  });

  it("should export typr module structure", () => {
    const typrModule = require("../dist/typr");
    expect(typrModule).toBeDefined();
    expect(typeof typrModule).toBe("object");
  });
});
