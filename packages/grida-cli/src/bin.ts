#!/usr/bin/env node
// GRIDA-SEC-010 — safe process output; offline commands never open account custody.
import { Cli } from "./cli";
import { Output } from "./output";
import { version } from "../package.json";

const args = process.argv.slice(2);
// A closed output pipe must not turn into an uncaught Node stack trace.
process.stdout.on("error", () => {
  process.exitCode = 1;
});
process.stderr.on("error", () => {
  process.exitCode = 1;
});
const output = new Output(
  args.includes("--json"),
  (value) => process.stdout.write(value),
  (value) => process.stderr.write(value)
);
try {
  const invocation = Cli.parse(args);
  switch (invocation.command) {
    case "help":
      process.stdout.write(Cli.helpText(invocation.topic));
      break;
    case "version":
      process.stdout.write(`grida ${version}\n`);
      break;
    case "docs":
      process.stdout.write(Cli.docsUrl(invocation.topic) + "\n");
      break;
    default: {
      const { run } = await import("./run");
      process.exitCode = await run(invocation, output);
    }
  }
} catch (error) {
  if (error instanceof Cli.Failure) {
    output.failure({ code: error.code, message: error.message });
    process.exitCode = error.code === "invalid_usage" ? 2 : 1;
  } else {
    output.failure({
      code: "unavailable",
      message: "Grida could not complete this command.",
    });
    process.exitCode = 1;
  }
}
