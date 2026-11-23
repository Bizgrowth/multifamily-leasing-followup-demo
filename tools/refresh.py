"""Embed a property workbook into the leasing operations demo.

Reads the monthly summary, occupancy, and leasing blocks from a workbook in the
supported layout and writes a copy of the demo with that data embedded.
"""

import argparse
from datetime import datetime
import json
from math import isfinite
from pathlib import Path
import re

from openpyxl import load_workbook


FINANCIALS = [
    ("Income", 252, 57),
    ("Operating expenses", 253, 183),
    ("Controllable NOI", 254, 185),
    ("Non-controllable expenses", 255, 201),
    ("Workbook-labeled NOI", 256, 203),
    ("Non-operating expenses", 257, 242),
    ("Net income", 258, 244),
]
DETAILS = [
    ("Loss to Vacancy", 13), ("Total Loss to Concessions", 20),
    ("Total Loss to Collections", 56), ("Total Vendor Services", 120),
    ("Total Utility Expense", 150), ("Total Payroll & Labor Expense", 182),
    ("Total Depreciation & Amortization", 190), ("Total Mortgage & Debt Expense", 194),
    ("Total Capital Expenditures", 240),
]


def import_data(path):
    workbook = load_workbook(path, data_only=True, read_only=True)
    try:
        sheet = workbook["Sheet1"]
        rows = list(sheet.values)
    finally:
        workbook.close()

    def value(row, col):
        return rows[row - 1][col - 1]

    def number(row, col):
        result = value(row, col)
        if type(result) not in (float, int) or not isfinite(result):
            raise ValueError(f"Expected a saved number at row {row}, column {col}.")
        return result

    def monthly(row):
        return [number(row, col) for col in range(7, 19)]

    property_name = re.fullmatch(r"Property:\s*(.+?)\s*\(([\d,]+) Units\)", str(value(2, 2)))
    dates = [value(5, col) for col in range(7, 19)]
    if not property_name or any(not isinstance(date, datetime) for date in dates):
        raise ValueError("The property header or reporting dates do not match the expected layout.")
    year = dates[0].year
    if [(date.year, date.month) for date in dates] != [(year, month) for month in range(1, 13)]:
        raise ValueError("Expected twelve consecutive calendar months in the reporting year.")
    for col, label in [(20, "REVISED TOTAL"), (22, "ORIGINAL BUDGET")]:
        if " ".join(str(value(5, col)).split()) != label:
            raise ValueError(f"Expected the {label} column in the workbook.")
    expected = ["Income", "Expense", "Controllable NOI", "Non Controllable Expense",
                "Net Operating Income", "Non Operating Expense", "NET INCOME"]
    if [value(row, 3) for _, row, _ in FINANCIALS] != expected or value(262, 3) != "Occupancy":
        raise ValueError("The financial summary or occupancy rows have moved.")
    occupancy = monthly(262)
    if any(rate < 0 or rate > 1 for rate in occupancy):
        raise ValueError("Occupancy entries must be percentages between 0% and 100%.")

    finance = []
    for name, row, detail_row in FINANCIALS:
        sign = -1 if row in (253, 255, 257) else 1
        finance.append(dict(name=name, row=row, months=monthly(row), revised=number(row, 20),
                            budget=number(row, 22), detailRow=detail_row,
                            detail=[sign * entry for entry in monthly(detail_row)]))
    details = []
    for label, row in DETAILS:
        source = re.sub(r"^\d+\s+", "", str(value(row, 3)).strip())
        if source != label:
            raise ValueError(f"Expected {label} at row {row}.")
        details.append(dict(name=label, row=row, months=monthly(row), revised=number(row, 20),
                            budget=number(row, 22)))
    leasing = []
    for row in range(267, 280):
        label = value(row, 6)
        if not isinstance(label, str) or not label.strip():
            raise ValueError(f"Missing leasing label at F{row}.")
        counts = monthly(row)
        if any(count < 0 or int(count) != count for count in counts):
            raise ValueError(f"Invalid leasing counts on row {row}.")
        leasing.append(dict(name=label, row=row, months=counts, reported=number(row, 19)))
    if [leasing[i]["name"] for i in (3, 5, 7, 9, 11)] != [
        "Follow Up Emails", "Follow Up Texts", "Submitted Applications",
        "Converted To Visits", "Total Prospects"
    ]:
        raise ValueError("The dashboard's leasing rows have moved.")
    units = int(property_name[2].replace(",", ""))
    if units <= 0:
        raise ValueError("The property must have at least one unit.")
    return dict(property=property_name[1], units=units, year=year,
                file=path.name, occupancy=occupancy, finance=finance, details=details, leasing=leasing)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output", type=Path, help="Write a new copy of the dashboard to this path.")
    parser.add_argument("--note", default="Imported workbook snapshot",
                        help="Data label shown in the demo banner, e.g. 'Synthetic data'.")
    args = parser.parse_args()
    dashboard = Path(__file__).resolve().parents[1] / "demo" / "linden-park-leasing-ops-demo.html"
    output = args.output or dashboard
    if output.suffix.lower() != ".html":
        parser.error("--output must be an HTML file.")
    data = import_data(args.workbook)
    data["note"] = args.note
    encoded = json.dumps(data, separators=(",", ":"), allow_nan=False).replace("<", "\\u003c")
    template = dashboard.read_text(encoding="utf-8")
    updated, count = re.subn(r'(<script id="workbook" type="application/json">).*?(</script>)',
                            lambda match: match[1] + encoded + match[2], template, flags=re.S)
    if count != 1:
        raise ValueError("The dashboard must contain one workbook data block.")
    output.write_text(updated, encoding="utf-8")
    print(f"Saved {output.resolve()}")


if __name__ == "__main__":
    main()
