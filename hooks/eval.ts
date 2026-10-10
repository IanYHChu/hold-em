// The best five of five to seven cards, as one number that compares: the category in the high
// bits (0 high card .. 8 straight flush), then five ranks, four bits each, that break ties.
import type { Card } from '../types'
import { RANKS, SUITS } from './cards'

const CATEGORIES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush']
const NAMES = ['', '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace']
const PLURALS = ['', '', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces']

const score = (category: number, ranks: readonly number[]) => {
  let n = category
  for (let i = 0; i < 5; i++) n = n * 16 + (ranks[i] ?? 0)
  return n
}

// the high card of the best five in a row in a mask of ranks (bit r for rank r), the ace low too
function straightHigh(mask: number): number {
  const m = mask & (1 << 14) ? mask | 2 : mask
  for (let hi = 14; hi >= 5; hi--) if (((m >> (hi - 4)) & 31) === 31) return hi
  return 0
}

// the ranks in a mask, highest first
function ranksIn(mask: number): number[] {
  const out: number[] = []
  for (let r = 14; r >= 2; r--) if (mask & (1 << r)) out.push(r)
  return out
}

export function rank(cards: readonly Card[]): number {
  const counts = new Array<number>(15).fill(0)
  const suits = [0, 0, 0, 0]
  let all = 0
  for (const c of cards) {
    const r = RANKS.indexOf(c[0]!) + 2
    counts[r]!++
    suits[SUITS.indexOf(c[1]!)]! |= 1 << r
    all |= 1 << r
  }
  // five or more of one suit: one suit at most, in seven cards
  const flush = suits.find(m => ranksIn(m).length >= 5) ?? 0
  if (flush) {
    const high = straightHigh(flush)
    if (high) return score(8, [high])
  }
  const quads: number[] = []
  const trips: number[] = []
  const pairs: number[] = []
  for (let r = 14; r >= 2; r--) {
    if (counts[r] === 4) quads.push(r)
    else if (counts[r] === 3) trips.push(r)
    else if (counts[r] === 2) pairs.push(r)
  }
  const kickers = (...not: number[]) => ranksIn(all).filter(r => !not.includes(r))
  if (quads.length) return score(7, [quads[0]!, kickers(quads[0]!)[0]!])
  if (trips.length && (trips.length > 1 || pairs.length)) return score(6, [trips[0]!, Math.max(trips[1] ?? 0, pairs[0] ?? 0)])
  if (flush) return score(5, ranksIn(flush))
  const high = straightHigh(all)
  if (high) return score(4, [high])
  if (trips.length) return score(3, [trips[0]!, ...kickers(trips[0]!).slice(0, 2)])
  if (pairs.length > 1) return score(2, [pairs[0]!, pairs[1]!, kickers(pairs[0]!, pairs[1]!)[0]!])
  if (pairs.length) return score(1, [pairs[0]!, ...kickers(pairs[0]!).slice(0, 3)])
  return score(0, ranksIn(all))
}

export const category = (n: number) => Math.floor(n / 16 ** 5)
const rankAt = (n: number, i: number) => Math.floor(n / 16 ** (4 - i)) % 16

// Two pair, Kings and Sevens
export function handName(n: number): string {
  const c = category(n)
  const [a, b] = [rankAt(n, 0), rankAt(n, 1)]
  switch (c) {
    case 0: return `${NAMES[a]} high`
    case 1: return `Pair of ${PLURALS[a]}`
    case 2: return `Two pair, ${PLURALS[a]} and ${PLURALS[b]}`
    case 3: return `Three ${PLURALS[a]}`
    case 4: return `Straight, ${NAMES[a]} high`
    case 5: return `Flush, ${NAMES[a]} high`
    case 6: return `Full house, ${PLURALS[a]} over ${PLURALS[b]}`
    case 7: return `Four ${PLURALS[a]}`
    default: return a === 14 ? 'Royal flush' : `Straight flush, ${NAMES[a]} high`
  }
}

export const categoryName = (n: number) => CATEGORIES[category(n)]!
