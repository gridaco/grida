import React, { useCallback, useEffect, useRef, useState } from "react";
import { VanillaRunner } from "components/app-runner/vanilla-app-runner";

export function VanillaESBuildAppRunner({
  doc,
  componentName,
}: {
  componentName: string;
  doc?: {
    html: string;
    css?: string;
    javascript: string;
  };
}) {
  const ref = useRef<HTMLIFrameElement>();

  const loadCode = useCallback(
    (e: HTMLIFrameElement) => {
      e?.contentWindow?.postMessage({ html: doc?.html }, "*");
      e?.contentWindow?.postMessage({ css: doc?.css }, "*");
      e?.contentWindow?.postMessage({ javascript: doc?.javascript }, "*");
    },
    [doc?.html, doc?.css, doc?.javascript]
  );

  useEffect(() => {
    if (ref.current) {
      loadCode(ref.current);
    }
  }, [doc?.html, doc?.css, doc?.javascript]);

  return (
    <VanillaRunner
      ref={ref}
      onLoad={(e) => loadCode(e.currentTarget)}
      style={{
        borderRadius: 4,
        backgroundColor: "white",
        boxShadow: "0px 0px 48px #00000020",
      }}
      source={_html}
      width="100%"
      height="100%"
      componentName={componentName}
    />
  );
}

const _html = `
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview</title>
    <style id="_style"></style>
    <style>
    * {
      margin: 0px;
      font-family: Helvetica, "Helvetica Neue", Roboto, Noto, Arial, sans-serif;
    }
    </style>
</head>

<body>
    <div id="root"></div>
</body>

<script type="module">

const _log = console.log

const types = ['log', 'debug', 'info', 'warn', 'error', 'table', 'clear', 'time', 'timeEnd', 'count' , 'assert']

function proxy(context, method, message) { 
    return function() {
        window.parent.postMessage({type: "console", method: method.name, data: JSON.stringify(Array.prototype.slice.apply(arguments))}, '*');
    }
  }

  types.forEach(el =>  {
    window.console[el] = proxy(console, console[el], el)
  })

function setHtml(html) {
    document.body.innerHTML = html
}

  function executeJs(javascript) {
    try {
        eval(javascript)
    } catch (err) {
        console.error(err.message)
    }
}

  function setCss(css) {
    const style = document.getElementById('_style')
    const newStyle = document.createElement('style')
    newStyle.id = '_style'
    newStyle.innerHTML = typeof css === 'undefined' ? '' : css
    style.parentNode.replaceChild(newStyle, style)
  }

  window.addEventListener(
    "error",
    (event) => {
       console.error(event.error)
    },
    false
);

    window.addEventListener(
        "message",
        (e) => {
            if (typeof e.data.html !== 'undefined'){
                setHtml(e.data.html)
            }

           if (typeof e.data.javascript !== 'undefined'){
             executeJs(e.data.javascript)
           } 

           if (typeof e.data.css !== 'undefined'){
            setCss(e.data.css)
           } 
        },
        false
    );
    </script> 

</html>
`;
