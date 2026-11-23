# Multifamily Leasing Operations Dashboard and AI Follow-Up (demo build)

An Upwork portfolio demo by AI Ops Expert. It is a working demo of one workflow on a fictional property with synthetic data. It is not a live app or a pilot, and it connects to nothing outside the browser.

## Open it
Double-click `demo/linden-park-leasing-ops-demo.html`. It runs in Chrome or Edge with no server, setup, or internet connection.

## What's here
| Path | What it is |
|---|---|
| `demo/linden-park-leasing-ops-demo.html` | The demo (one file) |
| `demo-data/` | Synthetic workbook, the script that makes it, and `SOURCE.md` |
| `tools/refresh.py` | Loads a workbook with this layout into the demo |
| `tools/done-check.cjs` | 12-line pass/fail browser check that also takes the portfolio screenshots |

## Rebuild
```
python demo-data/make_synthetic_workbook.py
python tools/refresh.py demo-data/linden-park-synthetic-workbook.xlsx --note "Fictional property · synthetic data"
node tools/done-check.cjs demo/linden-park-leasing-ops-demo.html <output folder>
```
The check needs the `playwright` npm package and a local Chrome install.

## Simulated, not connected
Rent Manager (the property system), Claude (drafting), Make (routing), and the email and SMS senders are all simulated in the browser.
