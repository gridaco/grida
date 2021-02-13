#!/usr/bin/env iojs
// Reads a notebook from stdin, prints the rendered HTML to stdout
let fs = require("fs");
let nb = require("../notebook.js");
let ipynb = JSON.parse(fs.readFileSync("/dev/stdin"));
let notebook = nb.parse(ipynb);
console.log(notebook.render().outerHTML);
