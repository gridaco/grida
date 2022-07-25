const { spawn } = require("node:child_process");
const build = spawn("flutter", "build", ["--no-source-maps"]);

build.stdout.on("data", (data) => {
  console.log(`stdout: ${data}`);
});

build.stderr.on("data", (data) => {
  console.error(`stderr: ${data}`);
});

build.on("close", (code) => {
  console.log(`child process exited with code ${code}`);
});
