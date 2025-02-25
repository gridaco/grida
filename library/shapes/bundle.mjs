import fs from "fs";
import path from "path";
import { optimize } from "svgo";

// Load SVGO configuration
import svgoConfig from "./svgo/svgo.config.mjs";

// Get input and output directories from arguments
const [inputDir, outputDir] = process.argv.slice(2);

if (!inputDir || !outputDir) {
  console.error("Usage: node bundle.js <inputDir> <outputDir>");
  process.exit(1);
}

// Ensure the output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Initialize the info object
const info = [];

// Process all SVG files in the input directory
fs.readdirSync(inputDir).forEach((file) => {
  const filePath = path.join(inputDir, file);

  // Only process .svg files
  if (path.extname(file).toLowerCase() === ".svg") {
    const svgData = fs.readFileSync(filePath, "utf-8");

    // Optimize the SVG
    const result = optimize(svgData, { path: filePath, ...svgoConfig });

    // Write optimized SVG to output directory
    const outputFilePath = path.join(outputDir, file);
    fs.writeFileSync(outputFilePath, result.data);

    // Append file info to the info.json
    info.push({
      name: file,
    });

    console.log(`Optimized: ${file}`);
  }
});

// Write info.json
const infoPath = path.join(outputDir, "info.json");
fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));

console.log(`Optimization complete. Info saved to ${infoPath}`);
