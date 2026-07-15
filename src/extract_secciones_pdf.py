"""Extrae el texto de secciones específicas de un informe PDF para ver su formato."""
import re, sys
import pdfplumber

PDF = sys.argv[1] if len(sys.argv) > 1 else "ref/informes-2025/2026-03.pdf"
# secciones objetivo (por palabra clave del título)
OBJETIVO = ["Totales por puesto", "Provisión Global", "Impuesto sobre nómina por estado"]

with pdfplumber.open(PDF) as pdf:
    paginas = [(i, p.extract_text() or "") for i, p in enumerate(pdf.pages)]

full = "\n".join(t for _, t in paginas)
lines = [re.sub(r"[ \t]+", " ", l).rstrip() for l in full.splitlines()]

# localiza líneas de encabezado de sección (romano + título)
sec_re = re.compile(r"^\s*(I{1,3}|IV|V|VI{0,3}|IX|X|XI{1,2}|XIII)[\.\)]\s+(.+)$")
heads = []
for i, l in enumerate(lines):
    m = sec_re.match(l.strip())
    if m and len(m.group(2)) > 4 and not re.match(r"^[\d\.,\s$%-]+$", m.group(2)):
        heads.append((i, m.group(1), m.group(2).strip()))

print(f"PDF: {PDF}  ({len(paginas)} pág)\nSecciones detectadas:")
for idx, rom, tit in heads:
    print(f"  L{idx:>4} {rom}. {tit}")

# imprime el bloque de cada sección objetivo (hasta la siguiente cabecera)
head_lines = [h[0] for h in heads]
for idx, rom, tit in heads:
    if any(o.lower() in tit.lower() for o in OBJETIVO):
        nxt = min([h for h in head_lines if h > idx], default=len(lines))
        print(f"\n{'='*72}\n### {rom}. {tit}  (L{idx}..{nxt})\n{'='*72}")
        bloque = [l for l in lines[idx:nxt] if l.strip()]
        for l in bloque[:70]:
            print(l)
