import sys, os, json, subprocess
from PIL import Image
S, OUT = sys.argv[1], sys.argv[2]   # S: work folder (levels.json, anim.json, extract/tex, extract/audio); OUT: games/nimbus
os.makedirs(os.path.join(OUT, "assets", "img"), exist_ok=True); os.makedirs(os.path.join(OUT, "assets", "audio"), exist_ok=True)
lv = json.load(open(os.path.join(S, "levels.json")))
an = json.load(open(os.path.join(S, "anim.json")))
TEX = os.path.join(S, "extract", "tex"); AUD = os.path.join(S, "extract", "audio")
IMG_OUT = os.path.join(OUT, "assets", "img"); AUD_OUT = os.path.join(OUT, "assets", "audio")

# ---------- images ----------
images = {}
def add_image(tex, max_side=None):
    if tex in images: return images[tex]
    src = os.path.join(TEX, tex + ".png")
    im = Image.open(src).convert("RGBA")
    W, H = im.size
    if max_side and max(W, H) > max_side:
        k = max_side / max(W, H); im = im.resize((round(W * k), round(H * k)), Image.LANCZOS)
    fn = tex.replace(" ", "_").replace("(", "").replace(")", "").replace(".", "").replace("-", "_") + ".png"
    im.save(os.path.join(IMG_OUT, fn), optimize=True)
    images[tex] = {"file": fn, "texW": W, "texH": H, "w": im.size[0], "h": im.size[1]}
    return images[tex]

BIG = {"Apallo- 2": 1024, "Apolio_1": 1024, "orade": 1024}
def sprite(name, tex=None):
    s = an["sprites"].get(name)
    if not s: return None
    t = tex or name.rsplit("_", 1)[0] if name not in ("Jump (32x32)", "Fall (32x32)") else name
    if tex: t = tex
    if not os.path.exists(os.path.join(TEX, t + ".png")): t = name
    img = add_image(t, BIG.get(t, 512) if t not in ("level 1", "level 2", "level 3", "level-3-platform") and not t.endswith("(32x32)") and not t.startswith("heart") else None)
    x, y, w, h = s["rect"]
    return {"img": t, "rect": [x, img["texH"] - (y + h), w, h], "pivot": s["pivot"], "ppu": s["ppu"]}

sprites = {}
def need(name, tex=None):
    if name not in sprites:
        sp = sprite(name, tex)
        if sp: sprites[name] = sp
    return name

clips = {}
def clip(name, frames):
    c = an["clips"][name]
    times = [0.0] + [k[0] for k in c["keys"]]
    idx = [0] + [int(k[1][0]) for k in c["keys"]]
    seq = [need(frames[i]) for i in idx] if frames else []
    clips[name] = {"times": times, "frames": seq, "length": max(c["stop"], 0.0167), "loop": bool(c["loop"])}

# ---------- levels ----------
L = lv["levels"]
SCENE_FILES = {2: "level2", 3: "level3", 4: "level4"}
def coll_world(e, c):
    px, py = e["pos"]; sx, sy = e["scale"]; ox, oy = c["offset"]["x"], c["offset"]["y"]
    if c["type"] == "poly":
        return [[[round(px + (x + ox) * sx, 4), round(py + (y + oy) * sy, 4)] for x, y in path] for path in c["paths"]]
    if c["type"] == "box":
        w, h = c["size"]["x"] * abs(sx), c["size"]["y"] * abs(sy); cx, cy = px + ox * sx, py + oy * sy
        return [round(cx - w / 2, 4), round(cy - h / 2, 4), round(cx + w / 2, 4), round(cy + h / 2, 4)]

def poly_box(e):
    c = next(c for c in e["colliders"] if c["type"] in ("poly", "box"))
    sx, sy = e["scale"]
    if c["type"] == "box":
        return {"cx": c["offset"]["x"] * sx, "cy": c["offset"]["y"] * sy, "w": c["size"]["x"] * abs(sx), "h": c["size"]["y"] * abs(sy)}
    pts = [p for path in c["paths"] for p in path]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return {"cx": (min(xs) + max(xs)) / 2 * sx, "cy": (min(ys) + max(ys)) / 2 * sy, "w": (max(xs) - min(xs)) * abs(sx), "h": (max(ys) - min(ys)) * abs(sy)}

