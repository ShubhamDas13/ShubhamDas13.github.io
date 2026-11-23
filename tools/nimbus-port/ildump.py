import sys, struct, dnfile
pe = dnfile.dnPE(sys.argv[1])
md = pe.net.mdtables
# --- opcode table (name, operand kind) ---
OP = {}
def d(code, name, kind="none"): OP[code] = (name, kind)
one = ["nop","break","ldarg.0","ldarg.1","ldarg.2","ldarg.3","ldloc.0","ldloc.1","ldloc.2","ldloc.3","stloc.0","stloc.1","stloc.2","stloc.3"]
for i, n in enumerate(one): d(i, n)
d(0x0E,"ldarg.s","u8"); d(0x0F,"ldarga.s","u8"); d(0x10,"starg.s","u8"); d(0x11,"ldloc.s","u8"); d(0x12,"ldloca.s","u8"); d(0x13,"stloc.s","u8")
d(0x14,"ldnull"); 
for i in range(-1, 9): d(0x16+i, f"ldc.i4.{'m1' if i<0 else i}")
d(0x1F,"ldc.i4.s","i8"); d(0x20,"ldc.i4","i32"); d(0x21,"ldc.i8","i64"); d(0x22,"ldc.r4","r4"); d(0x23,"ldc.r8","r8")
d(0x25,"dup"); d(0x26,"pop"); d(0x27,"jmp","tok"); d(0x28,"call","tok"); d(0x29,"calli","tok"); d(0x2A,"ret")
br_s = ["br.s","brfalse.s","brtrue.s","beq.s","bge.s","bgt.s","ble.s","blt.s","bne.un.s","bge.un.s","bgt.un.s","ble.un.s","blt.un.s"]
for i, n in enumerate(br_s): d(0x2B+i, n, "br8")
br = ["br","brfalse","brtrue","beq","bge","bgt","ble","blt","bne.un","bge.un","bgt.un","ble.un","blt.un"]
for i, n in enumerate(br): d(0x38+i, n, "br32")
d(0x45,"switch","switch")
misc = {0x46:"ldind.i1",0x47:"ldind.u1",0x48:"ldind.i2",0x49:"ldind.u2",0x4A:"ldind.i4",0x4B:"ldind.u4",0x4C:"ldind.i8",0x4D:"ldind.i",0x4E:"ldind.r4",0x4F:"ldind.r8",0x50:"ldind.ref",0x51:"stind.ref",0x52:"stind.i1",0x53:"stind.i2",0x54:"stind.i4",0x55:"stind.i8",0x56:"stind.r4",0x57:"stind.r8",
0x58:"add",0x59:"sub",0x5A:"mul",0x5B:"div",0x5C:"div.un",0x5D:"rem",0x5E:"rem.un",0x5F:"and",0x60:"or",0x61:"xor",0x62:"shl",0x63:"shr",0x64:"shr.un",0x65:"neg",0x66:"not",
0x67:"conv.i1",0x68:"conv.i2",0x69:"conv.i4",0x6A:"conv.i8",0x6B:"conv.r4",0x6C:"conv.r8",0x6D:"conv.u4",0x6E:"conv.u8",0x76:"conv.r.un",0x8E:"ldlen",0xD1:"conv.u2",0xD2:"conv.u1",0xD3:"conv.i",0xE0:"conv.u",0xDC:"endfinally",0x7A:"throw",0x14:"ldnull"}
for k,v in misc.items(): d(k,v)
tokops = {0x6F:"callvirt",0x70:"cpobj",0x71:"ldobj",0x72:"ldstr",0x73:"newobj",0x74:"castclass",0x75:"isinst",0x79:"unbox",0x7B:"ldfld",0x7C:"ldflda",0x7D:"stfld",0x7E:"ldsfld",0x7F:"ldsflda",0x80:"stsfld",0x81:"stobj",0x8C:"box",0x8D:"newarr",0x8F:"ldelema",0xA3:"ldelem",0xA4:"stelem",0xA5:"unbox.any",0xC6:"mkrefany",0xD0:"ldtoken"}
for k,v in tokops.items(): d(k, v, "str" if v=="ldstr" else "tok")
for k,v in {0x90:"ldelem.i1",0x91:"ldelem.u1",0x94:"ldelem.i4",0x97:"ldelem.i",0x98:"ldelem.r4",0x9A:"ldelem.ref",0x9E:"stelem.i4",0xA0:"stelem.r4",0xA2:"stelem.ref"}.items(): d(k,v)
d(0xDD,"leave","br32"); d(0xDE,"leave.s","br8")
OP2 = {0x01:("ceq","none"),0x02:("cgt","none"),0x03:("cgt.un","none"),0x04:("clt","none"),0x05:("clt.un","none"),0x06:("ldftn","tok"),0x07:("ldvirtftn","tok"),0x09:("ldarg","u16"),0x0C:("ldloc","u16"),0x0E:("stloc","u16"),0x15:("initobj","tok"),0x16:("constrained.","tok"),0x1C:("sizeof","tok"),0x1A:("rethrow","none")}

