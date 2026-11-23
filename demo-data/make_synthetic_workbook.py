"""Build the fictional Linden Park workbook used by the public demo.

Every figure here is generated. Nothing is copied from a real property. The sheet
follows the layout that tools/refresh.py reads, so the public demo is produced by
the same import path a real engagement would use.

One discrepancy is planted on purpose: July operating expenses in the summary block
are understated by $12,416.27 versus the detail rows, so the reconciliation panel
has something real to find.
"""

from datetime import datetime
from pathlib import Path
import random

from openpyxl import Workbook

UNITS = 268
YEAR = 2025
PLANTED_MONTH = 6          # July
PLANTED_AMOUNT = 12416.27  # expense missing from the July summary row

rng = random.Random(20251)
r2 = lambda value: round(value, 2)

occupancy = [0.912, 0.918, 0.927, 0.931, 0.936, 0.944, 0.941, 0.947, 0.951, 0.949, 0.953, 0.958]

# Income from rent roll assumptions (average rent and other income are fictional).
income = [r2(UNITS * occ * 1487.5 + rng.uniform(9000, 14000)) for occ in occupancy]
payroll = [r2(rng.uniform(24500, 31500)) for _ in range(12)]
payroll[11] = r2(payroll[11] + 14800)  # year-end bonus accrual
vendors = [r2(rng.uniform(11800, 18900)) for _ in range(12)]
utilities = [r2(rng.uniform(15200, 17900) + (2200 if m in (0, 1, 6, 7) else 0)) for m in range(12)]
other_opex = [r2(rng.uniform(82000, 91000)) for _ in range(12)]
opex = [r2(p + v + u + o) for p, v, u, o in zip(payroll, vendors, utilities, other_opex)]
depreciation = [r2(81240.55 if m else 79880.10) for m in range(12)]
debt = [r2(118660.40 if m % 2 == 0 else 114832.65) for m in range(12)]
noncontrollable = [r2(d + b) for d, b in zip(depreciation, debt)]
nonoperating = [0.0] * 12
nonoperating[8] = 4210.88

true_noi = [r2(i - e) for i, e in zip(income, opex)]
true_wb_noi = [r2(n - c) for n, c in zip(true_noi, noncontrollable)]
true_net = [r2(n - x) for n, x in zip(true_wb_noi, nonoperating)]

summary_opex = list(opex)
summary_opex[PLANTED_MONTH] = r2(opex[PLANTED_MONTH] - PLANTED_AMOUNT)
summary_noi = [r2(i - e) for i, e in zip(income, summary_opex)]
summary_wb_noi = [r2(n - c) for n, c in zip(summary_noi, noncontrollable)]
summary_net = [r2(n - x) for n, x in zip(summary_wb_noi, nonoperating)]

# (summary label, summary row, summary values, detail row, detail values, annual budget)
finance = [
    ("Income", 252, income, 57, income, 4581000),
    ("Expense", 253, [-v for v in summary_opex], 183, opex, -1729500),
    ("Controllable NOI", 254, summary_noi, 185, true_noi, 2851500),
    ("Non Controllable Expense", 255, [-v for v in noncontrollable], 201, noncontrollable, -2368000),
    ("Net Operating Income", 256, summary_wb_noi, 203, true_wb_noi, 483500),
    ("Non Operating Expense", 257, [-v for v in nonoperating], 242, nonoperating, 0),
    ("NET INCOME", 258, summary_net, 244, true_net, 483500),
]

vacancy = [r2(-UNITS * (1 - occ) * 1487.5 * 0.42) for occ in occupancy]
concessions = [r2(-rng.uniform(6200, 9800)) for _ in range(12)]
collections = [r2(rng.uniform(-3400, 900)) for _ in range(12)]
capex = [r2(rng.uniform(900, 26500)) for _ in range(12)]
details = [
    (13, "5110 Loss to Vacancy", vacancy, -112000),
    (20, "5180 Total Loss to Concessions", concessions, -88000),
    (56, "5390 Total Loss to Collections", collections, -16500),
    (120, "6290 Total Vendor Services", vendors, 171000),
    (150, "6490 Total Utility Expense", utilities, 199500),
    (182, "6790 Total Payroll & Labor Expense", payroll, 348000),
    (190, "8190 Total Depreciation & Amortization", depreciation, 972500),
    (194, "8290 Total Mortgage & Debt Expense", debt, 1397900),
    (240, "9590 Total Capital Expenditures", capex, 140000),
]

leasing = [
    ("New Calls", [34, 29, 38, 41, 33, 37, 30, 35, 28, 31, 26, 23]),
    ("Follow Up Calls", [12, 9, 14, 18, 15, 21, 19, 22, 17, 20, 16, 18]),
    ("New Emails", [22, 19, 24, 27, 25, 21, 18, 20, 23, 17, 14, 15]),
    ("Follow Up Emails", [18, 22, 26, 31, 37, 42, 46, 51, 55, 61, 66, 72]),
    ("New Texts", [3, 2, 4, 5, 3, 4, 6, 5, 4, 3, 2, 3]),
    ("Follow Up Texts", [312, 284, 335, 361, 298, 342, 377, 395, 366, 404, 431, 458]),
    ("Submitted Guest Cards", [0] * 12),
    ("Submitted Applications", [11, 9, 13, 14, 12, 15, 13, 16, 12, 14, 11, 11]),
    ("Walk Ins", [26, 21, 29, 33, 30, 34, 27, 31, 25, 24, 19, 17]),
    ("Converted To Visits", [21, 19, 24, 27, 26, 30, 29, 33, 31, 34, 32, 35]),
    ("Return Visits", [2, 1, 3, 2, 4, 5, 3, 4, 2, 3, 2, 1]),
    ("Total Prospects", [79, 71, 88, 96, 87, 94, 85, 92, 83, 86, 74, 72]),
    ("Rejected Applications", [2, 1, 3, 1, 2, 2, 1, 3, 1, 2, 1, 1]),
]


def build(path):
    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws["B2"] = f"Property: Linden Park ({UNITS} Units)"
    ws["B3"] = "Fictional property. Synthetic data for a portfolio demonstration."
    for m in range(12):
        ws.cell(row=5, column=7 + m, value=datetime(YEAR, m + 1, 1))
    ws.cell(row=5, column=20, value="REVISED TOTAL")
    ws.cell(row=5, column=22, value="ORIGINAL BUDGET")

    def put_months(row, values, total_col=20, total=None):
        for m, v in enumerate(values):
            ws.cell(row=row, column=7 + m, value=v)
        ws.cell(row=row, column=total_col, value=r2(sum(values)) if total is None else total)

    for label, row, months, detail_row, detail, budget in finance:
        ws.cell(row=row, column=3, value=label)
        put_months(row, months)
        ws.cell(row=row, column=22, value=budget)
        ws.cell(row=detail_row, column=3, value="Total " + label.title())
        put_months(detail_row, detail)
    for row, label, values, budget in details:
        ws.cell(row=row, column=3, value=label)
        put_months(row, values)
        ws.cell(row=row, column=22, value=budget)
    ws.cell(row=262, column=3, value="Occupancy")
    put_months(262, occupancy, total=None)
    ws.cell(row=266, column=6, value="Leasing activity")
    for offset, (label, values) in enumerate(leasing):
        row = 267 + offset
        ws.cell(row=row, column=6, value=label)
        put_months(row, values, total_col=19, total=sum(values))
    wb.save(path)
    print(f"Saved {path.resolve()}")


if __name__ == "__main__":
    build(Path(__file__).with_name("linden-park-synthetic-workbook.xlsx"))
