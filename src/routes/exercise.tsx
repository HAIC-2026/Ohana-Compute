import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/exercise')({
  beforeLoad: () => {
    throw redirect({ to: '/lifecycle', replace: true })
  },
})
