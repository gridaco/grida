const http = require("node:http");

const server = http.createServer((request, response) => {
  response.writeHead(request.url === "/health" ? 200 : 404, {
    "content-type": "text/plain",
  });
  response.end("socket-capability-ok");
});

process.on("message", (message, socket) => {
  if (message && message.type === "fixture.attest" && !socket) {
    process.send({ v: 1, type: "daemon.capability.ready" });
    return;
  }
  if (
    !message ||
    message.v !== 1 ||
    message.type !== "daemon.connection" ||
    !socket
  ) {
    process.exit(2);
    return;
  }
  server.emit("connection", socket);
  socket.resume();
});

process.once("disconnect", () => process.exit(0));