# --- token resolution ---
tables = {0x02: md.TypeDef, 0x01: md.TypeRef, 0x04: md.Field, 0x06: md.MethodDef, 0x0A: md.MemberRef, 0x1B: md.TypeSpec, 0x2B: md.MethodSpec}
def tname(row):
    try:
        ns = str(getattr(row, "TypeNamespace", "")); n = str(getattr(row, "TypeName", ""))
        return n
    except Exception: return "?"
field_owner = {}; method_owner = {}
for t in md.TypeDef.rows:
    for f in t.FieldList: field_owner[id(f.row)] = str(t.TypeName)
    for m in t.MethodList: method_owner[id(m.row)] = str(t.TypeName)
def resolve(tok):
    tb = tok >> 24; idx = tok & 0xFFFFFF
    try:
        if tb == 0x70:
            return repr(pe.net.user_strings.get(idx).value if hasattr(pe.net.user_strings.get(idx),'value') else pe.net.user_strings.get(idx))
        tbl = tables.get(tb)
        row = tbl.rows[idx - 1]
        if tb in (0x01, 0x02): return tname(row)
        if tb == 0x04: return f"{field_owner.get(id(row),'')}.{row.Name}"
        if tb == 0x06: return f"{method_owner.get(id(row),'')}.{row.Name}()"
        if tb == 0x0A:
            par = row.Class.row
            pn = tname(par) if par is not None and hasattr(par, "TypeName") else "spec"
            return f"{pn}::{row.Name}"
        if tb == 0x2B:
            m = row.Method.row; return f"{getattr(m,'Name','?')}<>"
        if tb == 0x1B: return "typespec"
    except Exception as e:
        return f"tok{tok:08x}"
    return f"tok{tok:08x}"

def us_string(idx):
    heap = pe.net.user_strings
    try:
        r = heap.get(idx)
        return repr(r.value if hasattr(r, "value") else str(r))
    except Exception:
        return f"str@{idx}"

def body(rva):
    off = pe.get_offset_from_rva(rva); data = pe.__data__
    h = data[off]
    if h & 3 == 2: size = h >> 2; code = data[off+1: off+1+size]
    else:
        hsize = (struct.unpack_from("<H", data, off)[0] >> 12) * 4
        size = struct.unpack_from("<I", data, off+4)[0]
        code = data[off+hsize: off+hsize+size]
    return bytes(code)

def disasm(code):
    i = 0; out = []
    while i < len(code):
        pos = i; op = code[i]; i += 1
        if op == 0xFE:
            op2 = code[i]; i += 1; name, kind = OP2.get(op2, (f"fe{op2:02x}", "none"))
        else:
            name, kind = OP.get(op, (f"op{op:02x}", "none"))
        arg = ""
        if kind == "u8": arg = str(code[i]); i += 1
        elif kind == "i8": arg = str(struct.unpack_from("<b", code, i)[0]); i += 1
        elif kind == "u16": arg = str(struct.unpack_from("<H", code, i)[0]); i += 2
        elif kind == "i32": arg = str(struct.unpack_from("<i", code, i)[0]); i += 4
        elif kind == "i64": arg = str(struct.unpack_from("<q", code, i)[0]); i += 8
        elif kind == "r4": arg = repr(round(struct.unpack_from("<f", code, i)[0], 4)); i += 4
        elif kind == "r8": arg = repr(struct.unpack_from("<d", code, i)[0]); i += 8
        elif kind == "br8": arg = f"-> {i + 1 + struct.unpack_from('<b', code, i)[0]}"; i += 1
        elif kind == "br32": arg = f"-> {i + 4 + struct.unpack_from('<i', code, i)[0]}"; i += 4
        elif kind == "tok": arg = resolve(struct.unpack_from("<I", code, i)[0]); i += 4
        elif kind == "str": arg = us_string(struct.unpack_from("<I", code, i)[0] & 0xFFFFFF); i += 4
        elif kind == "switch":
            n = struct.unpack_from("<I", code, i)[0]; i += 4
            tg = [struct.unpack_from("<i", code, i + 4*k)[0] for k in range(n)]; i += 4*n
            arg = str([i + t for t in tg])
        out.append(f"  {pos:4d}: {name} {arg}")
    return out

only = set(sys.argv[2:])
for t in md.TypeDef.rows:
    tn = str(t.TypeName)
    if only and not any(tn == o or tn.startswith("<") for o in only): continue
    for m in t.MethodList:
        r = m.row
        if not r.Rva: continue
        print(f"\n=== {tn}.{r.Name}")
        try: print("\n".join(disasm(body(r.Rva))))
        except Exception as e: print("  ERR", e)
