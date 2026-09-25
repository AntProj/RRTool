import { createContext, useContext } from 'react'
import type { Core } from '../data'

export const CoreContext = createContext<Core | null>(null)

export function useCore(): Core {
  const c = useContext(CoreContext)
  if (!c) throw new Error('core data not loaded')
  return c
}
