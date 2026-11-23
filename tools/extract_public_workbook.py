"""Copy only the public leasing rows out of a property workbook.

Reads the property's yearly workbook and writes a small workbook that holds the
monthly Occupancy row and the 13 "Box Score Stats" rows (with their totals) and
nothing else. The property name in the header is replaced by a generic label.

The script refuses to write the file if anything other than those 14 rows would
go out, or if the output contains the property's name, a name from the optional
--block-file, an email address, a phone number, or a web link. The property name
is read from the source workbook at run time, so it never appears in this script.

Usage:
    python tools/extract_public_workbook.py SOURCE.xlsx [--block-file names.txt]
"""

import argparse
from datetime import datetime
from math import isfinite
from pathlib import Path
import re
import zipfile

from openpyxl import Workbook, load_workbook

OCCUPANCY_ROW = 262           # source row: label in column C, months in G:R
BOX_HEADER_ROW = 266          # source row: "Box Score Stats", months G:R, "Total" in S
BOX_FIRST_ROW, BOX_LAST_ROW = 267, 279
MONTH_COLUMNS = range(7, 19)  # G..R
TOTAL_COLUMN = 19             # S
BOX_LABELS = [
    "New Calls", "Follow Up Calls", "New Emails", "Follow Up Emails", "New Texts",
    "Follow Up Texts", "Submitted Guest Cards", "Submitted Applications", "Walk Ins",
    "Converted To Visits", "Return Visits", "Total Prospects", "Rejected Applications",
]
PUBLIC_LABEL = "{units}-Unit Multifamily Community"
SHEET = "Leasing"
# Public layout: title B1, header B2, month row 5, occupancy row 6, box score rows 7-19.
PUBLIC_ROWS = {1, 2, 5, 6, *range(7, 20)}
LINK = re.compile(r"https?://|www\.|\.com\b|\.org\b|\.net\b", re.I)
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[a-z]{2,}", re.I)
PHONE = re.compile(r"\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b")


def fail(message):
    raise SystemExit("STOPPED: " + message)


def read_source(path):
    book = load_workbook(path, data_only=True, read_only=True)
    try:
        rows = list(book["Sheet1"].values)
    finally:
        book.close()

    def value(row, col):
        if row <= len(rows) and col <= len(rows[row - 1]):
            return rows[row - 1][col - 1]
        return None

    def number(row, col):
        result = value(row, col)
        if type(result) not in (int, float) or not isfinite(result):
            fail(f"expected a saved number at row {row}, column {col}")
        return result

    header = re.fullmatch(r"Property:\s*(.+?)\s*\(([\d,]+) Units\)", str(value(2, 2)))
    if not header:
        fail("the property header is not in the expected layout")
    dates = [value(5, col) for col in MONTH_COLUMNS]
    if any(not isinstance(date, datetime) for date in dates):
        fail("the month headers are not dates")
    year = dates[0].year
    if [(d.year, d.month) for d in dates] != [(year, month) for month in range(1, 13)]:
        fail("expected twelve consecutive calendar months")
    if value(OCCUPANCY_ROW, 3) != "Occupancy":
        fail("the Occupancy row has moved")
    if value(BOX_HEADER_ROW, 6) != "Box Score Stats" or value(BOX_HEADER_ROW, TOTAL_COLUMN) != "Total":
        fail("the Box Score Stats block has moved")
    labels = [value(row, 6) for row in range(BOX_FIRST_ROW, BOX_LAST_ROW + 1)]
    if labels != BOX_LABELS:
        fail("the box score rows are not the 13 expected rows, in order")
    occupancy = [number(OCCUPANCY_ROW, col) for col in MONTH_COLUMNS]
    if any(rate < 0 or rate > 1 for rate in occupancy):
        fail("occupancy must be between 0% and 100%")
    box = []
    for row in range(BOX_FIRST_ROW, BOX_LAST_ROW + 1):
        counts = [number(row, col) for col in MONTH_COLUMNS]
        total = number(row, TOTAL_COLUMN)
        if any(c < 0 or int(c) != c for c in counts) or total < 0 or int(total) != total:
            fail(f"leasing counts on source row {row} must be whole numbers")
        box.append((value(row, 6), [int(c) for c in counts], int(total)))
    units = int(header[2].replace(",", ""))
    if units <= 0:
        fail("the unit count must be positive")
    return dict(name=header[1], units=units, year=year, dates=dates, occupancy=occupancy, box=box)


