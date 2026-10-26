---
name: Hawaiʻi Relief Map
description: A plain-language disaster relief map that asks two questions and returns one clear starting action.
colors:
  atlas-paper: '#f7f4ef'
  elevated-paper: '#fcfbf8'
  surface-white: '#ffffff'
  surface-soft: '#f5f5f5'
  map-water: '#abd2de'
  gridline: '#dedede'
  gridline-strong: '#919191'
  graphite: '#242424'
  graphite-muted: '#5c5c5c'
  deep-rose: '#b11f4b'
  deep-rose-hover: '#9a1a41'
  accent-foreground: '#ffffff'
  resource-green: '#16a34a'
  hazard-red: '#dc2626'
  needs-amber: '#f59e0b'
  map-link-blue: '#0078d4'
  midnight-canvas: '#3d3b3a'
  midnight-surface: '#292929'
  midnight-map-water: '#263f48'
  midnight-text: '#dedede'
  midnight-muted: '#919191'
  midnight-rose: '#fd8ea1'
typography:
  question:
    fontFamily: 'Segoe UI, Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: '30px'
    fontWeight: 650
    lineHeight: 0.98
    letterSpacing: '-0.04em'
  question-mobile:
    fontFamily: 'Segoe UI, Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: '24px'
    fontWeight: 650
    lineHeight: 1
    letterSpacing: '-0.035em'
  question-compact:
    fontFamily: 'Segoe UI, Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: '23px'
    fontWeight: 650
    lineHeight: 1
    letterSpacing: '-0.035em'
  answer:
    fontFamily: 'Segoe UI, Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: '22px'
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: '-0.035em'
  area:
    fontFamily: 'Segoe UI, Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: '19px'
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: '-0.025em'
  metric:
    fontFamily: 'Segoe UI, Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: '18px'
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: '-0.025em'
  fact:
    fontFamily: 'Segoe UI, Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: '16px'
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: 'normal'
  brand:
    fontFamily: 'Segoe UI, Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: '14px'
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: '-0.015em'
  sheet-title:
    fontFamily: 'Segoe UI, Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: '13px'
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 'normal'
  section:
    fontFamily: 'Segoe UI, Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: '12px'
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: '-0.01em'
  body:
    fontFamily: 'Segoe UI, Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1.48
    letterSpacing: 'normal'
  control:
    fontFamily: 'Segoe UI, Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: '12px'
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: 'normal'
  label:
    fontFamily: 'Segoe UI, Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: '11px'
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 'normal'
  micro:
    fontFamily: 'Segoe UI, Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: '10px'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '0.02em'
rounded:
  control: '0.625rem'
  instrument: '16px'
  pill: '999px'
  circle: '50%'
spacing:
  tight: '4px'
  control: '8px'
  cluster: '12px'
  instrument: '16px'
  stage: '22px'
components:
  emergency-choice:
    backgroundColor: '{colors.surface-soft}'
    activeBackgroundColor: '{colors.deep-rose}'
    rounded: '{rounded.control}'
    height: '58px'
  location-field:
    backgroundColor: '{colors.surface-white}'
    textColor: '{colors.graphite}'
    rounded: '{rounded.control}'
    height: '44px'
  relief-action:
    backgroundColor: '{colors.deep-rose}'
    textColor: '{colors.accent-foreground}'
    rounded: '{rounded.control}'
    height: '44px'
  floating-instrument:
    backgroundColor: '{colors.surface-white}'
    textColor: '{colors.graphite}'
    rounded: '{rounded.instrument}'
    border: '1px solid {colors.gridline}'
---

# Design System: Hawaiʻi Relief Map

## Creative North Star

**Choose, Understand, Confirm, Act**

The interface is designed for someone who may be stressed, unfamiliar with software, or using a phone in the field. It asks only what is necessary:

1. What is happening?
2. Where are you helping?
3. What needs to be confirmed?
4. What should you do first?

Everything else is progressive disclosure. Severity, planning layers, relative need scoring, source dates, and generated-model details remain available, but they never compete with the primary task.

## Core Purpose

Help a relief worker find a practical starting point in seconds. The first screen must communicate:

