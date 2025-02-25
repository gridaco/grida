# Canvas Server page to be embeded in iframe of the canvas.

## Why? - For performance optimization

> e.g.

```tsx
function Host() {
  // interact with canvas server via window messaging
  return <iframe ref={ref} src="{HOST}/canvas-server" />;
}
```

## Pros

- Performance optimization

## Cons

- Lack of control
- Complex state management
- Where to handle the computational work? - what data should be transfered?
