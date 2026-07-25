# Rigging Version 1

Phase 4 adds a direct two-dimensional forward-kinematic rig without changing SVG artwork. Each joint references a stable part and SVG group ID, has a named pivot, parent, bind rotation and rotation limits. The neutral bind pose is stored separately and must reconstruct the approved source animal.

## Editor workflow

Select a stable SVG layer, add a joint, optionally choose its parent, then pose it with the bounded rotation slider. The live preview applies forward kinematics: parent movement carries every descendant. Nested SVG targets use local matrices to avoid applying the parent twice; sibling targets receive absolute FK matrices.

The editor can capture the current rotations as the neutral bind pose and save or reload named poses. Rig definitions are included in custom-animal localStorage and Animal Package V1, and package validation rejects missing target groups, missing parts, invalid limits, unknown pose joints and parent cycles.

## Reference rigs

- Jaw and attached lower teeth.
- Hip, knee and ankle three-joint leg.
- Nine-segment scorpion tail followed by a stinger.

Reference rigs bind consecutive stable layers beginning with the selected layer. Artwork should use semantic groups so each joint controls the intended complete feature.

Inverse kinematics remains deliberately postponed until direct joint posing is stable.

