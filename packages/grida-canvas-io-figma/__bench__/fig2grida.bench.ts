/**
 * Benchmark for the fig2grida pipeline.
 *
 * Requires `rest-large.json.gz` in the same directory — a gzipped Figma
 * REST API response with 100k+ nodes.  See `README.md` for details.
 * If the file is missing the entire suite is skipped.
 *
 * Run: npx vitest bench __bench__/fig2grida.bench.ts
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { gunzipSync, zipSync, strToU8 } from "fflate";
import { bench, describe } from "vitest";
import { fig2grida, restJsonToGridaDocument } from "../fig2grida-core";
import { io } from "@grida/io";
import { format } from "@grida/io/format";

// ---------------------------------------------------------------------------
// Fixture contract
// ---------------------------------------------------------------------------

const FIXTURE_PATH = resolve(__dirname, "rest-large.json.gz");
const HAS_FIXTURE = existsSync(FIXTURE_PATH);

if (!HAS_FIXTURE) {
  console.warn(
    `[bench] skipping — fixture not found: ${FIXTURE_PATH}\n` +
      `        See __bench__/README.md for setup instructions.`
  );
}

// ---------------------------------------------------------------------------
// Fixture loading (outside of benchmarks, only when present)
// ---------------------------------------------------------------------------

const FIXTURE_GZ = HAS_FIXTURE ? readFileSync(FIXTURE_PATH) : null;

const decompressedBytes = FIXTURE_GZ ? gunzipSync(FIXTURE_GZ) : null;
const jsonString = decompressedBytes
  ? new TextDecoder().decode(decompressedBytes)
  : null;
const parsedJson = jsonString ? JSON.parse(jsonString) : null;

const preConverted = parsedJson ? restJsonToGridaDocument(parsedJson) : null;

if (FIXTURE_GZ && decompressedBytes && jsonString && preConverted) {
  const nodeCount = Object.keys(preConverted.document.nodes).length;
  console.log(
    `[fixture] gz=${(FIXTURE_GZ.byteLength / 1024 / 1024).toFixed(1)}MB, ` +
      `decompressed=${(decompressedBytes.byteLength / 1024 / 1024).toFixed(1)}MB, ` +
      `nodes=${nodeCount}`
  );
}

// ---------------------------------------------------------------------------
// Benchmarks — end-to-end pipeline
// ---------------------------------------------------------------------------

describe.skipIf(!HAS_FIXTURE)("fig2grida pipeline", () => {
  bench(
    "stage: restJsonToGridaDocument (convert + merge)",
    () => {
      restJsonToGridaDocument(parsedJson);
    },
    { iterations: 3, warmupIterations: 1 }
  );

  bench(
    "stage: fig2grida full (convert + merge + pack)",
    () => {
      fig2grida(parsedJson);
    },
    { iterations: 3, warmupIterations: 1 }
  );

  bench(
    "stage: io.archive.pack (level 0, store)",
    () => {
      io.archive.pack(
        preConverted!.document,
        preConverted!.assets,
        undefined,
        undefined,
        { level: 0 }
      );
    },
    { iterations: 3, warmupIterations: 1 }
  );
});

// ---------------------------------------------------------------------------
// Benchmarks — encode sub-stages
// ---------------------------------------------------------------------------

describe.skipIf(!HAS_FIXTURE)("encode sub-stages", () => {
  const docForFb = {
    ...preConverted!.document,
    images: {},
    bitmaps: {},
  };

  bench(
    "toFlatbuffer (default)",
    () => {
      format.document.encode.toFlatbuffer(docForFb);
    },
    { iterations: 3, warmupIterations: 1 }
  );

  bench(
    "toFlatbuffer (skipSort)",
    () => {
      format.document.encode.toFlatbuffer(docForFb, undefined, {
        skipSort: true,
      });
    },
    { iterations: 3, warmupIterations: 1 }
  );

  const fbBytes = format.document.encode.toFlatbuffer(docForFb);

  bench(
    "zipSync (level 0)",
    () => {
      zipSync(
        {
          "manifest.json": strToU8(
            JSON.stringify({
              document_file: "document.grida",
              version: "1.0",
            })
          ),
          "document.grida": fbBytes,
        },
        { level: 0 }
      );
    },
    { iterations: 5, warmupIterations: 1 }
  );

  bench(
    "zipSync (level 6)",
    () => {
      zipSync(
        {
          "manifest.json": strToU8(
            JSON.stringify({
              document_file: "document.grida",
              version: "1.0",
            })
          ),
          "document.grida": fbBytes,
        },
        { level: 6 }
      );
    },
    { iterations: 3, warmupIterations: 1 }
  );

  console.log(
    `[encode sizes] flatbuffer=${(fbBytes.byteLength / 1024 / 1024).toFixed(1)}MB`
  );
});

// ---------------------------------------------------------------------------
// Benchmarks — decode (round-trip: encode once, then measure decode)
// ---------------------------------------------------------------------------

describe.skipIf(!HAS_FIXTURE)("decode", () => {
  const docForFb = {
    ...preConverted!.document,
    images: {},
    bitmaps: {},
  };
  const fbBytes = format.document.encode.toFlatbuffer(docForFb);

  bench(
    "fromFlatbuffer",
    () => {
      format.document.decode.fromFlatbuffer(fbBytes);
    },
    { iterations: 5, warmupIterations: 1 }
  );
});
