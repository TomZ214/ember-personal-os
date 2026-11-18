# The cat — assets, sources and licence

Everything the cat is made of is created in code in this folder. There are
no downloaded models, textures, fonts or sound files, so there is nothing
third-party to license.

| What | How it is made | File |
| --- | --- | --- |
| Body | A signed distance field of ellipsoids and rounded cones placed where a real cat's chest, ribs, hips, shoulders, legs, head and tail are (measured in centimetres from a domestic cat), meshed with surface nets, every vertex pulled onto the exact surface and bound to a 36-bone skeleton by distance. Built in a web worker once per page load. | `anatomy.ts`, `anatomy.worker.ts`, `catGeometry.ts` |
| Fur | Shell rendering: the body drawn in up to 15 layers, each pushed out along the skin and combed back, each keeping only the hairs that reach that high. | `fur.ts` |
| Coat patterns (mackerel tabby, ginger, calico patches, the forehead "M", pale belly and muzzle) | Painted in the fur shader from each point's position on the resting body | `fur.ts`, `palettes.ts` |
| Eyes | An iris with radial fibres and a slit pupil that opens when hunting, drawn in a shader, under a glossy cornea, with fur-covered lids that blink | `fur.ts`, `rig.ts` |
| Ears, nose leather, whiskers | Generated geometry | `rig.ts` |
| Hearts, "z", sparkles, the yarn, the soft shadow | Drawn onto canvases at run time | `coats.ts` |
| Meow and purr | Synthesised with the Web Audio API (oscillators, noise, filters) | `catSounds.ts` |
| Movement | Pose blending and two-bone inverse kinematics for every leg (paws stay planted; a walking cat's lateral-sequence gait), a small state machine for behaviour | `rig.ts`, `brain.ts`, `pose.ts` |

Licence: the same as the rest of this repository. No external asset, no
attribution required, no copyrighted character imitated: the cat is a
generic domestic cat.

Libraries used (installed from npm, MIT licence): `three`,
`@react-three/fiber`, `@react-three/drei`.

## Loading

`LazyPetScene` loads `PetScene` (and with it three.js) through
`next/dynamic` with `ssr: false`, only once the view is near the screen and
the browser is idle. The body is then built in a web worker. No other
module imports three.js or the 3D files; a regression test keeps it that
way.

## Looking at a pose (development only)

`/pet?pose=groom&cam=close` holds one act and frames the cat.
Poses: `idle`, `sit`, `loaf`, `sleep`, `groom`, `stretch`, `eat`, `purr`,
`crouch`, `treat`. Cameras: `close`, `face`, `side`, `side2`, `top`. `turn`
sets the heading in radians. Ignored in production builds.
