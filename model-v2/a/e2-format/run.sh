#!/bin/sh -e
# E2 reproduction: schema compile, S-1 byte-fixpoint, additive evolution.
flatc --binary --schema anchor.fbs
flatc --binary --schema anchor_v2.fbs
rm -rf rt rt2 rt_v2 rt_v2b && mkdir -p rt rt2 rt_v2 rt_v2b
flatc --binary -o rt anchor.fbs quartet.json
flatc --json --raw-binary --strict-json -o rt anchor.fbs -- rt/quartet.bin
flatc --binary -o rt2 anchor.fbs rt/quartet.json
cmp rt/quartet.bin rt2/quartet.bin && echo "S-1 FIXPOINT: byte-identical"
flatc --json --raw-binary --strict-json -o rt_v2 anchor_v2.fbs -- rt/quartet.bin
echo "M-4 forward: v1 binary decodes under v2 schema"
flatc --binary -o rt_v2b anchor_v2.fbs quartet_v2.json
flatc --json --raw-binary --strict-json -o rt_v2b anchor.fbs -- rt_v2b/quartet_v2.bin
echo "M-4 backward: v2 binary decodes under v1 schema (unknown field skipped)"
