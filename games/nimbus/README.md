# Nimbus (web port)

A browser version of Nimbus, the Unity game in `ShubhamDas13/Nimbus_GDD`. It is plain HTML5 canvas +
JavaScript (no Unity runtime), so it runs on any browser, including phones (touch buttons appear automatically).

- `index.html`: the game page (the Games tab loads it in the Nimbus cabinet)
- `nimbus.js`: engine and gameplay, ported from the original C# scripts
  (PlayerController, UmibozuController, RavenController, BossController, BulletController, Health, ...)
- `data.js`: levels, collision shapes, sprite frames and animation timings, generated from the
  original build's `cloud_Data` folder
- `assets/`: the original art (PNG) and sound (AAC) extracted from the build

Gameplay numbers (jump force 7, speed 5, dash 6, health, ranges, timings) are the original values.
Two deliberate differences from the Unity build:
- the melee attack hits enemies in front of the player (in the build its raycast started inside the
  player's own collider, so it never reached an enemy);
- looping sounds (footsteps, raven wings, the bullet chord) are distance-limited so they don't overlap.

Credits: Ninja Frog sprites from Pixel Adventure by Pixel Frog; sounds from Pixabay; music
"Orbital Graveyard (Modanung remix)" by vitalezzz and others as listed in the original project.
