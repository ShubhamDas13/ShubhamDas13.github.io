# Nimbus port tools

Scripts that turned the Unity build of Nimbus (`Nimbus_GDD/cloud_Data`) into the web version in
`games/nimbus/`. You only need them to regenerate the game data; the site doesn't use them.

Requirements: Python 3, `pip install UnityPy TypeTreeGeneratorAPI dnfile pillow`, and macOS `afconvert`
(for audio). Run Python with `-I` when reading files you downloaded.

| Script | What it does |
|---|---|
| `inventory.py <cloud_Data>` | Lists textures, sounds, animations and scripts in the build |
| `dll.py <Assembly-CSharp.dll>` | Lists the game's classes, fields, methods and strings |
| `ildump.py <Assembly-CSharp.dll>` | Disassembles every game method to readable IL (used to port the logic) |
| `values.py <cloud_Data>` | Prints the tuning values set on each script in the scenes |
| `levels.py <cloud_Data> <levels.json>` | Exports every scene: positions, colliders, sprites, animators, audio, camera |
| `anim.py <cloud_Data> <anim.json>` | Exports sprite rects and animation keyframe timings |
| `build.py <work folder> <games/nimbus>` | Builds `games/nimbus/js/data.js`, optimised PNGs and AAC audio |
| `test.js` | Gameplay checks; evaluate it on `games/nimbus/index.html` (uses the `window.NIMBUS` hook) |

Typical run, with textures and audio first exported into `<work>/extract/tex` and `<work>/extract/audio`
(UnityPy: `Texture2D.image.save(...)`, `AudioClip.samples`):

```bash
python -I levels.py cloud_Data work/levels.json
python -I anim.py   cloud_Data work/anim.json
python -I build.py  work ../../games/nimbus
```