def build_public(data):
    book = Workbook()
    sheet = book.active
    sheet.title = SHEET
    sheet["B1"] = f"Leasing and occupancy records, January to December {data['year']} (all months measured)"
    sheet["B2"] = f"Property: {PUBLIC_LABEL.format(units=data['units'])} ({data['units']} Units)"
    sheet["F5"] = "Measure"
    for offset, date in enumerate(data["dates"]):
        sheet.cell(5, 7 + offset, date).number_format = "mmm yyyy"
    sheet.cell(5, TOTAL_COLUMN, "Total")
    sheet["F6"] = "Occupancy"
    for offset, rate in enumerate(data["occupancy"]):
        sheet.cell(6, 7 + offset, rate).number_format = "0.0%"
    for index, (label, counts, total) in enumerate(data["box"]):
        row = 7 + index
        sheet.cell(row, 6, label)
        for offset, count in enumerate(counts):
            sheet.cell(row, 7 + offset, count)
        sheet.cell(row, TOTAL_COLUMN, total)
    book.properties.creator = "public extract"
    book.properties.lastModifiedBy = "public extract"
    book.properties.title = "Leasing and occupancy records"
    return book


def forbidden_terms(data, block_file):
    terms = {data["name"].lower()}
    terms.update(word.lower() for word in re.findall(r"[A-Za-z]{4,}", data["name"]))
    if block_file:
        terms.update(line.strip().lower() for line in block_file.read_text(encoding="utf-8").splitlines()
                     if line.strip())
    return terms


def check_text(where, text, terms):
    lowered = text.lower()
    if any(term in lowered for term in terms):
        fail(f"a blocked name would be written ({where}); nothing was saved")
    if EMAIL.search(text) or PHONE.search(text) or LINK.search(text):
        fail(f"an email, phone number, or web link would be written ({where}); nothing was saved")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).resolve().parents[1] / "data" / "leasing-2025-public.xlsx")
    parser.add_argument("--block-file", type=Path,
                        help="Text file, one name per line (company, management, lender, people) to refuse.")
    args = parser.parse_args()
    data = read_source(args.workbook)
    terms = forbidden_terms(data, args.block_file)
    book = build_public(data)
    sheet = book[SHEET]
    allowed_text = {sheet["B1"].value, sheet["B2"].value, "Measure", "Total", "Occupancy", *BOX_LABELS}
    for row in sheet.iter_rows():
        for cell in row:
            if cell.value is None:
                continue
            if cell.row not in PUBLIC_ROWS:
                fail(f"row {cell.row} is not one of the 14 public rows; nothing was saved")
            if isinstance(cell.value, str):
                if cell.value not in allowed_text:
                    fail(f"unexpected text in {cell.coordinate}; nothing was saved")
                check_text(cell.coordinate, cell.value, terms)
    if book.sheetnames != [SHEET]:
        fail("the public workbook must have only the Leasing sheet")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    book.save(args.output)

    # Re-open what was written: scan every file inside the .xlsx and compare the numbers back to the source.
    source_stem = args.workbook.stem.lower()
    with zipfile.ZipFile(args.output) as package:
        for name in package.namelist():
            lowered = package.read(name).decode("utf-8", "ignore").lower()
            if any(term in lowered for term in terms) or source_stem in lowered:
                args.output.unlink()
                fail(f"a blocked name was found inside {name}; the file was deleted")
    check = load_workbook(args.output, data_only=True)[SHEET]
    for index, (label, counts, total) in enumerate(data["box"]):
        row = 7 + index
        written = [check.cell(row, 7 + i).value for i in range(12)]
        if written != counts or check.cell(row, TOTAL_COLUMN).value != total:
            args.output.unlink()
            fail(f"{label} did not round-trip; the file was deleted")
    if [check.cell(6, 7 + i).value for i in range(12)] != data["occupancy"]:
        args.output.unlink()
        fail("occupancy did not round-trip; the file was deleted")
    print(f"Saved {args.output.resolve()}")
    print(f"{len(data['box']) + 1} rows x 12 months (+ totals), {data['units']} units, {data['year']}")


if __name__ == "__main__":
    main()