scenes = {}
for idx, fn in SCENE_FILES.items():
    ents = L[fn]
    sc = {"solids": [], "boxes": [], "kill": [], "oracle": [], "art": [], "umibozu": [], "ravens": [], "boss": None}
    by_name = {}
    for e in ents: by_name.setdefault(e["name"], []).append(e)
    cam = next(e for e in ents if e.get("camera"))
    sc["camera"] = {"size": cam["camera"]["size"], "x": cam["pos"][0], "y": cam["pos"][1],
                    "bg": [cam["camera"]["bg"][k] for k in "rgb"], "follow": idx != 4}
    mus = next(e for e in ents if e["name"] == "BackgroundMusic")["audio"][0]
    sc["music"] = {"clip": mus["clip"], "volume": mus["volume"]}
    for e in ents:
        n = e["name"]
        if e.get("tag") == 20000:   # Platform-tagged level art
            if e.get("sprite"):
                sc["art"].append({"sprite": need(e["sprite"]["name"], e["sprite"]["tex"]), "x": e["pos"][0], "y": e["pos"][1], "sx": e["scale"][0], "sy": e["scale"][1], "order": e.get("order", 0)})
            is_level = any(s.get("m_Script") is None and False for s in e.get("scripts", []))
            for c in e.get("colliders", []):
                w = coll_world(e, c)
                if c["type"] == "poly": sc["solids"].extend(w)
                elif c["type"] == "box":
                    if c["trigger"]: sc["kill"].append(w)
                    else: sc["boxes"].append({"r": w, "platform": True})
        elif n == "Oracle":
            sc["art"].append({"sprite": need(e["sprite"]["name"], e["sprite"]["tex"]), "x": e["pos"][0], "y": e["pos"][1], "sx": 1, "sy": 1, "order": 0})
            sc["oracle"].append(coll_world(e, e["colliders"][0]))
        elif n == "Player":
            sc["player"] = {"x": e["pos"][0], "y": e["pos"][1], "scale": e["scale"][0]}
        elif n == "Enemy" and e.get("sprite"):
            parent = e["parent"]
            st = next(x for x in ents if x["name"] == "Start" and x["parent"] == parent)
            en = next(x for x in ents if x["name"] == "End" and x["parent"] == parent)
            sc["umibozu"].append({"x": e["pos"][0], "y": e["pos"][1], "scale": e["scale"][0], "start": st["pos"], "end": en["pos"], "box": poly_box(e)})
        elif n.startswith("Raven") and e.get("sprite"):
            bp = next(x for x in ents if x["name"].lower() == "bulletposi" and x["parent"] == n)
            b = poly_box(e)
            sc["ravens"].append({"x": e["pos"][0], "y": e["pos"][1], "bullet": bp["pos"], "box": b})
            sc["boxes"].append({"r": [e["pos"][0] + b["cx"] - b["w"] / 2, e["pos"][1] + b["cy"] - b["h"] / 2, e["pos"][0] + b["cx"] + b["w"] / 2, e["pos"][1] + b["cy"] + b["h"] / 2], "platform": False})
        elif n == "Boss1":
            bp = next(x for x in ents if x["name"] == "BulletPosi")
            sc["boss"] = {"x": e["pos"][0], "y": e["pos"][1], "scale": e["scale"][0], "bullet": bp["pos"], "box": poly_box(e)}
    scenes[idx] = sc

# animations: frames lists from levels.json animators
def frames_of(entname, clipname, fn="level2"):
    for lvl in ("level2", "level3", "level4"):
        for e in L[lvl]:
            if e["name"] == entname and e.get("anims") and clipname in e["anims"]:
                return e["anims"][clipname]["frames"]
for cn in ("player-idle", "player-run", "player-jump", "player-fall", "player-slide", "player-damage"): clip(cn, frames_of("Player", cn))
for cn in ("umibozu-walk", "umibozu-charge"): clip(cn, frames_of("Enemy", cn))
for cn in ("raven-fly", "raven-attack"): clip(cn, frames_of("Raven", cn))
clip("apollo-fight", frames_of("Boss1", "apollo-fight"))
clip("bullet-idle", lv["prefabs"]["bullet"]["anims"]["bullet-idle"]["frames"])
bullet = lv["prefabs"]["bullet"]
need("heart_animated_1_0"); need("heart_animated_1_4")
# menu images
for t in ("level 3", "level-3-platform", "orade", "umibozu angry 1", "raven open angry", "Apallo- 2", "Jump (32x32)", "Fall (32x32)"):
    need(t, t)

# ---------- audio ----------
audio = {}
for f in sorted(os.listdir(AUD)):
    name = f[:-4]; out = name.replace(" ", "_") + ".m4a"
    dst = os.path.join(AUD_OUT, out)
    if not os.path.exists(dst):
        br = "64000" if name in ("to_unknown_location", "wooden_work", "vitalezzz_-_orbital_graveyard_modanung_remix", "monologue-wind-60484", "sp_chord-sweep_major_d_125-95877") else "96000"
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", br, os.path.join(AUD, f), dst], check=True)
    audio[name] = out

data = {"scenes": scenes, "images": images, "sprites": sprites, "clips": clips, "audio": audio,
        "bullet": {"scale": [bullet["scale"]["x"], bullet["scale"]["y"]], "box": bullet["box"]},
        "gravity": lv["global"]["gravity"]["y"], "fixedDt": 0.02}
os.makedirs(os.path.join(OUT, "js"), exist_ok=True)
with open(os.path.join(OUT, "js", "data.js"), "w") as fh:
    fh.write("/* Generated from the Nimbus Unity build (cloud_Data) by build.py. */\nwindow.NIMBUS_DATA = ")
    json.dump(data, fh, separators=(",", ":"))
    fh.write(";\n")
print("images", len(images), "sprites", len(sprites), "clips", len(clips), "audio", len(audio))
for k, v in scenes.items(): print(k, "solids", len(v["solids"]), "boxes", len(v["boxes"]), "kill", len(v["kill"]), "oracle", len(v["oracle"]), "umi", len(v["umibozu"]), "ravens", len(v["ravens"]), "boss", bool(v["boss"]), "art", [a["sprite"] for a in v["art"]], "cam", v["camera"])