- the selected emergency,
- the named active event, arrival window, trend, confidence, and severity,
- the selected place,
- how many people may be affected,
- the two most likely support needs,
- which shelters, transport teams, and routes need confirmation,
- and the first coordinated action.

For residents, the first action is **Plan route from my home**. The resident route must answer:

- what may happen nearby,
- whether to stay, leave, or seek powered shelter,
- where shelter, food and water, medical power, and accessible pickup are,
- which road-level practice route reaches the selected resource,
- which flood zones, low streets, and traffic hazards to avoid,
- and how the route changes without a car, with mobility needs, or with a preferred language.

## Information Architecture

### Primary Surface

The fixed map canvas contains two instruments and a compact layer key:

- **Question instrument:** one island context and one recognizable response-zone selector.
- **Active-event instrument:** named incoming events with watch/warning status, trend, severity, and forecast timing. Generic hazard controls remain secondary for practice scenarios.
- **Answer instrument:** one plain-language priority followed by numbered **People**, **Resources**, and **Coordinated action** sections.
- **Neighborhood instrument:** recognizable neighborhood tabs with a shelter decision, trigger, owner, communication pathway, nearest practice resources, access routes, traffic hazards, AFN actions, and evidence status.
- **Resident route sheet:** address/current-location entry, access needs, language preference, nearby risk summary, destination tabs, road-level route steps, mapped avoid zones, read-aloud directions, and an explicit practice-data warning.
- **Route geometry:** driving lines follow the street network. Transit itineraries render walking legs as dashed warning lines, the bus segment as a solid link-colored line, and named boarding and exit stops.
- **Transit evidence:** schedule-based guidance names the route, headsign, stops, feed validity window, and the absence of confirmed realtime or disaster-detour data.
- **Map key:** the selected emergency exposure plus optional People, Resources, and Transport needs overlays.

No chart, acronym, model name, or advanced setting appears on the main surface.

### Relief Steps

The Relief Steps sheet repeats the People → Resources → Coordinated action sequence, exposes the complete local resource inventory, and shares confirmation state with the map and desktop summary. Each resource can be inspected for capacity and capabilities, confirmed, and completed without recycling an already-confirmed item.

It then offers one action: **Create relief checklist**. The generated checklist uses plain language, names a responsible team, and gives a timing cue at a readable operational-text size.

The sheet also exposes an honest five-part challenge-readiness assessment: accuracy/actionability, usability, privacy, equity, and feasibility. The relative-needs chart and source list remain hidden inside **Why am I seeing these recommendations?**

### Map Details

Optional scenario severity and map layers live inside **Change map details**. These controls remain accessible without implying that a user must understand or configure them.

## Plain-Language Rules

- Say “people who may be affected,” not “exposed population.”
- Say “places to confirm locally,” not “validation count.”
- Say “relief checklist,” not “Luna planning brief.”
- Say “needs considered,” not “CMIST planning signals.”
- Say “practice data,” not “synthetic scenario.”
- Say “change map details,” not “scenario builder.”
- Use “may” and “confirm locally” wherever evidence is estimated.

## Layout

### Desktop

- The 64px header contains only identity, practice-data status, and theme.
- The map occupies the remaining viewport and never causes body scrolling.
- The question instrument anchors the upper-left.
- The answer instrument anchors the upper-right.
- The island chain remains visible between them.
- Advanced surfaces open as bounded side sheets.

### Mobile and Narrow Panels

- The header compresses to 58px.
- The selected place and emergency appear in a compact top control; the full question instrument expands only when the user chooses to change them.
- The answer becomes a single tappable result row above the bottom controls.
- Three bottom actions remain: **My route**, **Relief plan**, and **Map**.
- Sheets rise from the bottom, use a 14px functional-text baseline, and scroll internally.

## Visual Hierarchy

There are three dominant information levels:

1. The location and emergency.
2. People, resources/gaps, and first coordinated action.
3. The full relief checklist and resource inventory.

Deep Rose marks the selected emergency and primary actions. Operational details such as capacity, status, owner, timing, and route state remain readable rather than being treated as microcopy.

## Interaction Rules

