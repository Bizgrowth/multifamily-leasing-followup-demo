"""Embed the public leasing workbook into the leasing operations dashboard.

Reads data/leasing-2025-public.xlsx (made by tools/extract_public_workbook.py):
the monthly Occupancy row and the 14 box score rows with their totals, and
data/ai-model-2026.json (the Projected AI impact inputs).
Writes both into the dashboard page.
"""

import argparse
from datetime import datetime
import json
from math import isfinite
from pathlib import Path
import re

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
SHEET = "Leasing"
MONTH_COLUMNS = range(7, 19)   # G..R
TOTAL_COLUMN = 19              # S
OCCUPANCY_ROW = 6
BOX_FIRST_ROW, BOX_LAST_ROW = 7, 20
BOX_LABELS = [
    "New Calls", "Follow Up Calls", "New Emails", "Follow Up Emails", "New Texts",
    "Follow Up Texts", "Submitted Guest Cards", "Submitted Applications", "Walk Ins",
    "Converted To Visits", "Return Visits", "Total Prospects", "Rejected Applications",
    "Converted To Leases",
]
MODEL_FILE = ROOT / "data" / "ai-model-2026.json"


def import_data(path):
    workbook = load_workbook(path, data_only=True, read_only=True)
    try:
        rows = list(workbook[SHEET].values)
    finally:
        workbook.close()

    def value(row, col):
        if row <= len(rows) and col <= len(rows[row - 1]):
            return rows[row - 1][col - 1]
        return None

    def number(row, col):
        result = value(row, col)
        if type(result) not in (float, int) or not isfinite(result):
            raise ValueError(f"Expected a saved number at row {row}, column {col}.")
        return result

    def monthly(row):
        return [number(row, col) for col in MONTH_COLUMNS]

    header = re.fullmatch(r"Property:\s*(.+?)\s*\(([\d,]+) Units\)", str(value(2, 2)))
    dates = [value(5, col) for col in MONTH_COLUMNS]
    if not header or any(not isinstance(date, datetime) for date in dates):
        raise ValueError("The property header or month headers do not match the expected layout.")
    year = dates[0].year
    if [(date.year, date.month) for date in dates] != [(year, month) for month in range(1, 13)]:
        raise ValueError("Expected twelve consecutive calendar months.")
    if value(5, TOTAL_COLUMN) != "Total" or value(OCCUPANCY_ROW, 6) != "Occupancy":
        raise ValueError("The Total column or the Occupancy row has moved.")
    occupancy = monthly(OCCUPANCY_ROW)
    if any(rate < 0 or rate > 1 for rate in occupancy):
        raise ValueError("Occupancy entries must be percentages between 0% and 100%.")
    leasing = []
    for row in range(BOX_FIRST_ROW, BOX_LAST_ROW + 1):
        label = value(row, 6)
        if label != BOX_LABELS[row - BOX_FIRST_ROW]:
            raise ValueError(f"Expected {BOX_LABELS[row - BOX_FIRST_ROW]} at F{row}.")
        counts = monthly(row)
        if any(count < 0 or int(count) != count for count in counts):
            raise ValueError(f"Invalid leasing counts on row {row}.")
        leasing.append(dict(name=label, row=row, months=[int(count) for count in counts],
                            reported=int(number(row, TOTAL_COLUMN))))
    units = int(header[2].replace(",", ""))
    if units <= 0:
        raise ValueError("The property must have at least one unit.")
    return dict(property=header[1], units=units, year=year, file=path.name, sheet=SHEET,
                occupancy=occupancy, leasing=leasing)


def import_model(path):
    """Load the 2026 model inputs and check them before they go into the page."""
    model = json.loads(path.read_text(encoding="utf-8"))
    rows = {row["measure"]: row for row in model["pro_forma"]}
    for name, row in rows.items():
        if name not in BOX_LABELS or len(row["months"]) != 12 or sum(row["months"]) != row["total"]:
            raise ValueError(f"2026 row {name} is not 12 months that add up to its total.")
    approved = [a - r for a, r in zip(rows["Submitted Applications"]["months"], rows["Rejected Applications"]["months"])]
    if any(lease > ok for lease, ok in zip(rows["Converted To Leases"]["months"], approved)):
        raise ValueError("2026 leases exceed approved applications in at least one month.")
    return model


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output", type=Path, help="Write a new copy of the dashboard to this path.")
    parser.add_argument("--note", default="Imported workbook snapshot",
                        help="Data label shown under the title, e.g. 'Leasing and occupancy only'.")
    args = parser.parse_args()
    dashboard = ROOT / "demo" / "leasing-ops-dashboard.html"
    output = args.output or dashboard
    if output.suffix.lower() != ".html":
        parser.error("--output must be an HTML file.")
    data = import_data(args.workbook)
    data["note"] = args.note
    template = dashboard.read_text(encoding="utf-8")
    updated = template
    for block, payload in (("workbook", data), ("ai-model", import_model(MODEL_FILE))):
        encoded = json.dumps(payload, separators=(",", ":"), allow_nan=False).replace("<", "\\u003c")
        updated, count = re.subn(r'(<script id="' + block + r'" type="application/json">).*?(</script>)',
                                 lambda match: match[1] + encoded + match[2], updated, flags=re.S)
        if count != 1:
            raise ValueError(f"The dashboard must contain one {block} data block.")
    output.write_text(updated, encoding="utf-8")
    print(f"Saved {output.resolve()}")


if __name__ == "__main__":
    main()
