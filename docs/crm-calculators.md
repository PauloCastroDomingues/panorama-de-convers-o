# CRM simulators

Read-only product integration. Simulations never enter SSOT totals, filters,
comparisons or source-refresh snapshots. Per-channel drafts live in browser
localStorage only. Exported CSVs are explicitly marked as simulations.

Reference inspected on 2026-11-04:
https://docs.google.com/spreadsheets/d/1NDwaGqsdCrOi5Qbo2PwduSveVVGc9BHqvFIvpLMHqJ0/edit

Defaults use column B in E-mail (858609064), WhatsApp (1202670752),
and Grupos Vip's (1383956793). The WhatsApp visual has conflicting inputs;
those visual values are deliberately not used. All defaults are manual
historical assumptions, not a live benchmark or current data.

The original model equates clicks with sessions. The simulator splits both
stages and exposes a session-generation rate, initially 100% to reproduce
the reference, with an always-visible caveat. Missing required inputs yield
null downstream, real zero remains zero, and ROAS needs positive investment.
Calculations retain fractional expected orders rather than rounding early.

Formula parity: B4/B6/B8/B10/B12/B14 drive sends, deliveries, openings,
sessions, orders and revenue. WhatsApp B16 drives ROAS; its D1 ratio is
displayed as orders / contact base, not unique-buyer conversion. C5/C7/C9/C11
are calculated as 100% minus each stage rate, with the same complement for
the additional session-generation stage. All outputs and CSV values use
the same calculation result and recalculate on each premise edit.

The visible calculation table preserves the reference sequence (metric,
data, loss), interleaving editable premises with read-only computed outputs.
All three channels show base, frequency, sends, delivery rate/deliveries,
opening rate/openings, click rate, clicks, session-generation rate/sessions,
conversion/orders, ticket/revenue, investment/ROAS and orders per base.
Clicks and session-generation remain explicit to avoid presenting the
spreadsheet's 1:1 assumption as measured SSOT sessions. Fractional expected
orders are displayed with two decimals; no rounding enters revenue formulas.

The simulation composition places monthly results above the calculation
workspace. The complete table is grouped into reach, engagement and commercial
results. The compact funnel remains visible beside the table on taller desktop
viewports; mobile stacks the same content without dropping metrics.

Run `node scripts/test_crm_calculator.cjs` for model reconciliation.
Run `node scripts/check_crm_calculator_ui.cjs` against localhost:8025 for
responsive UI, isolation, validation, storage, export and navigation checks.
