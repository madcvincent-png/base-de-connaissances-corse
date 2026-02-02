#!/usr/bin/env python3
"""
Télécharge les photos (communes + candidats) depuis les URLs du fichier CSV,
les convertit en JPEG (si possible), et les stocke dans ./assets/
en respectant les noms attendus par le site.

Usage (dans le repo) :
  python3 download_assets.py

Dépendances :
  pip install requests pillow
"""
import csv, os, re, unicodedata
from pathlib import Path
import requests
from PIL import Image
from io import BytesIO

COMMUNES_CSV = "Villes corses-Grid view.csv"
CANDIDATS_CSV = "Maires sortant et candidats-Grid view.csv"
ASSETS_DIR = Path("assets")
ASSETS_DIR.mkdir(parents=True, exist_ok=True)

def slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = s.replace("’","'").replace("‐","-").replace("‑","-").replace("–","-")
    s = "".join(ch for ch in unicodedata.normalize("NFKD", s) if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:80] if s else "item"

def extract_url(val: str) -> str:
    if not val:
        return ""
    val = str(val).strip()
    if val.lower() == "nan":
        return ""
    m = re.search(r"\((https?://[^)]+)\)", val)
    if m:
        return m.group(1).strip()
    if val.startswith("http://") or val.startswith("https://"):
        return val
    return ""

def download_to_jpg(url: str, out_path: Path) -> bool:
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        # Essai conversion via Pillow
        img = Image.open(BytesIO(r.content))
        img = img.convert("RGB")
        img.save(out_path, "JPEG", quality=90, optimize=True)
        return True
    except Exception:
        # fallback brut (au cas où)
        try:
            out_path.write_bytes(r.content)
            return True
        except Exception:
            return False

def main():
    ok=0; fail=0

    # Communes
    if os.path.exists(COMMUNES_CSV):
        with open(COMMUNES_CSV, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get("Nom Commune","").strip()
                url = extract_url(row.get("Photo",""))
                if not name or not url:
                    continue
                out = ASSETS_DIR / f"commune_{slugify(name)}.jpg"
                if out.exists() and out.stat().st_size > 0:
                    continue
                if download_to_jpg(url, out):
                    ok += 1
                else:
                    fail += 1
                    print("ÉCHEC commune:", name)

    # Candidats
    if os.path.exists(CANDIDATS_CSV):
        with open(CANDIDATS_CSV, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = (row.get("Name","") or "").strip()
                url = extract_url(row.get("Photo",""))
                if not name or not url:
                    continue
                ctx = (row.get("Commune du candidat","") or row.get("Maire sortant de","") or "").strip()
                out = ASSETS_DIR / f"candidat_{slugify(name)}_{slugify(ctx or 'na')}.jpg"
                if out.exists() and out.stat().st_size > 0:
                    continue
                if download_to_jpg(url, out):
                    ok += 1
                else:
                    fail += 1
                    print("ÉCHEC candidat:", name)

    print(f"Terminé : {ok} téléchargements OK, {fail} échecs.")

if __name__ == "__main__":
    main()
