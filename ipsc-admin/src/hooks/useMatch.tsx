import React, { createContext, useContext, useState } from 'react'
import type { Match } from '@/types'

interface MatchContextValue {
  currentMatch: Match | null
  setCurrentMatch: (match: Match | null) => void
}

const MatchContext = createContext<MatchContextValue>({
  currentMatch: null,
  setCurrentMatch: () => undefined,
})

export function MatchProvider({ children }: { children: React.ReactNode }) {
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null)
  return (
    <MatchContext.Provider value={{ currentMatch, setCurrentMatch }}>
      {children}
    </MatchContext.Provider>
  )
}

export function useMatch() {
  return useContext(MatchContext)
}
