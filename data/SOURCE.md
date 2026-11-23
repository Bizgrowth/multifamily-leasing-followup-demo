# Data sources

Three public data files feed the dashboard. None names the property, an owner, a manager, or a lender.

## 2025 records: `leasing-2025-public.xlsx`
**Real 2025 records from one property, with the name removed.** It holds leasing and occupancy only.

| Item | What it is |
|---|---|
| Property | "324-Unit Multifamily Community". No name, address, owner, manager, or lender appears in the file. |
| Rows included | The monthly **Occupancy** row and 14 box score rows: New Calls, Follow Up Calls, New Emails, Follow Up Emails, New Texts, Follow Up Texts, Submitted Guest Cards, Submitted Applications, Walk Ins, Converted To Visits, Return Visits, Total Prospects, Rejected Applications, and Converted To Leases. Each has its Total. |
| Period | January to December 2025. All 12 months are actuals (measured), not budgets or projections. |
| Left out | Every other row in the source workbook, including all financial statement rows. |
| Not in the file | The original workbook, its file name, and its author details. |

### Where each row comes from
- **Submitted Guest Cards, Submitted Applications, and Converted To Leases** come from a separate property-system report pulled in Nov 2026: `leasing-2025-system-pull.csv`. They replace the workbook's own guest card and application rows, and add the lease row. The totals are 319 guest cards, 232 applications, and 204 leases.
- **Every other row** (occupancy and the other 11 box score rows) comes from the 2025 workbook as recorded.

`tools/extract_public_workbook.py` reads the workbook and the system-pull CSV, copies only these 15 rows, and writes the xlsx. It stops with an error if any other row, a blocked name, an email, a phone number, or a web link would be written, if a CSV Total does not equal the sum of its 12 months, or if a number fails to round-trip. It then re-reads the saved file and checks every number against its inputs.

## 2026 model inputs: `ai-model-2026.json`
The inputs for the **Projected AI impact** tab: a 2026 pro forma by month, six best-in-class targets, nine driver assumptions, and the automation cards. **This is a projected model, not results.** The assumptions come from an industry benchmark model and were not measured at this property. The tab shows only the lift from each driver, the AI cost, ROI, and payback.

## What the numbers are and are not
The 2025 figures are measured counts and occupancy rates as recorded. Every 2026 figure is a model. The dashboard does not claim that any follow-up process caused a change, or that any of the 2026 figures were achieved.

The Follow-up lab prospects (DEMO-101 to DEMO-104) are fictional and live in the page, not in these files.
