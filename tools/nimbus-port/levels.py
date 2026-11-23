import sys, os, json, math, UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
data, outp = sys.argv[1], sys.argv[2]
gen = TypeTreeGenerator("2021.3.21f1"); gen.load_local_dll_folder(os.path.join(data, "Managed"))
env = UnityPy.load(data); env.typetree_generator = gen

def tt(o):
    try: return o.read_typetree()
    except Exception: return None
def deref(f, ptr):
    if not ptr or ptr.get("m_PathID", 0) == 0: return None
    fid = ptr["m_FileID"]
    if fid == 0: return f.objects.get(ptr["m_PathID"])
    try:
        ext = f.externals[fid - 1].path
        base = os.path.basename(ext).lower()
        for name, ff in env.files.items():
            if os.path.basename(name).lower() == base:
                return ff.objects.get(ptr["m_PathID"])
    except Exception: return None
    return None

# global settings
glob = {}
for o in env.objects:
    if o.type.name == "Physics2DSettings":
        t = tt(o); glob["gravity"] = t["m_Gravity"]; glob["defaultContactOffset"] = t.get("m_DefaultContactOffset")
    if o.type.name == "TagManager":
        t = tt(o); glob["tags"] = t.get("tags"); glob["layers"] = t.get("layers")
    if o.type.name == "TimeManager":
        t = tt(o); glob["fixedTimestep"] = t.get("Fixed Timestep")

sprite_cache = {}
def sprite_info(f, ptr):
    so = deref(f, ptr)
    if not so: return None
    key = (id(so.assets_file), so.path_id)
    if key in sprite_cache: return sprite_cache[key]
    s = so.read()
    t = tt(so)
    tex = s.m_RD.texture.read() if s.m_RD.texture else None
    r = t["m_Rect"]; piv = t["m_Pivot"]
    info = {"name": t["m_Name"], "tex": tex.m_Name if tex else None, "rect": [r["x"], r["y"], r["width"], r["height"]],
            "ppu": t["m_PixelsToUnits"], "pivot": [piv["x"], piv["y"]]}
    # physics shape (for colliders auto-generated)
    sprite_cache[key] = info
    return info

def quat_z(q):
    return math.degrees(2 * math.atan2(q["z"], q["w"]))

def world(f, trans_obj, memo):
    if trans_obj.path_id in memo: return memo[trans_obj.path_id]
    t = tt(trans_obj)
    p, s, q = t["m_LocalPosition"], t["m_LocalScale"], t["m_LocalRotation"]
    loc = (p["x"], p["y"], s["x"], s["y"], quat_z(q))
    par = deref(f, t["m_Father"])
    if par:
        px, py, psx, psy, prot = world(f, par, memo)
        a = math.radians(prot)
        lx, ly = loc[0] * psx, loc[1] * psy
        wx = px + lx * math.cos(a) - ly * math.sin(a); wy = py + lx * math.sin(a) + ly * math.cos(a)
        res = (wx, wy, psx * loc[2], psy * loc[3], prot + loc[4])
    else:
        res = loc
    memo[trans_obj.path_id] = res
    return res

def go_name(f, ptr):
    o = deref(f, ptr)
    if not o: return None
    if o.type.name in ("Transform", "RectTransform"):
        o = deref(f, tt(o)["m_GameObject"])
    elif o.type.name not in ("GameObject",):
        t = tt(o)
        if t and "m_GameObject" in t:
            g = deref(o.assets_file, t["m_GameObject"]); 
            return (tt(g) or {}).get("m_Name", o.type.name) + ":" + o.type.name if g else o.type.name
        return (t or {}).get("m_Name", o.type.name)
    t = tt(o) if o else None
    return t.get("m_Name") if t else None

def anim_clips(f, animator_t):
    ctrl = deref(f, animator_t.get("m_Controller"))
    out = {}
    if not ctrl: return out
    ct = tt(ctrl)
    for cp in ct.get("m_AnimationClips", []):
        co = deref(ctrl.assets_file, cp)
        if not co: continue
        c = tt(co)
        frames = []
        for b in c.get("m_ClipBindingConstant", {}).get("pptrCurveMapping", []):
            so = deref(co.assets_file, b)
            if so:
                si = sprite_info(co.assets_file, b)
                frames.append(si["name"] if si else None)
        out[c["m_Name"]] = {"fps": c.get("m_SampleRate"), "frames": frames, "loop": c.get("m_MuscleClip", {}).get("m_LoopTime")}
    return out

