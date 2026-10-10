// The deck: 52 cards, a seeded shuffle, and how a card is drawn.
import type { Card } from '../types'

export const RANKS = '23456789TJQKA'
export const SUITS = 'shdc'
const SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }

export const DECK: readonly Card[] = [...RANKS].flatMap(r => [...SUITS].map(s => `${r}${s}`))

// 2-14, the ace high
export const rankOf = (c: Card) => RANKS.indexOf(c[0]!) + 2

// A♠ 10♥, or with `letters` the code itself (As Th), for a terminal that draws the suits two cells wide
export const label = (c: Card, letters = false) => (letters ? c : `${c[0] === 'T' ? '10' : c[0]}${SYMBOL[c[1]!]}`)

// hearts and diamonds red, spades and clubs in the terminal's own color
export const color = (c: Card) => (c[1] === 'h' || c[1] === 'd' ? 'red' : undefined)

// a small seeded generator, so a test can deal the same hand twice
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// a seed for the next draw, taken from the generator
export const reseed = (rand: () => number) => Math.floor(rand() * 4294967296) >>> 0

export function shuffled(cards: readonly Card[], rand: () => number): Card[] {
  const deck = [...cards]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck
}

// 1,500
export const chips = (n: number) => `${n}`.replace(/\B(?=(\d{3})+$)/g, ',')
