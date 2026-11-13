"""Baixa os DEMs LOLA (PGDA/NASA) usados pelo projeto para data/raw/ (~572 MB).

Os arquivos são públicos e grandes demais para o GitHub (o 80 m e o 240 m passam de 100 MB),
então cada pessoa baixa direto da NASA. Retoma downloads interrompidos e confere o tamanho.

Uso:
    python scripts/download_data.py            # tudo
    python scripts/download_data.py Site01     # só os arquivos cujo nome contém "Site01"
"""
import sys
import urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
PGDA = "https://pgda.gsfc.nasa.gov/data"
FILES = {
    "Site01_final_adj_5mpp_surf.tif": (f"{PGDA}/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif", 40980810),
    "Site04_final_adj_5mpp_surf.tif": (f"{PGDA}/LOLA_5mpp/Site04/Site04_final_adj_5mpp_surf.tif", 40980806),
    "Site07_final_adj_5mpp_surf.tif": (f"{PGDA}/LOLA_5mpp/Site07/Site07_final_adj_5mpp_surf.tif", 40980808),
    "Site11_final_adj_5mpp_surf.tif": (f"{PGDA}/LOLA_5mpp/Site11/Site11_final_adj_5mpp_surf.tif", 40980806),
    "LDEM_80S_80MPP_ADJ.TIF": (f"{PGDA}/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF", 189158392),
    "LDEM_60S_240MPP_ADJ.TIF": (f"{PGDA}/LOLA_20mpp/LDEM_60S_240MPP_ADJ.TIF", 218961039),
}
CHUNK = 1 << 20


def fetch(name, url, size):
    dest = RAW / name
    have = dest.stat().st_size if dest.exists() else 0
    if have == size:
        print(f"ok   {name} (already downloaded)")
        return
    if have > size:
        dest.unlink()
        have = 0
    req = urllib.request.Request(url, headers={"User-Agent": "lunar-site-navigator-data/1.0"})
    if have:
        req.add_header("Range", f"bytes={have}-")
    with urllib.request.urlopen(req, timeout=60) as r:
        if have and r.status != 206:      # servidor ignorou o Range: recomeça
            have = 0
        with open(dest, "ab" if have else "wb") as f:
            done = have
            while chunk := r.read(CHUNK):
                f.write(chunk)
                done += len(chunk)
                print(f"\r...  {name} {done / 1e6:7.1f} / {size / 1e6:.1f} MB", end="", flush=True)
    print()
    got = dest.stat().st_size
    if got != size:
        raise SystemExit(f"ERROR {name}: {got} B, expected {size} B. Run again to resume.")
    print(f"ok   {name}")


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    only = sys.argv[1:]
    for name, (url, size) in FILES.items():
        if not only or any(o in name for o in only):
            fetch(name, url, size)


if __name__ == "__main__":
    main()
