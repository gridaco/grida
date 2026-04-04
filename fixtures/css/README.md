# Standard Fixture set for CSS Render testing

## [html.css](./html.css)

Chromium's default HTML stylesheet.
[html.css on github](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/html/resources/html.css)

## [github-markdown.css](./github-markdown.css)

GitHub's default light mode markdown stylesheet. (by [sindresorhus](https://github.com/sindresorhus))

- [github-markdown-light.css](https://github.com/sindresorhus/github-markdown-css/blob/main/github-markdown-light.css)
- [github-markdown-dark.css](https://github.com/sindresorhus/github-markdown-css/blob/main/github-markdown-dark.css)
- [github-markdown.css](https://github.com/sindresorhus/github-markdown-css/blob/main/github-markdown.css)

## [grida-markdown.css](./grida-markdown.css)

Grida's own markdown stylesheet for the `htmlcss` render pipeline. Targets bare HTML elements produced by `pulldown-cmark` (GFM mode) under a `.markdown-body` wrapper. Uses element selectors only (no GitHub-specific classes), explicit px/rgb values (no CSS custom properties), and Grida's embedded font stack (Geist).

Embedded into the `cg` crate via symlink at `crates/grida-canvas/assets/css/grida-markdown.css`.