levels = {}
for fname, f in sorted(env.files.items()):
    base = os.path.basename(fname)
    if not base.startswith("level"): continue
    memo = {}
    objs = []
    for o in f.objects.values():
        if o.type.name != "GameObject": continue
        g = tt(o)
        ent = {"name": g["m_Name"], "tag": g["m_Tag"], "layer": g["m_Layer"], "active": g.get("m_IsActive", 1)}
        for c in g["m_Component"]:
            co = deref(f, c["component"])
            if not co: continue
            n = co.type.name; t = tt(co)
            if t is None: continue
            if n in ("Transform", "RectTransform"):
                wx, wy, sx, sy, rot = world(f, co, memo)
                ent["pos"] = [round(wx, 4), round(wy, 4)]; ent["scale"] = [round(sx, 4), round(sy, 4)]; ent["rot"] = round(rot, 3)
                par = deref(f, t["m_Father"]); ent["parent"] = go_name(f, t["m_Father"]) if par else None
                if n == "RectTransform":
                    ent["rect"] = {k: t[k] for k in ("m_AnchorMin", "m_AnchorMax", "m_AnchoredPosition", "m_SizeDelta", "m_Pivot")}
            elif n == "SpriteRenderer":
                ent["sprite"] = sprite_info(f, t["m_Sprite"]); ent["order"] = t.get("m_SortingOrder"); ent["flipX"] = t.get("m_FlipX"); ent["color"] = t.get("m_Color"); ent["enabled"] = t.get("m_Enabled")
                ent["drawMode"] = t.get("m_DrawMode"); ent["size"] = t.get("m_Size")
            elif n == "PolygonCollider2D":
                ent.setdefault("colliders", []).append({"type": "poly", "trigger": t["m_IsTrigger"], "offset": t["m_Offset"], "paths": [[[round(p["x"], 4), round(p["y"], 4)] for p in path] for path in t["m_Points"]["m_Paths"]]})
            elif n == "BoxCollider2D":
                ent.setdefault("colliders", []).append({"type": "box", "trigger": t["m_IsTrigger"], "offset": t["m_Offset"], "size": t["m_Size"], "enabled": t.get("m_Enabled")})
            elif n == "CapsuleCollider2D":
                ent.setdefault("colliders", []).append({"type": "capsule", "trigger": t["m_IsTrigger"], "offset": t["m_Offset"], "size": t["m_Size"], "dir": t.get("m_Direction")})
            elif n == "CircleCollider2D":
                ent.setdefault("colliders", []).append({"type": "circle", "trigger": t["m_IsTrigger"], "offset": t["m_Offset"], "radius": t["m_Radius"]})
            elif n == "Rigidbody2D":
                ent["rb"] = {k: t.get(k) for k in ("m_BodyType", "m_Mass", "m_LinearDrag", "m_AngularDrag", "m_GravityScale", "m_Constraints", "m_CollisionDetection")}
                mat = deref(f, t.get("m_Material")); ent["rb"]["material"] = tt(mat) if mat else None
            elif n == "Camera":
                ent["camera"] = {"ortho": t.get("orthographic"), "size": t.get("orthographic size"), "bg": t.get("m_BackGroundColor")}
            elif n == "AudioSource":
                clip = deref(f, t.get("m_audioClip"))
                ent.setdefault("audio", []).append({"clip": tt(clip)["m_Name"] if clip else None, "loop": t.get("Loop"), "volume": t.get("m_Volume"), "playOnAwake": t.get("m_PlayOnAwake")})
            elif n == "Animator":
                ent["anims"] = anim_clips(f, t)
            elif n == "TrailRenderer":
                ent["trail"] = {"time": t.get("m_Time"), "minVertexDistance": t.get("m_MinVertexDistance")}
            elif n == "MonoBehaviour":
                vals = {}
                for k, v in t.items():
                    if k.startswith("m_") and k not in ("m_text", "m_fontSize", "m_Sprite", "m_Color", "m_Lens"): continue
                    if isinstance(v, dict) and "m_PathID" in v:
                        if v["m_PathID"]: vals[k] = {"ref": go_name(f, v) or f"#{v['m_PathID']}"}
                    elif isinstance(v, dict) and k == "m_Sprite":
                        pass
                    elif not isinstance(v, (list,)):
                        vals[k] = v
                if t.get("m_Sprite"): vals["sprite"] = sprite_info(f, t["m_Sprite"])
                if t.get("m_Lens"): vals["lens"] = t["m_Lens"]
                if "m_Follow" in t: vals["follow"] = go_name(f, t["m_Follow"])
                ent.setdefault("scripts", []).append(vals)
        objs.append(ent)
    levels[base] = objs

# prefabs referenced (bullets, hearts): scan non-level files for GameObjects with BulletController or hearts
prefabs = {}
for fname, f in env.files.items():
    base = os.path.basename(fname)
    if base.startswith("level"): continue
    for o in getattr(f, "objects", {}).values():
        if o.type.name != "GameObject": continue
        g = tt(o)
        if not g: continue
        nm = g["m_Name"]
        ent = {"file": base}
        keep = False
        for c in g.get("m_Component", []):
            co = deref(f, c["component"]); 
            if not co: continue
            n = co.type.name; t = tt(co)
            if t is None: continue
            if n == "SpriteRenderer": ent["sprite"] = sprite_info(f, t["m_Sprite"])
            if n == "Transform": ent["scale"] = t["m_LocalScale"]
            if n == "CircleCollider2D": ent["circle"] = t["m_Radius"]; ent["trigger"] = t["m_IsTrigger"]
            if n == "BoxCollider2D": ent["box"] = t["m_Size"]; ent["trigger"] = t["m_IsTrigger"]
            if n == "CapsuleCollider2D": ent["capsule"] = t["m_Size"]; ent["trigger"] = t["m_IsTrigger"]
            if n == "Rigidbody2D": ent["rb"] = {k: t.get(k) for k in ("m_BodyType", "m_GravityScale")}
            if n == "Animator": ent["anims"] = anim_clips(f, t)
            if n == "MonoBehaviour":
                vals = {k: v for k, v in t.items() if not k.startswith("m_") and not isinstance(v, (dict, list))}
                if vals: ent.setdefault("scripts", []).append(vals); keep = True
                if t.get("m_Sprite"): ent["uiSprite"] = sprite_info(f, t["m_Sprite"]); keep = True
            if n == "AudioSource":
                clip = deref(f, t.get("m_audioClip")); ent["audio"] = tt(clip)["m_Name"] if clip else None
        if keep or "anims" in ent: prefabs[nm] = ent
json.dump({"global": glob, "levels": levels, "prefabs": prefabs}, open(outp, "w"), indent=1, default=str)
print("ok", {k: len(v) for k, v in levels.items()}, "prefabs", list(prefabs)[:20])
