"""Extrae estructura de secciones + cifras cabecera de los informes PDF."""
import re, glob, os
import pdfplumber

def norm(s):
    return re.sub(r"\s+", " ", s).strip()

# patrones de encabezado de sección (romanos I..XIII, con o sin punto)
SEC = re.compile(r"^\s*(X?I{0,3}V?|VI{0,3}|I?X|XI{0,3}|XIII|XII)\b[\.\-\)]\s*([A-ZÁÉÍÓÚÑ][^\n]{4,70})")
ROMANS = {"I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII"}

def sections(text):
    out=[]
    for ln in text.splitlines():
        l=norm(ln)
        m=re.match(r"^(I{1,3}|IV|V|VI{0,3}|IX|X|XI{1,2}|XIII)[\.\-\)]\s+(.{4,70})$", l)
        if m and m.group(1) in ROMANS:
            title=m.group(2)
            # descarta líneas que son puro número
            if not re.match(r"^[\d\.,\s\$%-]+$", title):
                out.append(f"{m.group(1)}. {title}")
    # dedup preservando orden
    seen=set(); res=[]
    for s in out:
        k=s.split(".")[0]
        if k not in seen:
            seen.add(k); res.append(s)
    return res

KEYS = {
 "empleados": re.compile(r"(n[uú]mero de (?:empleados|trabajadores)|total de (?:empleados|trabajadores)|head\s*count)", re.I),
 "neto": re.compile(r"neto", re.I),
 "isn": re.compile(r"impuesto sobre n[oó]mina|\bISN\b", re.I),
 "imss": re.compile(r"\bIMSS\b", re.I),
 "dispers": re.compile(r"dispers|traspaso|provisi[oó]n global", re.I),
}
MONEY = re.compile(r"\$?\s*\d{1,3}(?:[,\s]\d{3})+(?:\.\d{2})?")

for path in sorted(glob.glob("/Users/claudioleon/.openclaw/workspace/hrm/ref/informes-2025/*.pdf")):
    name=os.path.basename(path).replace(".pdf","")
    try:
        with pdfplumber.open(path) as pdf:
            npag=len(pdf.pages)
            text="\n".join((p.extract_text() or "") for p in pdf.pages)
    except Exception as e:
        print(f"\n## {name}: ERROR {e}"); continue
    secs=sections(text)
    print(f"\n## {name}  ({npag} pág, {len(text)} chars) — {len(secs)} secciones detectadas")
    for s in secs:
        print("   ", s)
