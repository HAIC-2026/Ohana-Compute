import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import { BrowserTelemetry } from '../lib/browser-telemetry'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Hawaiʻi Mass Care Planner',
      },
      {
        name: 'description',
        content:
          'A privacy-safe emergency-planning map for identifying community needs, resource gaps, coordinated actions, and accessible resident guidance across Hawaiʻi.',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
  const param = new URLSearchParams(window.location.search).get("scoutTheme");
  const theme =
    param || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
})();`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        <BrowserTelemetry />
        <div
          hidden
          dangerouslySetInnerHTML={{
            __html: `<!--
THESIS: A statewide emergency atlas turns fragmented risk layers into one legible planning journey; it refuses the generic dashboard of interchangeable cards.
OWN-WORLD: State-charcoal and ʻĀina-teal civic surfaces, disciplined route lines, precise station-like controls, and semantic hazard colors reserved for operational meaning.
STORY: Start with a hazard, reveal communities under pressure, understand CMIST needs, then generate a grounded coordinated action brief.
FIRST VIEWPORT: A working island map owns the center, scenario layers run down the left, evidence and Luna interpretation run down the right, and the planning path stays visible above.
FORM: Emergency atlas fused with a transit diagram; assigned grounded direction five; staging follows the map's active planning corridor; seed bdea18ed.
-->`,
          }}
        />
        {children}

        <Scripts />
      </body>
    </html>
  )
}
