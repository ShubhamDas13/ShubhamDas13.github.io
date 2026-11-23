import sys, os, json, UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
data = sys.argv[1]
gen = TypeTreeGenerator("2021.3.21f1"); gen.load_local_dll_folder(os.path.join(data, "Managed"))
env = UnityPy.load(data); env.typetree_generator = gen
sig = {"jumpForce": "PlayerController", "maxHealth": "Health", "range": "RavenController", "chargeStrength": "UmibozuController",
       "collisionKnockback": "BossController", "lifetime": "BulletController", "lineOfSite": "EnemyFollowPlayer", "bullets": "BossBulletScrpit"}
seen = set()
for fname, f in sorted(env.files.items()):
    base = os.path.basename(fname)
    if not base.startswith("level"): continue
    for o in f.objects.values():
        if o.type.name != "MonoBehaviour": continue
        try: tt = o.read_typetree()
        except Exception: continue
        cls = next((c for k, c in sig.items() if k in tt), None)
        if not cls: continue
        go = f.objects.get(tt["m_GameObject"]["m_PathID"])
        gname = go.read_typetree()["m_Name"] if go else "?"
        vals = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in tt.items() if not k.startswith("m_") and not isinstance(v, (dict, list))}
        key = cls + json.dumps(vals, sort_keys=True)
        if key in seen: continue
        seen.add(key)
        print(f"{base} [{gname}] {cls}: {vals}")
# prefabs (bullets) live in sharedassets
for fname, f in env.files.items():
    if os.path.basename(fname).startswith("level"): continue
    for o in getattr(f, "objects", {}).values():
        if o.type.name != "MonoBehaviour": continue
        try: tt = o.read_typetree()
        except Exception: continue
        cls = next((c for k, c in sig.items() if k in tt), None)
        if cls:
            vals = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in tt.items() if not k.startswith("m_") and not isinstance(v, (dict, list))}
            print(f"{os.path.basename(fname)} (prefab) {cls}: {vals}")
