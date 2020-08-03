---
title: Jump into remote-ui
description: Learn how to use remote-ui.
---


>ICONS

server side (node)

```typescript
import * as rui from "@bridged.io/remote-ui-core"
console.log(rui.icons.material.note)

// or...

import { icons } from "@bridged.io/remote-ui-core"
console.log(icons.material.note)

/// >> logs 
/// RemoteIconData {
///  uri: 'material://Icons.note',
///  type: 'MATERIAL_NATIVE',
///  asset: undefined }


/// can be used directly on flutter
```


app side (flutter)

```dart
  Widget _buildBody(BuildContext context) {
    return RemoteIcon(RemoteIconData.fromUri("material://Icons.add"));
  }
  ```