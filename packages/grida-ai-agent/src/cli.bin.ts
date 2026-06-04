#!/usr/bin/env node
/**
 * Executable shim for the grida-agent CLI. Kept separate from `cli.ts` so
 * that module stays import-safe (tests import its command handlers without
 * spawning a host). This file is the package `bin` entry and does nothing but
 * run `main()` and map a thrown error to a non-zero exit.
 */
import { main } from "./cli";

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
