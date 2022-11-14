# `@code-editor/preferences`

Preferences management for the editor.

## Usage

Setup Provider - Place the `EditorPreferences` on the top of the preference consumer tree.

```tsx
import React from "react";
import { EditorPreferences  } from "@code-editor/preferences";

export MyApp(){
  return(
    <EditorPreferences>
      <Editor/>
    </EditorPreferences>
  );
}
```

Registering a preference page (that does not actually contribute to the preferences)

```tsx
import React from "react";
import Preferences, { PreferencesPageProps } from "@code-editor/preferences";
import { useProfile } from "some-other-provider";

const router = Preferences.router("/user");

router.route(
  "/my-profile",
  (p) => {
    return <MyProfilePageOnPreferences {...p} />;
  },
  {
    title: "My Profile",
    icon: "user",
  }
);

function MyProfilePageOnPreferences(p: PreferencesPageProps) {
  const profile = useProfile();
  return <div>{profile.name}</div>;
}
```

Registering a preference

```ts
import { addPreference } from "@code-editor/preferences";
import schema from "custom-preference-schema.json";

addPreference(schema);
```

```json
// todo
```
