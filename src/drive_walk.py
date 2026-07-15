"""Barrido recursivo de la carpeta HRM en Drive. Cataloga todo y marca lo útil
para las piezas faltantes (SUA, finiquitos, caso Feb-2025, cuestionarios)."""
import json, subprocess, sys

ROOT = "1PlWYla4XGGNBELLrJc3cBydXAh28GAYd"  # HRM (padre común de ABRIL y Reportes)
FOLDER = "application/vnd.google-apps.folder"
# no descender el detalle de comprobantes bancarios (ya mapeado, son 100+ PDFs)
SKIP_DESCEND = ("COMPROBANTES", "SEMANA 1", "SEMANA 09", "CATORCENA 0", "ABRIL 2026 SEMANALES", "ABRIL CATORCENAS")
INTERES = ["sua", "idse", "movimiento", "alta", "baja", "finiquito", "desvincul",
           "liquidac", "febrero", "feb ", "2025-02", "calendario", "periodo",
           "cuestionario", "proceso", "duda", "pregunta", "detalle", "provision",
           "emision", "patronal", "acumulado", "contabilidad"]

def kids(fid):
    try:
        out = subprocess.run(
            ["gog", "drive", "search", f"'{fid}' in parents",
             "--max", "200", "--json", "--account", "claaudlion@gmail.com"],
            capture_output=True, text=True, timeout=60)
        return json.loads(out.stdout or "{}").get("files", [])
    except Exception as e:
        print("  ERR", fid, e); return []

seen, files, folders = set(), [], []
def walk(fid, name, depth):
    if fid in seen or depth > 6 or len(seen) > 800:
        return
    seen.add(fid)
    indent = "  " * depth
    for f in sorted(kids(fid), key=lambda x: (FOLDER not in x["mimeType"], x["name"])):
        is_dir = FOLDER in f["mimeType"]
        tag = "DIR " if is_dir else "    "
        print(f"{indent}{tag}{f['name']}")
        rec = {"name": f["name"], "id": f["id"], "mime": f["mimeType"], "path": name}
        (folders if is_dir else files).append(rec)
        if is_dir and not any(s.upper() in f["name"].upper() for s in SKIP_DESCEND):
            walk(f["id"], name + "/" + f["name"], depth + 1)

print("===== ÁRBOL HRM =====")
walk(ROOT, "HRM", 0)
print(f"\n===== RESUMEN: {len(folders)} carpetas, {len(files)} archivos =====")
print("\n===== ARCHIVOS DE INTERÉS (SUA/finiquitos/feb-2025/cuestionarios/…) =====")
for f in files:
    n = f["name"].lower()
    if any(k in n for k in INTERES):
        print(f"  [{f['id']}] {f['path']}/{f['name']}")
