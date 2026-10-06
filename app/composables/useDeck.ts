// Brand book order: Spade, Club, Heart, Diamond
export const DECKS = ['spade', 'club', 'heart', 'diamond'] as const
export type Deck = typeof DECKS[number]

// One cookie shared by every tent on jok3r.win (the portfolio, tools., blog.)
// so a visitor's deck follows them between sites. Keep the name and domain
// in sync with the portfolio's usePalette.
export const DECK_COOKIE = 'joker-deck'
const SITE_DOMAIN = 'jok3r.win'
// Where this site kept the deck before the shared cookie; read to carry it over
const LEGACY_STORAGE_KEY = 'joker-deck'

// Runs in <head> before first paint so a returning visitor never sees the
// Heart table flash before their own deck. Keep the names in sync.
export const DECK_HEAD_SCRIPT = `try{var m=document.cookie.match(/(?:^|; )${DECK_COOKIE}=(\\w+)/),d=m?m[1]:localStorage.getItem('${LEGACY_STORAGE_KEY}');if(/^(${DECKS.join('|')})$/.test(d))document.documentElement.classList.add('pal-'+d)}catch(e){}`

function isDeck(value: unknown): value is Deck {
  return typeof value === 'string' && (DECKS as readonly string[]).includes(value)
}

function readCookie(): string | undefined {
  return document.cookie.match(new RegExp(`(?:^|; )${DECK_COOKIE}=(\\w+)`))?.[1]
}

// Site-wide on jok3r.win; host-only on localhost and preview deploys
function writeCookie(deck: Deck) {
  const host = location.hostname
  const domain = host === SITE_DOMAIN || host.endsWith(`.${SITE_DOMAIN}`) ? `; domain=.${SITE_DOMAIN}` : ''
  document.cookie = `${DECK_COOKIE}=${deck}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${domain}`
}

export function useDeck() {
  // Heart is the first visit's deck, per the brand book.
  const deck = useState<Deck>('joker-deck', () => 'heart')

  function setDeck(next: Deck) {
    deck.value = next
    const root = document.documentElement
    for (const d of DECKS) root.classList.toggle(`pal-${d}`, d === next)
    writeCookie(next)
  }

  // The head script already painted the right table; this just syncs the
  // picker's checked state after hydration, and moves an old localStorage
  // pick into the shared cookie.
  function restoreDeck() {
    const saved = readCookie()
    if (isDeck(saved)) {
      deck.value = saved
      return
    }
    try {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (isDeck(legacy)) setDeck(legacy)
    } catch {
      // storage blocked: stay on Heart
    }
  }

  return { deck, setDeck, restoreDeck }
}
