module.exports = {
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.(ts)$",
  testPathIgnorePatterns: ["/dist/", "/node_modules/"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  collectCoverage: true,
};