- Use smart defaults so the screen already returns a useful answer.
- Keep named active events visible; do not hide them in a menu.
- Show only one island at a time. Never ask a resident to interpret a statewide field of unrelated markers.
- Let users switch among available islands, but hide unvalidated exposure geometry and label regional coverage as pending rather than implying local precision.
- Divide each island into response zones people recognize, using official planning regions for the island-scale structure and neighborhood-board geography for local boundaries.
- Treat ZIP codes as optional lookup helpers only; never use a ZIP as the response-plan boundary.
- Label response-zone boundaries and surrounding-area estimates honestly while official emergency-management validation is pending.
- Give primary controls at least 44px of height.
- Use native visible checkboxes for access needs; never hide the real control under a decorative icon.
- Keep shelter, food and water, medical power, and no-car pickup as directly selectable destinations.
- Preserve the selected route, home marker, destination marker, and flood-avoidance polygon on the map.
- Put official evacuation status and official open-shelter status immediately after location entry, before optional access preferences or destination tabs.
- Render official tsunami evacuation geometry as its own labeled map layer; never reuse a synthetic flood polygon as an official evacuation boundary.
- Distinguish standard tsunami evacuation zones, extreme tsunami evacuation zones, and tsunami safe zones in both copy and color.
- Let the selected active event control the official risk answer: hurricane and flood show FEMA flood classification and boundaries; tsunami shows the official evacuation classification; wildfire shows the DLNR community fire-risk classification.
- Never show an unrelated official hazard card or polygon merely because its source is available.
- Show one full-width event-risk card followed by the official shelter card so the resident does not have to compare unrelated hazards.
- Treat the wildfire layer as planning susceptibility, not a live incident perimeter; current evacuation warnings and road closures always supersede it.
- Describe Zone D as undetermined risk and Zone X as outside mapped high risk, never as safe or no-risk.
- Label the 3.2 ft sea-level-rise coastal flood layer as a long-range planning scenario, not an incident forecast.
- If the official open-shelter feed returns no Hawaiʻi sites, state that no open shelter is currently reported and label every remaining destination as a practice route only.
- If an official source fails, show an unavailable state and require confirmation; never translate source failure into outside-zone or shelter-available language.
- If a requested language is not listed at the destination, say that an interpreter must be confirmed rather than implying support.
- Never require chart interpretation to get relief steps.
- Keep one selected hazard exposure layer visible and clearly label it as practice data.
- Use the event pattern to adjust affected population, needs, resource pressure, public guidance, and the first coordinated action. A storm track alone is never the boundary of risk.
- Every neighborhood recommendation must show who owns the decision, what triggers it, how partners and the public receive it, which AFN and LEP actions are required, and whether the evidence is practice-only or locally validated.
- Group nearby resource markers, then open the complete selectable inventory for resource-specific details.
- Share resource confirmation state across the map, primary summary, and relief sheet; end with an explicit all-confirmed state.
- Never label an unconfirmed route as clear, including fallback route data.
- Keep technical evidence available in one expandable disclosure.
- Confirm local conditions before presenting estimated output as actionable fact.

## Removed Complexity

The main surface no longer shows:

- ESF-6 terminology
- severity numbers
- active-layer counts
- readiness percentages
- CMIST terminology or chart
- source identifiers
- model branding
- duplicated metric strips or anonymous resource totals without inspectable facilities

These were removed from the first view because they slowed the user’s path to a relief action. Necessary settings and evidence remain available through **Map details** and **Why am I seeing these recommendations?**

## Motion

- Marker response: `160ms ease-out`.
- Sheet entry: `340ms cubic-bezier(0.16, 1, 0.3, 1)`.
- Checklist reveal: `380ms cubic-bezier(0.16, 1, 0.3, 1)`.
- Loading spin: `900ms linear`.
- Reduced-motion mode collapses nonessential durations.

## Do

- Make the next action obvious.
- Use familiar words and native controls.
- Preserve uncertainty and local-confirmation language.
- Keep the map visible throughout the task.
- Test the narrow Copilot side panel as a first-class mobile layout.

## Do Not

- Put jargon on the first screen.
- Require users to understand disaster-planning frameworks.
- Show charts before recommendations.
- Present an estimate as confirmed field information.
- Add more choices when a safe default can answer the question.
- Reintroduce dashboard rails, metric grids, or body scrolling.
