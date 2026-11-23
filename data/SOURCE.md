# Data source

`leasing-2025-public.xlsx` holds **real 2025 records from one property, with the name removed**. It is the leasing and occupancy section only.

| Item | What it is |
|---|---|
| Property | "324-Unit Multifamily Community". No name, address, owner, manager, or lender appears anywhere in the file. |
| Rows included | The monthly **Occupancy** row and the 13 **Box Score Stats** rows (New Calls, Follow Up Calls, New Emails, Follow Up Emails, New Texts, Follow Up Texts, Submitted Guest Cards, Submitted Applications, Walk Ins, Converted To Visits, Return Visits, Total Prospects, Rejected Applications), each with its Total. |
| Period | January to December 2025. All 12 months are actuals (measured), not budgets or projections. |
| Left out | Everything else in the source workbook: income, expenses, fees, payroll, taxes, depreciation, mortgage and lender lines, NOI, and net income. |
| Not in the file | The original workbook, its file name, and its author details. |

## How the file was made
`tools/extract_public_workbook.py` reads the property's workbook, copies only the 14 rows above, and writes this file. It stops with an error if any other row, a blocked name, an email, a phone number, or a web link would be written. It then re-reads the saved file and checks every number against the source.

## What the numbers are and are not
They are measured counts and occupancy rates as recorded for 2025. The dashboard reports trends only. It does not claim that any follow-up process caused a change, and it does not claim time or money saved.

The Follow-up lab prospects (DEMO-101 to DEMO-104) are fictional and live in the page, not in this file.
