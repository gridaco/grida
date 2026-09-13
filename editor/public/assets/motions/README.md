# Preview motions

These are fixed animations for the local rigging preview. Each preset retains its own license; the CC0 dedication applies only to Dance.

| Preset | Creator        | Terms                                           |
| ------ | -------------- | ----------------------------------------------- |
| Dance  | Quaternius     | [CC0 1.0](./CC0-1.0.txt)                        |
| Samba  | Mixamo / Adobe | [Adobe Content Files terms](./SAMBA-LICENSE.md) |

## Dance

`dance.glb` contains **Dance_Loop**, a one-second looping humanoid animation by **Quaternius**, from the free Standard edition of the Universal Animation Library. Its license is **CC0 1.0 Universal (public domain dedication)**. Commercial use, modification, and redistribution are permitted. See [the CC0 dedication](./CC0-1.0.txt).

This clip is called **Dance**, following the source asset. It is not identified as Samba by its creator.

### Sources

- [Creator’s pack and license](https://quaternius.com/packs/universalanimationlibrary.html)
- [Creator’s distribution and license](https://quaternius.itch.io/universal-animation-library)
- [CC0 terms](https://creativecommons.org/publicdomain/zero/1.0/)
- [Downloaded source snapshot](https://github.com/J-Ponzo/gltf-universal-animation-library/tree/e24c23cf2a1323488a3faa226ea7ea21f644b73e)

The pinned mirror identifies its files as the creator's free Standard distribution from June 10, 2025, and includes the CC0 dedication. Retrieved September 12, 2026. The creator's current pages independently confirm the library's CC0 license; the bundled motion is from the pinned 2025 snapshot, not the current 2026 pack.

### Changes

Extracted `Dance_Loop` from `glTF/AnimationLibrary_Godot_Standard.gltf` and its `.bin` buffer. Removed the other animation clips and original mannequin geometry. Retained all 159 dance channels, their keyframes, the 55-node hierarchy, and the 53-joint inverse bind matrices. Added one tiny skin-binding triangle so Three.js retains its `SkinnedMesh` and `Bone` association. The source scene is used only for retargeting and is never displayed. No textures, audio, or external references are included.

The resulting GLB is 63,176 bytes. Three.js `GLTFLoader` verifies one finite one-second clip, 159 tracks, and one 53-joint skin. No animation timing or authored motion was changed.

### SHA-256

- `AnimationLibrary_Godot_Standard.gltf`: `0ff075c7ad6855c5c2c37a171592ee8f0d6ab2f58259e2be77a9b63dd8027765`
- `AnimationLibrary_Godot_Standard.bin`: `6e65377d81558333c4093dbb144a48fd19019343d82b1a3a7992a98ec0e0543c`
- `CC0-1.0.txt`: `a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499`
- `dance.glb`: `357eac9e12b4fefc8846ed92e7e523cf3ae625481765240efb114a325f5da882`

## Samba

`samba.glb` contains the complete **Samba Dancing** motion distributed in the official Three.js examples. It comes from **Mixamo / Adobe** and retains Adobe's Content Files and Mixamo terms. It is not CC0 and is not relicensed by the repository's software license. See [the Samba license notice](./SAMBA-LICENSE.md).

### Sources

- [Pinned source FBX](https://github.com/mrdoob/three.js/blob/3996573c2ad2ca894b2d4ec56edc0ee3c0d910ee/examples/models/fbx/Samba%20Dancing.fbx)
- [Official Three.js FBX example](https://github.com/mrdoob/three.js/blob/3996573c2ad2ca894b2d4ec56edc0ee3c0d910ee/examples/webgl_loader_fbx.html)
- [Adobe General Terms, section 3.6 Content Files](https://www.adobe.com/legal/terms.html)
- [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)
- [Mixamo Additional Terms, June 23, 2021](https://wwwimages2.adobe.com/content/dam/cc/en/legal/servicetou/Mixamo-Addl-Terms-en_US-20210623.pdf)

Retrieved September 12, 2026 from Three.js commit `3996573c2ad2ca894b2d4ec56edc0ee3c0d910ee`.

### Conversion

Converted with the installed Three.js **0.170.0** `FBXLoader` and `GLTFExporter`. Textures were ignored while loading. Retained the complete nonempty `mixamo.com` animation: **18.2 seconds**, **53 tracks**, and all authored keyframes. Removed the empty zero-second `Take 001` clip and both character meshes. Kept the original animated bone hierarchy and the **52-joint** inverse bind matrices, collapsing only the loader's identity child-bone duplicates for the original two meshes. Added one tiny three-vertex skin-binding triangle so `GLTFLoader` retains the skeleton association. Exported binary glTF with TRS nodes and the single animation.

The result is **621,964 bytes**, with no textures or external resources. No authored motion was shortened, resampled, or renamed. The animation's original internal name remains `mixamo.com`; the application labels this preset **Samba** after the source file. The source scene supplies motion to the local retargeter and is never rendered as a character. Runtime retargeting may compensate for the target's bind pose and keep the preview in place; it does not modify this asset or add the preset to downloaded models.

### SHA-256

- `Samba Dancing.fbx`: `b9003ee562c87bf03051c3a502411b0808d3513f1d74a2011f7530d9f067069f`
- `samba.glb`: `708912506dd5ec47a764819e4284936790ae4c129066e38db1fa970d5fe42b50`
