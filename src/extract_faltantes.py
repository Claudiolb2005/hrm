"""Extrae el contenido de las secciones I, II, III, VII, VIII, XIII del informe
canónico (Marzo 2026) para modelarlas en el generador. Uso puntual de análisis."""
import re, sys
import pdfplumber

PDF = sys.argv[1] if len(sys.argv) > 1 else "ref/informes-2025/2026-03.pdf"
OBJETIVO = sys.argv[2].split(",") if len(sys.argv) > 2 else ["I", "II", "III", "VII", "VIII", "XIII"]

with pdfplumber.open(PDF) as pdf:
    paginas = [(i, p.extract_text() or "") for i, p in enumerate(pdf.pages)]
full = "\n".join(t for _, t in paginas)
lines = [re.sub(r"[ \t]+", " ", l).rstrip() for l in full.splitlines()]

sec_re = re.compile(r"^\s*(I{1,3}|IV|V|VI{0,3}|IX|X|XI{1,3}|XIII)[\.\)]\s+(.+)$")
heads = []
for i, l in enumerate(lines):
    m = sec_re.match(l.strip())
    if m and len(m.group(2)) > 3 and not re.match(r"^[\d\.,\s$%-]+$", m.group(2)):
        heads.append((i, m.group(1), m.group(2).strip()))

print(f"PDF: {PDF} ({len(paginas)} pág)\n=== SECCIONES DETECTADAS ===")
for idx, rom, tit in heads:
    print(f"  L{idx:>4} {rom}. {tit}")

head_lines = [h[0] for h in heads]
for idx, rom, tit in heads:
    if rom in OBJETIVO:
        nxt = min([h for h in head_lines if h > idx], default=len(lines))
        print(f"\n{'='*74}\n### {rom}. {tit}  (L{idx}..{nxt})\n{'='*74}")
        for l in [x for x in lines[idx:nxt] if x.strip()][:55]:
            print(l)
