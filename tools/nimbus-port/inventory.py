import sys, collections, UnityPy
data = sys.argv[1]
env = UnityPy.load(data)
counts = collections.Counter()
by_type = collections.defaultdict(list)
for obj in env.objects:
    t = obj.type.name
    counts[t] += 1
    if t in ("Texture2D", "Sprite", "AudioClip", "MonoScript", "AnimationClip", "Font", "TextAsset", "Tilemap", "TileBase"):
        try:
            d = obj.read()
            name = getattr(d, "m_Name", "") or getattr(d, "name", "")
            extra = ""
            if t == "Texture2D": extra = f"{d.m_Width}x{d.m_Height}"
            if t == "AudioClip": extra = f"{round(getattr(d,'m_Length',0),1)}s"
            if t == "MonoScript": extra = getattr(d, "m_Namespace", "") + "." + getattr(d, "m_ClassName", "")
            by_type[t].append(f"{name} {extra}".strip())
        except Exception as e:
            by_type[t].append(f"? ({e.__class__.__name__})")
print("OBJECT COUNTS:", dict(counts.most_common(40)))
for t in ("MonoScript", "AudioClip", "Texture2D", "AnimationClip", "Font", "TextAsset"):
    items = by_type.get(t, [])
    print(f"\n== {t} ({len(items)})")
    if t == "MonoScript":
        items = [i for i in items if not i.split(" ",1)[-1].startswith(("UnityEngine", "Unity.", "TMPro", "Cinemachine"))]
    for i in sorted(set(items))[:80]: print("  ", i)
