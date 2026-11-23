"""Extract sprite rects and animation keyframe timings from the Nimbus build -> anim.json.
usage: python anim.py <cloud_Data folder> <out anim.json>"""
import sys, json, struct, UnityPy
data, outp = sys.argv[1], sys.argv[2]
env = UnityPy.load(data)
sprites = {}
for o in env.objects:
    if o.type.name == "Sprite":
        t = o.read_typetree(); r = t["m_Rect"]; p = t["m_Pivot"]
        sprites[t["m_Name"]] = {"rect": [r["x"], r["y"], r["width"], r["height"]], "pivot": [p["x"], p["y"]], "ppu": t["m_PixelsToUnits"]}
clips = {}
for o in env.objects:
    if o.type.name != "AnimationClip": continue
    t = o.read_typetree()
    mc = t["m_MuscleClip"]["m_Clip"]["data"] if "data" in t["m_MuscleClip"]["m_Clip"] else t["m_MuscleClip"]["m_Clip"]
    raw = mc["m_StreamedClip"]["data"]; buf = struct.pack("<%dI" % len(raw), *raw)
    keys = []; i = 0
    while i + 8 <= len(buf):   # streamed clip: [time, count, (curveIndex, 4 coeffs) * count] ...
        tm = struct.unpack_from("<f", buf, i)[0]; n = struct.unpack_from("<I", buf, i + 4)[0]; i += 8
        vals = []
        for _ in range(n):
            vals.append(struct.unpack_from("<4f", buf, i + 4)[3]); i += 20
        keys.append((round(tm, 4), [round(v, 3) for v in vals]))
    clips[t["m_Name"]] = {"sampleRate": t["m_SampleRate"], "stop": round(t["m_MuscleClip"]["m_StopTime"], 4),
                          "loop": t["m_MuscleClip"]["m_LoopTime"], "keys": [k for k in keys if abs(k[0]) < 1e6]}
json.dump({"sprites": sprites, "clips": clips}, open(outp, "w"), indent=1)
print("sprites", len(sprites), "clips", len(clips))
