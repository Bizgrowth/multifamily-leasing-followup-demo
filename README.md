# Multifamily Leasing Operations Dashboard and AI Follow-Up (Real-work build)

An Upwork portfolio build by AI Ops Expert. The dashboard runs on **a real property's 2025 leasing and occupancy records, with the name removed**. The follow-up lab is a **simulation** with four fictional prospects. Nothing here is connected to an outside system, and it is not a live app or a pilot.

## Open it
Double-click `demo/leasing-ops-dashboard.html`. It runs in Chrome or Edge with no server, setup, or internet connection.

## What the data is
Real 2025 records from one property: the monthly occupancy rate and 14 leasing box-score counts, January to December, all measured. Guest cards, applications and leases come from a separate property-system report pulled in Nov 2026. No financial statement data, no property name. See `data/SOURCE.md`.

The 2025 screens show measured trends only. They do not claim that any follow-up process caused a change, or that it saved time or money.

## Projected AI impact tab
A model, labeled **Projected model, not results**, on every screen it appears. It sets the 2025 measured figures beside a 2026 pro forma on the same 1,581 prospects, scores 2025 against best-in-class targets, and lets you edit nine benchmark assumptions to see the lift from each driver, the AI cost, ROI, and payback. The assumptions are from an industry benchmark model and were not measured at this property. Two automation workflows are shown as built and tested in n8n with test data, not live. Three more are designed only.

## What's here
| Path | What it is |
|---|---|
| `demo/leasing-ops-dashboard.html` | The dashboard (one file) |
| `data/` | The public 2025 leasing extract, the property-system CSV, the 2026 model inputs (`ai-model-2026.json`), and `SOURCE.md` |
| `tools/extract_public_workbook.py` | Copies only the 15 public rows out of a property workbook (applying the property-system CSV), and stops if anything else would be written |
| `tools/refresh.py` | Loads the public extract and the 2026 model inputs into the dashboard |
| `tools/done-check.cjs` | 17-line pass/fail browser check that also takes the portfolio screenshots |

## Rebuild
```
python tools/extract_public_workbook.py <property workbook.xlsx> --block-file <names to refuse.txt>
  (also reads data/leasing-2025-system-pull.csv)
python tools/refresh.py data/leasing-2025-public.xlsx --note "Leasing and occupancy only · financials not included"
node tools/done-check.cjs demo/leasing-ops-dashboard.html <output folder> --block-file <names to refuse.txt>
```
The extractor reads a workbook in one specific layout. The check needs the `playwright` npm package and a local Chrome install.

## Simulated, not connected
Rent Manager (the property system), Claude (drafting), Make (routing), and the email and SMS senders are all simulated in the browser. The planned production stack on the model tab (Claude API, n8n, Retell AI and Twilio, Cal.com, Supabase, Deepgram) is not connected to anything here.
