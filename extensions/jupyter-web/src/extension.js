// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const nb = require("./notebookjs");
const Prism = require('node-prismjs');
const cheerio = require('cheerio');
let path = require("path");

const notebook_style_path = vscode.Uri.file(path.join(__dirname, '..', "static", 'notebook.css'));
const notebook_style_src = notebook_style_path.with({ scheme: 'vscode-resource' });

const prism_style_path = vscode.Uri.file(path.join(__dirname, '..', "static", 'prism.css'));
const prism_style_src = prism_style_path.with({ scheme: 'vscode-resource' });

const katex_style_path = vscode.Uri.file(path.join(__dirname, '..', "static", 'katex.min.css'));
const katex_style_src = katex_style_path.with({ scheme: 'vscode-resource' });


const custom_style_path = vscode.Uri.file(path.join(__dirname, '..', "static", 'custom.css'));
const custom_style_src = custom_style_path.with({ scheme: 'vscode-resource' });

const require_script_path = vscode.Uri.file(path.join(__dirname, '..', "static", 'require.js'));
const require_script_src = require_script_path.with({ scheme: 'vscode-resource' });

const katex_script_path = vscode.Uri.file(path.join(__dirname, '..', "static", 'katex.min.js'));
const katex_script_src = katex_script_path.with({ scheme: 'vscode-resource' });


const katex_auto_script_path = vscode.Uri.file(path.join(__dirname, '..', "static", 'auto-render.min.js'));
const katex_auto_script_src = katex_auto_script_path.with({ scheme: 'vscode-resource' });

const custom_script_path = vscode.Uri.file(path.join(__dirname, '..', "static", 'custom.js'));
const custom_script_src = custom_script_path.with({ scheme: 'vscode-resource' });

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

function convertDocToHTML(panel) {
    statusBarItem.show();
    statusBarItem.text = "1/6 Starting Rendering";
    // Get the current text editor
    let editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("Failed to identify editor");
        statusBarItem.hide();
        return "Failed to identify editor";
    }

    let doc = editor.document;
    
    // Only update status if a Markdown file
    if (!(doc.languageId === 'jupyter')) {
        vscode.window.errorMessage("Active editor doesn't show a Jupyter notebook - cannot preview.");
        statusBarItem.hide();
        return "Active editor doesn't show a Jupyter notebook - cannot preview.";
    }
    let data = "";
    try {
        statusBarItem.text = "2/6 Extracting Jupyter Notebook";
        let text = doc.getText();
        let ipynb = JSON.parse(text);
        statusBarItem.text = "3/6 Parsing Jupyter Notebook";
        let notebook = nb.parse(ipynb);
        statusBarItem.text = "4/6 Rendering Jupyter Notebook";
        let notebook_html = notebook.render().outerHTML;
        statusBarItem.text = "5/6 Highlighting Jupyter Notebook";
        //traverse through notebook and use prism to highlight
        const $ = cheerio.load(notebook_html);
        let elems = $('.nb-input pre code');
        for (let i = 0; i < elems.length; i++) {
            let formatted_text = Prism.highlight($(elems[i]).text(), Prism.languages.python);
            $(elems[i]).html(formatted_text);     // modify inner HTML
        }
        notebook_html = $.html();
        data = '<link  href="' + notebook_style_src + '"  rel="stylesheet" />';
        data += '<link href="' + prism_style_src + '"  rel="stylesheet" />';
        data += '<link href="' + katex_style_src + '"  rel="stylesheet" />';
        data += '<link href="' + custom_style_src + '"  rel="stylesheet" />';

        // data += '<script src="' + require_script_src + '" ></script>';
        data += '<script src="' + katex_script_src + '" ></script>';
        data += '<script src="' + katex_auto_script_src + '" ></script>';
        
        data += "<body>" + notebook_html + "</body>";
        data += '<script src="' + custom_script_src + '" ></script>';
        

    } catch (error) {
        data = "An error occured while converting Notebook to HTML";
        vscode.window.showErrorMessage("An error occured while converting Notebook to HTML");
        console.error("An error occured while converting Notebook to HTML", error);
    }
    statusBarItem.hide();
    return data;
}

function generatePreview(panel) {
    let html_body = convertDocToHTML(panel);
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Preview</title>
    </head>`+ html_body + `</html>`;
}

function generateProgressMessage(message) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Preview</title>
    </head><body>`+ message + `</body></html>`;
}

function activate(context) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "nbpreviewer" is now active!');
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('jupyter.showPreview', async function (obj) {
        // The code you place here will be executed every time your command is executed
        try {
            
            // const success = await vscode.commands.executeCommand('vscode.previewHtml', previewUri, vscode.ViewColumn.Two, 'IPython Notebook Preview');
            // Create and show panel
            const panel = vscode.window.createWebviewPanel('nbpreviewer', "Jupyter Notebook Previewer", vscode.ViewColumn.One, { enableScripts: true,retainContextWhenHidden: true });
            panel.webview.html = generateProgressMessage("Starting to render Jupyter Notebook");
            // And set its HTML content
            panel.webview.html = generatePreview(panel);
            console.log("successfully showed notebook");
        }
        catch (reason) {
            console.error(reason);
            vscode.window.showErrorMessage("An error occured while rendering the Notebook");
        }
    });

    context.subscriptions.push(disposable);
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;