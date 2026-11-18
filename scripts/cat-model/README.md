# Building the cat

These scripts turn the CC0 Grab3D cat (see `public/pet/README.md` for the
source, licence and checksum) into the files in `public/pet/`. They are not
part of the app build and nothing in the app imports them; run them only to
change the model or the coats.

```sh
cd scripts/cat-model
npm install
mkdir -p source   # put the downloaded model here as source/cat.glb (30.5 MB)
node step1.mjs source/cat.glb 0.06  # face +z, centre, scale; keep 6 % of the triangles -> cat-step1.glb
node step2.mjs                      # skin weights for the skeleton in bones.json   -> cat-step2.glb
node tex.mjs                        # the model's textures                           -> base.jpg, normal.jpg, mr.jpg
node step3.mjs                      # where every texel sits on the body; the eyes  -> posmap.bin, normap.bin, eyes.json
node step4.mjs coats                # paint the six coats from the tabby texture     -> coats/
node step5.mjs ../../public/pet     # pack: quantise, meshopt, coats as JPEG         -> public/pet/, lids.json
node eyes-look.mjs                  # optional: a front view of each eye, to measure the openings
```

Afterwards, if the skeleton, the eyes or the lid colours changed, copy them
into `src/components/pet/catModel.ts`: `BONES` from `bones.json`, `EYES`
from `eyes.json` (and the openings measured on `eye-0.png`, `eye-1.png`, a
grid line every 0.5 cm), `LIDS` from `lids.json`.

## What each step does

1. **step1** turns the model to face +z, centres it on its paws and scales
   it to scene units (1 unit = 60 cm), welds and simplifies the mesh with
   meshoptimizer to about 46 000 triangles and resizes the textures to 2048.
2. **step2** gives every vertex weights for up to four bones: by distance to
   each bone's segment (minus the flesh round it) with a soft falloff, the
   same for vertices split by texture seams, smoothed over the surface so
   joints bend softly and separate limbs never pull on each other.
3. **step3** rasterises every triangle into texture space, so each texel
   knows where on the body it is, and finds the irises by colour.
4. **step4** repaints the tabby into ginger, black, white, grey and calico by
   each texel's brightness and its place on the body (3D noise for the
   calico patches; eye colours to match each coat).
5. **step5** drops the colour map from the model (the coat is chosen at run
   time), shrinks the normal and roughness maps to 1024, quantises and
   compresses the mesh, writes the coats, and measures the fur colour round
   each eye per coat for the eyelids.
