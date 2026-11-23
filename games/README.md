# Browser builds of the games

Put each game's Unity **WebGL** build here:

```
games/warxel/index.html   (+ Build/, TemplateData/)
games/nimbus/index.html   (+ Build/, TemplateData/)
```

The Games page (`games.html`) detects these automatically. Until a build exists, that
cabinet shows "COMING SOON" with a Windows download link.

## Making a WebGL build in Unity

1. Open the game's Unity project in Unity Hub.
2. File → Build Settings → select **WebGL** → **Switch Platform** (install the WebGL module if asked).
3. Player Settings → Publishing Settings:
   - **Compression Format: Disabled** (GitHub Pages can't serve Brotli/Gzip builds correctly), or
     keep Gzip and tick **Decompression Fallback**.
4. Player Settings → Resolution and Presentation → WebGL Template: **Minimal** looks best inside the cabinet.
5. Build into `games/warxel/` (or `games/nimbus/`) in this project.

Keep each file under 100 MB (GitHub's limit).

**Warxel is online multiplayer.** In a browser, Unity networking only works over WebSockets
(Photon PUN/Fusion work; Mirror needs a WebSocket transport). Plain UDP/TCP will not connect.
