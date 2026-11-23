# Multifamily Leasing Operations Dashboard and AI Follow-Up (Real-work build)

An Upwork portfolio build by AI Ops Expert. The dashboard runs on **a real property's 2025 leasing and occupancy records, with the name removed**. The follow-up lab is a **simulation** with four fictional prospects. Nothing here is connected to an outside system, and it is not a live app or a pilot.

## Open it
Double-click `demo/leasing-ops-dashboard.html`. It runs in Chrome or Edge with no server, setup, or internet connection.

## What the data is
Real 2025 records from one property: the monthly occupancy rate and 13 leasing box-score counts, January to December, all measured. No financial data, no property name. See `data/SOURCE.md`.

The dashboard shows measured trends only. It does not claim that any follow-up process caused a change, or that it saved time or money.

## What's here
| Path | What it is |
|---|---|
| `demo/leasing-ops-dashboard.html` | The dashboard (one file) |
| `data/` | The public 2025 leasing extract and `SOURCE.md` |
| `tools/extract_public_workbook.py` | Copies only the 14 public rows out of a property workbook, and stops if anything else would be written |
| `tools/refresh.py` | Loads the public extract into the dashboard |
| `tools/done-check.cjs` | 12-line pass/fail browser check that also takes the portfolio screenshots |

## Rebuild
```
python tools/extract_public_workbook.py <property workbook.xlsx> --block-file <names to refuse.txt>
python tools/refresh.py data/leasing-2025-public.xlsx --note "Leasing and occupancy only · financials not included"
node tools/done-check.cjs demo/leasing-ops-dashboard.html <output folder>
```
The extractor reads a workbook in one specific layout. The check needs the `playwright` npm package and a local Chrome install.

## Simulated, not connected
Rent Manager (the property system), Claude (drafting), Make (routing), and the email and SMS senders are all simulated in the browser.
