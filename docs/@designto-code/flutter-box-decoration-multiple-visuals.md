---
title: "Flutter box decoration mutiple visuals"
version: 0.1.0
revision: 1
---

# Flutter box decoration mutiple visuals

## Color + Gradient

**❌ Color + Gradient. - in a single decoration**

This won't work (it will ignore the color.)

See, we have both bg color and opacity gradients. still only gradients will be visible

```dart
Container(
    decoration: BoxDecoration(
      color: Colors.blue, // <--------- this will be ignored.
      gradient: LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: [
              Colors.purple.withOpacity(0.1),
              Colors.blue.withOpacity(0.1)
            ]
        )
    ),
);
```

---

**✅ Color + Gradient. - chunked decoration**

The correct way of mixing Color + Gradient is chunking the decorations in the correct order-hierarchy

```dart
Container(
    decoration: BoxDecoration(
      color: Colors.blue,
    ),
    child: Container(
        decoration: BoxDecoration(
            gradient: LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: [
                    Colors.purple.withOpacity(0.1),
                    Colors.blue.withOpacity(0.1)
                ]
            )
        )
    )
);
```

## Color + Image

![](https://flutter.github.io/assets-for-api-docs/assets/painting/box_decoration.png)

```dart
Container(
  decoration: BoxDecoration(
    color: const Color(0xff7c94b6),
    image: const DecorationImage(
      image: NetworkImage('https://flutter.github.io/assets-for-api-docs/assets/widgets/owl-2.jpg'),
      fit: BoxFit.cover,
    ),
    border: Border.all(
      color: Colors.black,
      width: 8,
    ),
    borderRadius: BorderRadius.circular(12),
  ),
)
// official flutter team's example from https://api.flutter.dev/flutter/painting/BoxDecoration-class.html
```
