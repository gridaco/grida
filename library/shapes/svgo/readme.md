# Sandard library SVG optimizer & processor

```bash
pnpm install -g svgo
```

## Usage

```
svgo -rf <directory> -o ./dist --config svgo.config.js
```

By default, colors with value `#FF00FF` will be replaced with `currentColor` to allow for easier theming.
