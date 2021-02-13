// notebook.js 0.2.7
// http://github.com/jsvine/notebookjs
// notebook.js may be freely distributed under the MIT license.
(function () {
    let root = this;
    let VERSION = "0.2.7";

          // Get browser or JSDOM document
    // var doc = root.document || require("jsdom").jsdom();
    
    // https://github.com/jsvine/notebookjs/issues/13
    // Have to use local copy till this is resolved
    let jsdom = require('jsdom');
    const { JSDOM } = jsdom;

    const { document } = (new JSDOM('')).window;
    let doc = root.document || document;
  
    // Helper functions
    let ident = function (x) { return x; };

    let makeElement = function (tag, classNames) {
        let el = doc.createElement(tag);
        el.className = (classNames || []).map(function (cn) {
            return nb.prefix + cn;
        }).join(" ");
        return el;
    }; 

    let escapeHTML = function (raw) {
        let replaced = raw
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        return replaced;
    };

    var joinText = function (text) {
        if (text.join) {
            return text.map(joinText).join("");
        } else {
            return text;    
        } 
    };

    // Get supporting libraries
    let condRequire = function (module_name) {
        return typeof require === "function" && require(module_name);
    };

    let getMarkdown = function () {
        return root.marked || condRequire("marked"); 
    };

    let getAnsi = function () {
        let req = condRequire("ansi_up");
        let lib = root.ansi_up || req; 
        return lib && lib.ansi_to_html;
    };

    // Set up `nb` namespace
    var nb = {
        prefix: "nb-",
        markdown: getMarkdown() || ident,
        ansi: getAnsi() || ident,
        VERSION: VERSION
    };

    // Inputs
    nb.Input = function (raw, cell) {
        this.raw = raw; 
        this.cell = cell;
    };

    nb.Input.prototype.render = function () {
        if (!this.raw.length) { return makeElement("div"); }
        let holder = makeElement("div", [ "input" ]);
        let cell = this.cell;
        if (typeof cell.number === "number") {
            holder.setAttribute("data-prompt-number", this.cell.number);
        }
        let pre_el = makeElement("pre");
        let code_el = makeElement("code");
        let notebook = cell.worksheet.notebook;
        let m = notebook.metadata;
        let lang = "none";
        if (m.language_info !== undefined && this.cell.raw.language !== undefined ) {
            lang = this.cell.raw.language || m.language || m.language_info.name || undefined;
        }
        code_el.setAttribute("data-language", lang);
        code_el.className = "lang-" + lang;
        code_el.innerHTML = escapeHTML(joinText(this.raw));
        pre_el.appendChild(code_el);
        holder.appendChild(pre_el);
        this.el = holder;
        return holder;
    }; 

    // Outputs and output-renderers
    let imageCreator = function (format) {
        return function (data) {
            let el = makeElement("img", [ "image-output" ]);
            el.src = "data:image/" + format + ";base64," + joinText(data).replace(/\n/g, "");
            return el;
        };
    };

    nb.display = {};
    nb.display.text = function (text) {
        let el = makeElement("pre", [ "text-output" ]);
        el.innerHTML = escapeHTML(joinText(text));
        return el;
    };
    nb.display["text/plain"] = nb.display.text;

    nb.display.html = function (html) {
        let el = makeElement("div", [ "html-output" ]);
        el.innerHTML = joinText(html);
        return el;
    };
    nb.display["text/html"] = nb.display.html;

    nb.display.marked = function(md) {
        return nb.display.html(nb.markdown(joinText(md)));
    };
    nb.display["text/markdown"] = nb.display.marked;
    
    nb.display.svg = function (svg) {
        let el = makeElement("div", [ "svg-output" ]);
        el.innerHTML = joinText(svg);
        return el;
    };
    nb.display["text/svg+xml"] = nb.display.svg;

    nb.display.latex = function (latex) {
        let el = makeElement("div", [ "latex-output" ]);
        el.innerHTML = joinText(latex);
        return el;
    };
    nb.display["text/latex"] = nb.display.latex;

    nb.display.javascript = function (js) {
        let el = makeElement("script");
        el.innerHTML = joinText(js);
        return el;
    };
    nb.display["application/javascript"] = nb.display.javascript;

    nb.display.png = imageCreator("png");
    nb.display["image/png"] = nb.display.png;
    nb.display.jpeg = imageCreator("jpeg");
    nb.display["image/jpeg"] = nb.display.jpeg;

    nb.display_priority = [
        "png", "image/png", "jpeg", "image/jpeg",
        "svg", "text/svg+xml", "html", "text/html",
        "text/markdown", "latex", "text/latex",
        "javascript", "application/javascript",
        "text", "text/plain"
    ];

    let render_display_data = function () {
        let o = this;
        let formats = nb.display_priority.filter(function (d) {
            return o.raw.data ? o.raw.data[d] : o.raw[d];
        });
        let format = formats[0];
        if (format) {
            if (nb.display[format]) {
                return nb.display[format](o.raw[format] || o.raw.data[format]);
            }
        }
        return makeElement("div", [ "empty-output" ]);
    };

    let render_error = function () {
        let el = makeElement("pre", [ "pyerr" ]);
        let raw = this.raw.traceback.join("\n");
        el.innerHTML = nb.ansi(escapeHTML(raw));
        return el;
    };

    nb.Output = function (raw, cell) {
        this.raw = raw; 
        this.cell = cell;
        this.type = raw.output_type;
    };

    nb.Output.prototype.renderers = {
        "display_data": render_display_data,
        "execute_result": render_display_data,
        "pyout": render_display_data,
        "pyerr": render_error,
        "error": render_error,
        "stream": function () {
            let el = makeElement("pre", [ (this.raw.stream || this.raw.name) ]);
            let raw = joinText(this.raw.text);
            el.innerHTML = nb.ansi(escapeHTML(raw));
            return el;
        }
    };

    nb.Output.prototype.render = function () {
        let outer = makeElement("div", [ "output" ]);
        if (typeof this.cell.number === "number") {
            outer.setAttribute("data-prompt-number", this.cell.number);
        }
        let inner = this.renderers[this.type].call(this); 
        outer.appendChild(inner);
        this.el = outer;
        return outer;
    };

    // Post-processing
    nb.coalesceStreams = function (outputs) {
        if (!outputs.length) { return outputs; }
        let last = outputs[0];
        let new_outputs = [ last ];
        outputs.slice(1).forEach(function (o) {
            if (o.raw.output_type === "stream" &&
                last.raw.output_type === "stream" &&
                o.raw.stream === last.raw.stream) {
                last.raw.text = last.raw.text.concat(o.raw.text);
            } else {
                new_outputs.push(o);
                last = o;
            }
        });
        return new_outputs;
    };

    // Cells
    nb.Cell = function (raw, worksheet) {
        let cell = this;
        cell.raw = raw;
        cell.worksheet = worksheet;
        cell.type = raw.cell_type;
        if (cell.type === "code") {
            cell.number = raw.prompt_number > -1 ? raw.prompt_number : raw.execution_count;
            let source = raw.input || [ raw.source ];
            cell.input = new nb.Input(source, cell);
            let raw_outputs = (cell.raw.outputs || []).map(function (o) {
                return new nb.Output(o, cell); 
            });
            cell.outputs = nb.coalesceStreams(raw_outputs);
        }
    };

    nb.Cell.prototype.renderers = {
        markdown: function () {
            let el = makeElement("div", [ "cell", "markdown-cell" ]);
            el.innerHTML = nb.markdown(joinText(this.raw.source));
            return el;
        },
        heading: function () {
            let el = makeElement("h" + this.raw.level, [ "cell", "heading-cell" ]);
            el.innerHTML = joinText(this.raw.source);
            return el;
        },
        raw: function () {
            let el = makeElement("div", [ "cell", "raw-cell" ]);
            el.innerHTML = joinText(this.raw.source);
            return el;
        },
        code: function () {
            let cell_el = makeElement("div", [ "cell", "code-cell" ]);
            cell_el.appendChild(this.input.render());
            let output_els = this.outputs.forEach(function (o) {
                cell_el.appendChild(o.render());
            });
            return cell_el;
        }
    };

    nb.Cell.prototype.render = function () {
        let el = this.renderers[this.type].call(this); 
        this.el = el;
        return el;
    };

    // Worksheets
    nb.Worksheet = function (raw, notebook) {
        let worksheet = this;
        this.raw = raw;
        this.notebook = notebook;
        this.cells = raw.cells.map(function (c) {
            return new nb.Cell(c, worksheet);
        });
        this.render = function () {
            let worksheet_el = makeElement("div", [ "worksheet" ]);
            worksheet.cells.forEach(function (c) {
                worksheet_el.appendChild(c.render()); 
            });
            this.el = worksheet_el;
            return worksheet_el;
        };
    };

    // Notebooks
    nb.Notebook = function (raw, config) {
        let notebook = this;
        this.raw = raw;
        this.config = config;
        let meta = this.metadata = raw.metadata;
        this.title = meta.title || meta.name;
        let _worksheets = raw.worksheets || [ { cells: raw.cells } ];
        this.worksheets = _worksheets.map(function (ws) {
            return new nb.Worksheet(ws, notebook);
        });
        this.sheet = this.worksheets[0];
    };

    nb.Notebook.prototype.render = function () {
        let notebook_el = makeElement("div", [ "notebook" ]);
        this.worksheets.forEach(function (w) {
            notebook_el.appendChild(w.render()); 
        });
        this.el = notebook_el;
        return notebook_el;
    };
    
    nb.parse = function (nbjson, config) {
        return new nb.Notebook(nbjson, config);
    };

    // Exports
    if (typeof define === 'function' && define.amd) {
        define(function() {
            return nb;
        });
    }
    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = nb;
        }
        exports.nb = nb;
    } else {
        root.nb = nb;
    }
    
}).call(this);
