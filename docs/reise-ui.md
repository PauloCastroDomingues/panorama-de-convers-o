# Reise UI

The shared theme is loaded after structural styles so Growth and CRM use the same
controls, typography and spacing. Analytical logic and source credentials are
unchanged. No external source writes or deployment are part of this revision.

Brand reference: local Debrief references `reise-cult-identidade-cultura-guias.md`
and `reise-cult-guia-identidade-visual-texto.md`, recorded on 2026-09-09.
The Second Brain MCP was not available in this session; its local reference
documents and the existing official logo/font assets were used instead.

- Pneu Dark #1D1D1B is the base; Apex #FB5D06 is reserved for selection and emphasis.
- Formula1 is retained for internal report headings; Aalto for interface labels.
- Tabular system numerals improve comparison in dense tables and KPI bands.
- Status colors retain meaning independently of the brand accent.
- Source freshness and coverage remain visible, including missing-source states.
- Navigation, filter drawers and controls share spacing and focus states.
- Wide tables scroll inside their container; product labels remain fixed on
  desktop and scroll on narrow screens to avoid obscuring metrics.
- Icon assets are from Lucide; their license is included in assets/icons/LICENSE.

Run `node scripts/check_reise_ui.cjs` with the local server on port 8021.
Set PANORAMA_URL to use a different local preview. Captures go to output/reise-ui.
The test checks 1920, 1440, 820, 390 and 320 pixel layouts, Growth and all CRM tabs,
matching commercial KPIs to the SSOT snapshot and preserving the four CRM views.

## Chart Interaction And Motion

- Funnel rates sit directly on the graphic, with no opaque label background.
- Chart values support hover, touch and keyboard focus; each chart has one Tab
  stop, with arrow keys and Home/End to inspect points. Escape dismisses the value.
- Current-period dates label the shared Growth axis; comparison tooltips retain
  their original dates. Series values and missing-data gaps are unchanged.
- Short, one-shot transitions use opacity and transforms, never animated values.
- Loading uses the official logo and an indeterminate activity line. It adds no
  completion delay and respects reduced-motion settings.
- Background refresh remains non-blocking, with a subtle status pulse.

Run `node scripts/check_chart_motion_ui.cjs` for loading, motion, keyboard,
touch and chart-label checks. Captures go to output/chart-motion.
