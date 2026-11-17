# The cat — assets, sources and licence

Everything the cat is made of is created in code in this folder. There are
no downloaded models, textures, fonts or sound files, so there is nothing
third-party to license.

| What | How it is made | File |
| --- | --- | --- |
| 3D model | Built at run time from three.js primitives (spheres, capsules, cones, tori, a lathe for the bowl). Proportions, colours and the rig are original to Ember. | `rig.ts`, `room.ts` |
| Fur patterns (tabby stripes, calico patches, the forehead "M") | Painted onto small canvases at run time | `coats.ts` |
| Hearts, "z", sparkles | Drawn onto canvases at run time | `coats.ts` |
| Meow and purr | Synthesised with the Web Audio API (oscillators, noise, filters) | `catSounds.ts` |
| Animation and behaviour | Procedural: pose blending, gait, a small state machine | `rig.ts`, `brain.ts` |

Licence: the same as the rest of this repository. No external asset, no
attribution required, no copyrighted character imitated: the cat is a
generic stylised kitten.

Libraries used (installed from npm, MIT licence): `three`,
`@react-three/fiber`, `@react-three/drei`.

## Loading

`LazyPetScene` loads `PetScene` (and with it three.js) through
`next/dynamic` with `ssr: false`, only once the view is near the screen and
the browser is idle. No other module imports three.js or the 3D files; a
regression test keeps it that way.

## Looking at a pose (development only)

`/pet?pose=groom&cam=close` holds one act and frames the cat up close.
Poses: `idle`, `sit`, `loaf`, `sleep`, `groom`, `stretch`, `eat`, `purr`,
`crouch`, `treat`. Cameras: `close`, `side`, `side2`. `turn` sets the
heading in radians. Ignored in production builds.
