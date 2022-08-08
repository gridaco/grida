---
title: "CSS How to handle multiple background fills"
version: 0.1.0
revision: 1
---

# How to handle multiple background fills

## Definition of `"multiple background fills"`

- one or none active solid fill
- one or more gradient fill above solid fill
- one or more image fill

## Possible combinations

single solid fill

```css
._1 {
  background: #fff;
}
._2 {
  background-color: #fff;
}
```

single solid fill with single gradient fill

```css
._1 {
  background-color: #fff;
  background-image: linear-gradient(to bottom, #fff, #fff);
}

._2 {
  background: #fff;
  background-image: linear-gradient(to bottom, #fff, #fff);
}
```

no solid fill with single gradient fill

```css
._1 {
  background: linear-gradient(to bottom, #fff, #fff);
}

._2 {
  background-image: linear-gradient(to bottom, #fff, #fff);
}
```

no solid fill with multiple gradient fill

```css
._1 {
  background: linear-gradient(to bottom, #fff, #fff), linear-gradient(to bottom, #fff, #fff);
}
```
