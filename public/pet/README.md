# The cat: model and coats

Files here are loaded by the cat's room (`src/components/pet/catModel.ts`)
on the client only, and only once the room is on screen.

| File | What | Size |
| --- | --- | --- |
| `cat.glb` | The cat's body: mesh, skin weights for the rig, normal and roughness maps. No colour map. | ~840 KB |
| `coat-<id>.jpg` | The colour of each coat (tabby, ginger, black, white, grey, calico), 2048 × 2048. Only the one chosen is fetched. | 0.4–1 MB each |

## Source and licence

**Model:** "Cat" by **Grab3D** (<https://grab3d.com/models/animals/cat/>),
dedicated to the public domain under **CC0 1.0 Universal**
(<https://creativecommons.org/publicdomain/zero/1.0/>).

Grab3D's licence text, as shipped with the model:

> CC0 1.0 Universal (CC0 1.0) Public Domain Dedication. To the extent possible
> under law, Grab3D has waived all copyright and related or neighboring rights
> to the 3D models, textures and images in this package. This work is
> published from: Germany.

The model's own metadata says the same (`"license": "CC0-1.0"`,
`"source": "grab3d.com"`, created 2026-09-28).

Grab3D states how it was made: *"AI-assisted (contains AI-generated content).
Base mesh and textures generated with an AI image-to-3D tool (Meshy), then
cleaned up, scaled, textured and checked in Blender."* Whether AI-generated
output carries copyright at all is unsettled; Grab3D's CC0 waiver is the only
grant there is, and it is what this project relies on.

The copy used was fetched from a public mirror of the Grab3D download
(`frontend/public/models/realistic/cat.glb` in the GitHub repository
`sang-uk-jang/seoul_AI`, next to the licence text above), 30 508 712 bytes,
SHA-256 `1f6af2bf9d0cb49765c7fd681f9d94cef0f014ddb1a000a2cb5bcc8dd3a8140c`.
The same model and licence text are also in `LeonHorner/LegendOfCat`
(`art/blender/mika-v3/source/`).

## What was changed

All by `scripts/cat-model/` (see its README to rebuild these files):

- turned to face +z, centred, scaled to scene units (1 unit = 60 cm);
- slimmed from 765 012 to about 46 000 triangles;
- given skin weights for a 32-bone skeleton (spine, neck, head, ears, legs,
  seven tail bones) so it can move;
- the colour texture repainted into six coats (the tabby is the original;
  the others recoloured by where each texel sits on the body, with matching
  eye colours), and taken out of the model so only the chosen one loads;
- normal and roughness maps reduced to 1024 × 1024; positions, normals and
  weights quantised and meshopt-compressed.

These files are CC0 like their source; nothing here needs crediting, but the
credit stays all the same.
