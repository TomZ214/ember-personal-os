# The cat — assets, sources and licence

The cat's body and coats are a realistic, sculpted and textured domestic cat
by **Grab3D**, dedicated to the public domain (**CC0 1.0**). The files, the
full source, licence text, checksum and the list of changes are in
[`public/pet/README.md`](../../../public/pet/README.md); the scripts that
turned the download into those files are in
[`scripts/cat-model/`](../../../scripts/cat-model/README.md). The model is
AI-assisted (Grab3D made it with Meshy, then cleaned it up by hand); the
CC0 waiver is the grant this project relies on.

Everything else is made in code here:

| What | How it is made | File |
| --- | --- | --- |
| Body, fur, eyes | The Grab3D model (mesh with fur relief in its normal map), one colour texture per coat | `public/pet/`, `catModel.ts` |
| Skeleton | 32 bones placed on the model in centimetres: spine, neck, head, ears, shoulder blades, legs, seven tail bones | `catModel.ts` |
| Eyelids | A copy of each eye's surface, skinned like it, drawn as fur only where the lid has come down; the lid margin is a dark line along its edge | `lids.ts` |
| Movement | Pose blending, two-bone inverse kinematics for every leg (paws stay planted; a walking cat's lateral-sequence gait), a tail steered segment by segment, and a small state machine for behaviour | `rig.ts`, `brain.ts`, `pose.ts` |
| Hearts, "z", sparkles, the yarn, the soft shadow | Drawn onto canvases at run time | `coats.ts` |
| Meow and purr | Synthesised with the Web Audio API (oscillators, noise, filters) | `catSounds.ts` |
| Coat swatches in Settings | Plain colours, no three.js | `palettes.ts` |

No copyrighted character is imitated: the cat is a generic domestic cat.
Libraries used (installed from npm, MIT licence): `three`,
`@react-three/fiber`, `@react-three/drei`.

## Loading

`LazyPetScene` loads `PetScene` (and with it three.js) through
`next/dynamic` with `ssr: false`, only once the view is near the screen and
the browser is idle. The model (~840 KB) and the chosen coat (~0.4–1 MB) are
then fetched side by side, once per page load; another coat is fetched when
it is chosen. No other module imports three.js or the 3D files; a
regression test keeps it that way.

## Looking at a pose (development only)

`/pet?pose=groom&cam=close` holds one act and frames the cat.
Poses: `idle`, `sit`, `loaf`, `sleep`, `groom`, `stretch`, `eat`, `purr`,
`crouch`, `treat`. Cameras: `close`, `face`, `side`, `side2`, `top`. `turn`
sets the heading in radians. Ignored in production builds.
