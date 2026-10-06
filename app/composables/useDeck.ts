export const DECKS = ['heart', 'spade', 'club', 'diamond'] as const
export type Deck = typeof DECKS[number]

export const DECK_STORAGE_KEY = 'joker-deck'

// Runs in <head> before first paint so a returning visitor never sees the
// Heart table flash before their own deck. Keep the key and names in sync.
export const DECK_HEAD_SCRIPT = `try{var d=localStorage.getItem('${DECK_STORAGE_KEY}');if(/^(${DECKS.join('|')})$/.test(d))document.documentElement.classList.add('pal-'+d)}catch(e){}`

function isDeck(value: unknown): value is Deck {
  return typeof value === 'string' && (DECKS as readonly string[]).includes(value)
}

export function useDeck() {
  // Heart is the first visit's deck, per the brand book.
  const deck = useState<Deck>('joker-deck', () => 'heart')

  function setDeck(next: Deck) {
    deck.value = next
    const root = document.documentElement
    for (const d of DECKS) root.classList.toggle(`pal-${d}`, d === next)
    try {
      localStorage.setItem(DECK_STORAGE_KEY, next)
    } catch {
      // storage blocked: the deck still applies for this visit
    }
  }

  // The head script already painted the right table; this just syncs the
  // picker's checked state after hydration.
  function restoreDeck() {
    try {
      const saved = localStorage.getItem(DECK_STORAGE_KEY)
      if (isDeck(saved)) deck.value = saved
    } catch {
      // ignore
    }
  }

  return { deck, setDeck, restoreDeck }
}
