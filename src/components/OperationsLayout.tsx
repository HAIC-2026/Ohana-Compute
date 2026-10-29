import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export function OperationsLayout({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <main className="operations-page">
      <header className="operations-header">
        <a href="/">Hawaiʻi Mass Care Planner</a>
        <nav aria-label="Planning tools">
          <Link to="/offline">Offline planning</Link>
          <Link to="/source-health">Source health</Link>
          <Link to="/exercise">Exercise</Link>
        </nav>
      </header>
      <div className="operations-content">
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  )
}
