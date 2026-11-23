import sys, dnfile
pe = dnfile.dnPE(sys.argv[1])
md = pe.net.mdtables
types = md.TypeDef
methods = md.MethodDef.rows
fields = md.Field.rows
trows = types.rows
for i, t in enumerate(trows):
    name = str(t.TypeName); ns = str(t.TypeNamespace)
    if name == "<Module>": continue
    ext = t.Extends.row
    base = (str(getattr(ext, "TypeName", "")) if ext is not None else "")
    fl = [str(f.row.Name) for f in t.FieldList]
    ml = [str(m.row.Name) for m in t.MethodList]
    print(f"{ns+'.' if ns else ''}{name} : {base}")
    if fl: print("   fields:", ", ".join(fl))
    if ml: print("   methods:", ", ".join(ml))
us = pe.net.user_strings
if us:
    print("\nSTRINGS:")
    seen=set()
    off=1
    data=us.get_data_bytes() if hasattr(us,'get_data_bytes') else us.__data__
    import re
    # user strings heap: length-prefixed UTF-16
    i=1
    while i < len(data):
        b=data[i]
        if b & 0x80==0: ln=b; i+=1
        elif b & 0xC0==0x80: ln=((b&0x3F)<<8)|data[i+1]; i+=2
        else: ln=((b&0x1F)<<24)|(data[i+1]<<16)|(data[i+2]<<8)|data[i+3]; i+=4
        if ln==0: continue
        s=data[i:i+ln-1].decode('utf-16-le','replace'); i+=ln
        if s not in seen: seen.add(s); print("  ", repr(s))
