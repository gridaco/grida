# Area selection (Marquee selection)

> This feature yet does not consider vector networks. (boolean operation)

Keymode

- default
- cmd

Parameters

- raycast mode:
  - hit - if the target has an intersection with the area.
  - contain - if the target is contained in the area.
- type
  - frame
  - group
  - frame
  - element (others)
- is root - this only effects to the frame node.

Final output for painting

- selections (each selection will get a highlight)
- bounding box (abstract group)
