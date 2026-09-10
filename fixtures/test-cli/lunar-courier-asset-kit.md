# Lunar courier asset kit

## Prompt

> I'm prototyping a quiet lunar delivery game. Use Grida CLI to make one coherent
> asset kit for a palm-sized courier robot: a rounded warm-ivory body, two chunky
> wheels, cobalt side panniers and one amber front lamp. It should feel like a
> friendly industrial toy, with sturdy connected parts and no lettering.
>
> Start with one square, three-quarter product image on a plain warm-gray
> background. Keep the whole robot visible with a clear silhouette and a soft
> contact shadow. Then use that exact image to create a textured 3D model; don't
> design a different robot from a second text prompt. Deliver a GLB I can inspect
> in my own tools, and tell me about visible geometry or texture problems rather
> than claiming it is ready for a game engine.
>
> Give the robot one four-second departure sound: a latch click, a gentle electric
> motor starting, rubber wheels moving, and two soft chime notes. No speech or
> music. Look at the generated design before writing the sound direction so the
> sound feels appropriate to this small object.
>
> Deliver the image, GLB and MP3 in a new local folder, with a simple offline HTML
> index that shows the image, plays the sound and links to the GLB. Include the
> requests, receipts and a short account of what worked, what needed local glue,
> and what you could not verify. Keep it to one image, one 3D conversion and one
> sound generation; show me the proposed calls and cost basis before running.

## Handoffs

The generated image is the actual input to image-to-3D. SFX receives a text
direction informed by that image; it does not receive image bytes. The HTML index
is local assembly, and its reference image is not a render of the returned mesh.

## Judge the result

- The robot's wheels, panniers, lamp and silhouette are consistent between the
  image and mesh where inspectable. Report hidden surfaces or mesh quality as
  unverified if no suitable 3D viewer is available.
- The image-to-3D request can be traced to the saved image by content hash.
- The GLB parses as a nonempty asset; structural validity is assessed separately
  from appearance, topology, scale and readiness for production.
- The sound plays, lasts approximately four seconds, follows the requested event
  order, and contains no unintended voice or music.
- The index works offline and references the actual local artifacts and receipts.
  An unavailable visual/audio inspection is recorded, not assumed successful.
