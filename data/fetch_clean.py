#!/usr/bin/env python3
"""Fetch LBNL Queued Up (2026 edition, data through 2025) and write the lab's cleaned snapshot.

    uv run --with pandas --with openpyxl python3 data/fetch_clean.py

Writes data/queue.json (compact columns the page loads) and data/SNAPSHOT.md (row counts at
every cleaning step). The raw workbook goes to data/raw/ (gitignored). Every rule below is
also written out in DATA.md, so change both together.
"""
import hashlib, json, os, sys, urllib.request
from datetime import date

import pandas as pd

URL = "https://eta-publications.lbl.gov/sites/default/files/2026-05/lbnl_ix_queue_data_file_thru2025.xlsx"
SHA256 = "794582d3281c6a305e9615fcfec3fae9dc85be2165216d33760b677e976a08b6"
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw", "lbnl_ix_queue_data_file_thru2025.xlsx")
SHEET = "03. Complete Queue Data"

EPOCH = date(2000, 1, 1)          # dates are stored as days since this
CENSOR = date(2025, 12, 31)       # data are complete through the end of 2025
TIMING_REGIONS = ["CAISO", "MISO", "PJM", "SPP"]   # >= 90% of terminal events dated, 2010+ entries
TIMING_YEARS = (2010, 2025)

REGIONS = ["PJM", "MISO", "ERCOT", "SPP", "CAISO", "NYISO", "ISO-NE", "Southeast", "West"]
TYPES = ["Solar", "Solar+Storage", "Wind", "Offshore wind", "Battery", "Gas", "Nuclear", "Other"]
TYPE_MAP = {"Solar": "Solar", "Solar+Battery": "Solar+Storage", "Wind": "Wind",
            "Offshore Wind": "Offshore wind", "Battery": "Battery", "Gas": "Gas", "Gas+Oil": "Gas",
            "Nuclear": "Nuclear"}
STATUS = {"active": 0, "suspended": 0, "operational": 1, "withdrawn": 2}


def fetch():
    if not os.path.exists(RAW):
        os.makedirs(os.path.dirname(RAW), exist_ok=True)
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (interconnection-queue-lab)"})
        with urllib.request.urlopen(req) as r, open(RAW, "wb") as f:
            f.write(r.read())
    h = hashlib.sha256(open(RAW, "rb").read()).hexdigest()
    if h != SHA256:
        sys.exit(f"SHA-256 mismatch: got {h}. LBNL may have revised the file; review DATA.md before updating.")
    return h


def days(d):
    return None if pd.isna(d) else (d.date() - EPOCH).days


def main():
    sha = fetch()
    df = pd.read_excel(RAW, sheet_name=SHEET, header=1)
    log = [("Rows in sheet `03. Complete Queue Data`", len(df))]

    for c in ["q_date", "on_date", "wd_date"]:
        df[c] = pd.to_datetime(df[c], errors="coerce")
    df = df[df.q_status != "unknown"];             log.append(("Drop status `unknown`", len(df)))
    df = df[df.q_date.notna()];                    log.append(("Drop rows with no request date", len(df)))
    df = df[df.q_date.dt.date <= CENSOR]

    mw = df[["mw_1", "mw_2", "mw_3"]].clip(lower=0).fillna(0).sum(axis=1)
    df = df.assign(mw=mw.round(1), st=df.q_status.map(STATUS),
                   ty=df.type_clean.map(TYPE_MAP).fillna("Other"))
    df = df[df.region.isin(REGIONS)]

    # Event date: COD for operational, withdrawal date for withdrawn.
    ev = df.on_date.where(df.st == 1, df.wd_date.where(df.st == 2))
    bad_order = ev.notna() & (ev < df.q_date)
    after = ev.notna() & (ev.dt.date > CENSOR)
    n_bad, n_after = int(bad_order.sum()), int(after.sum())

    yr = df.q_date.dt.year
    in_cell = df.region.isin(TIMING_REGIONS) & yr.between(*TIMING_YEARS)
    undated = (df.st > 0) & ev.isna()
    timing = in_cell & ~undated & ~bad_order
    n_cell, n_undated_cell = int(in_cell.sum()), int((in_cell & undated).sum())

    out_ev = [None if (pd.isna(e) or b) else days(e) for e, b in zip(ev, bad_order)]
    # Events after the censor date: at the end of 2025 these requests were still in the queue.
    st = df.st.where(~after, 0).tolist()
    out_ev = [None if a else e for e, a in zip(out_ev, after)]

    # LBNL's own convention for "request→COD for projects online in year Y": any row with an online date,
    # whatever its status. Recorded so the page can show both conventions side by side.
    online25 = df[df.on_date.dt.year == 2025]
    lbnl_style = online25.on_date.sub(online25.q_date).dt.days / 30.4375
    lbnl = {"medianMonths2025": round(float(lbnl_style.median()), 2), "n": int(len(online25)),
            "nNotOperational": int((online25.st != 1).sum()),
            "nWithdrawnSPP": int(((online25.q_status == "withdrawn") & (online25.region == "SPP")).sum())}

    data = {
        "source": "Lawrence Berkeley National Laboratory & GridTracker, Queued Up 2026 Edition data file (through 2025), CC BY 4.0",
        "sha256": sha, "epoch": EPOCH.isoformat(), "censor": (CENSOR - EPOCH).days,
        "regions": REGIONS, "types": TYPES, "timingRegions": TIMING_REGIONS, "timingYears": list(TIMING_YEARS),
        "status": ["in queue", "operational", "withdrawn"],
        "r": [REGIONS.index(x) for x in df.region], "t": [TYPES.index(x) for x in df.ty],
        "mw": [float(x) for x in df.mw], "q": [days(x) for x in df.q_date], "s": [int(x) for x in st],
        "e": out_ev, "tm": [int(x) for x in timing], "lbnlStyle": lbnl,
    }
    with open(os.path.join(HERE, "queue.json"), "w") as f:
        json.dump(data, f, separators=(",", ":"))

    log += [("Kept (all nine regions)", len(df)),
            (f"Timing cells: {', '.join(TIMING_REGIONS)}, entered {TIMING_YEARS[0]}–{TIMING_YEARS[1]}", n_cell),
            ("…of which operational/withdrawn with no event date (dropped from timing)", n_undated_cell),
            ("Event dated before request (excluded from timing, all regions)", n_bad),
            ("Event dated after 2025-12-31 (counted as still in the queue at end-2025)", n_after),
            ("Timing sample", int(timing.sum())),
            (f"LBNL-style 2025 median request→COD = {lbnl['medianMonths2025']} months over rows with a 2025 online date (any status)", lbnl["n"])]
    with open(os.path.join(HERE, "SNAPSHOT.md"), "w") as f:
        f.write("# Snapshot\n\nGenerated by `data/fetch_clean.py`. Do not edit by hand.\n\n")
        f.write(f"- Source SHA-256: `{sha}`\n- Censor date: {CENSOR}\n\n| Step | Rows |\n|---|---:|\n")
        for k, v in log:
            f.write(f"| {k} | {v:,} |\n")
    for k, v in log:
        print(f"{v:>8,}  {k}")


if __name__ == "__main__":
    main()
