"""Strip hidden metadata (GPS location, camera, date) from photos and resize them for the web.

Phone photos carry EXIF data, including the exact GPS location where they were taken. Run this on any
photo before adding it to the site:

    python3 tools/clean-photos.py ~/Desktop/trip/*.jpg

Cleaned copies are written to assets/media/ (max 1600 px, JPEG quality 82). Needs Pillow:
    python3 -m pip install pillow
"""
import sys, os
from PIL import Image, ImageOps

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "media")
os.makedirs(OUT, exist_ok=True)
for src in sys.argv[1:]:
    im = Image.open(src)
    im = ImageOps.exif_transpose(im)          # keep the correct orientation, then drop all EXIF
    im = im.convert("RGB")
    im.thumbnail((1600, 1600), Image.LANCZOS)
    name = os.path.splitext(os.path.basename(src))[0].lower().replace(" ", "-") + ".jpg"
    clean = Image.new("RGB", im.size); clean.paste(im)   # fresh image: no EXIF, XMP or ICC carried over
    clean.save(os.path.join(OUT, name), "JPEG", quality=82, optimize=True, progressive=True)
    print("cleaned ->", os.path.join("assets/media", name), clean.size)
