import { useEffect, useMemo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface PrintablePortalProps {
  children: ReactNode
}

export const PrintablePortal = ({ children }: PrintablePortalProps) => {
  const container = useMemo(() => {
    if (typeof document === 'undefined') return null
    const node = document.createElement('div')
    node.className = 'printable-portal'
    return node
  }, [])

  useEffect(() => {
    if (!container || typeof document === 'undefined') return
    document.body.appendChild(container)
    return () => {
      document.body.removeChild(container)
    }
  }, [container])

  if (!container) return null
  return createPortal(children, container)
}
