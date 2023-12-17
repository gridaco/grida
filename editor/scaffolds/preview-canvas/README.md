# Previe Frame in canvas

> Optimized frame for loading all frames in single canvas

## Current state

- uses [css contain](https://developer.mozilla.org/en-US/docs/Web/CSS/contain) property
- uses display hidden property
- ref: https://developer.mozilla.org/en-US/docs/Learn/Performance/CSS

## Optimization steps (Draft)

1. bg (while loading)
2. image (zoom < 1)
   2.1 small image (zoom < 0.3)
3. vanilla (zoom >= 1)
4. editing mode (tbd)

### Caching

- image caching
- vanilla caching

### Params

- zoom: the zoom of the canvas
- in-viewport: whether if the canvas is in the viewport
- focused: whether if the frame is selected
