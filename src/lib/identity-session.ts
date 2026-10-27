import { useEffect, useState } from 'react'

import { backendGet } from './backend-api'

export type IdentitySession = {
  schema_version: 'identity-session.v1'
  auth_mode: 'disabled' | 'oidc'
  state: 'anonymous' | 'authenticated'
  configuration_status: 'disabled' | 'configured' | 'unavailable'
  collaboration_write: 'unavailable' | 'denied' | 'available'
  collaboration_read: 'unavailable' | 'denied' | 'available'
  collaboration_approve: 'unavailable' | 'denied' | 'available'
  roles: Array<'viewer' | 'plan_editor' | 'plan_approver'>
  capabilities: Array<
    'collaboration:read' | 'collaboration:write' | 'collaboration:approve'
  >
}

export type IdentitySessionState =
  | { status: 'loading'; session: null }
  | { status: 'ready'; session: IdentitySession }
  | { status: 'error'; session: null }

export function useIdentitySession(): IdentitySessionState {
  const [state, setState] = useState<IdentitySessionState>({
    status: 'loading',
    session: null,
  })

  useEffect(() => {
    let active = true
    void backendGet<IdentitySession>('/api/v1/identity/session')
      .then((session) => {
        if (active) setState({ status: 'ready', session })
      })
      .catch(() => {
        if (active) setState({ status: 'error', session: null })
      })
    return () => {
      active = false
    }
  }, [])

  return state
}
