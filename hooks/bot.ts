// The bots: each weighs its cards by playing the hand out at random against the players still in
// (its equity), then sets that against the price of staying in. Each has a style: how much better
// than its fair share a hand must be before it plays (tight), and how often it bets rather than
// calls (aggro). Short stacks, ten big blinds or less, push or fold.
import type { Action, Card, Table } from '../types'
import { DECK } from './cards'
import { rank } from './eval'

export const BOTS = [
  { name: 'Ada', tight: 1.0, aggro: 0.5 },
  { name: 'Bo', tight: 0.8, aggro: 0.7 },
  { name: 'Cy', tight: 1.25, aggro: 0.3 },
  { name: 'Dee', tight: 0.85, aggro: 0.2 },
  { name: 'Eli', tight: 1.1, aggro: 0.8 },
] as const

// boards played out per decision
const TRIALS = 150

// the share of the pot `hole` wins against `opponents` random hands, the board dealt out at random
export function equity(hole: readonly Card[], board: readonly Card[], opponents: number, rand: () => number, trials = TRIALS): number {
  if (opponents === 0) return 1
  const known = new Set([...hole, ...board])
  const rest = DECK.filter(c => !known.has(c))
  const need = 5 - board.length + opponents * 2
  let won = 0
  for (let n = 0; n < trials; n++) {
    // the first `need` cards of a partial shuffle
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rand() * (rest.length - i))
      ;[rest[i], rest[j]] = [rest[j]!, rest[i]!]
    }
    const full = [...board, ...rest.slice(0, 5 - board.length)]
    const mine = rank([...hole, ...full])
    let best = 0
    let ties = 0
    for (let k = 0; k < opponents; k++) {
      const at = 5 - board.length + k * 2
      const theirs = rank([rest[at]!, rest[at + 1]!, ...full])
      if (theirs > best) [best, ties] = [theirs, 0]
      if (theirs === best) ties++
    }
    if (mine > best) won += 1
    else if (mine === best) won += 1 / (ties + 1)
  }
  return won / trials
}

// what the bot in `seat` does, its turn come; `bb` is the big blind
export function decide(t: Table, seat: number, bb: number, rand: () => number): Action {
  const { tight, aggro } = BOTS[seat - 1] ?? BOTS[0]
  const p = t.players[seat]!
  const live = t.players.filter(q => q.hole.length && !q.folded)
  const opponents = live.length - 1
  const eq = equity(p.hole, t.board, opponents, rand)
  // against its fair share: 1 is an average hand at this table
  const share = eq * (opponents + 1)
  const toCall = t.currentBet - p.bet
  const pot = t.players.reduce((n, q) => n + q.committed, 0)
  const all = p.bet + p.stack
  // someone left to bet against
  const canRaise = p.stack > toCall && live.some(q => q !== p && !q.allIn)
  const raiseTo = (f: number) => {
    const by = Math.max(t.minRaise, Math.round((f * (pot + toCall)) / bb) * bb)
    return Math.min(all, t.currentBet + by)
  }
  const call: Action = toCall ? { kind: 'call' } : { kind: 'check' }

  if (all <= bb * 10 && t.street === 'preflop') {
    if (share > 1.15 * tight && canRaise) return { kind: 'raise', to: all }
    return toCall === 0 || share > 1.15 * tight ? call : { kind: 'fold' }
  }
  if (toCall === 0) {
    const value = share > 1.35 * tight && rand() < 0.4 + aggro * 0.6
    if (canRaise && (value || rand() < aggro * 0.08)) return { kind: 'raise', to: raiseTo(0.5 + rand() * 0.4) }
    return call
  }
  if (canRaise && share > 1.7 * tight && rand() < aggro + 0.15) return { kind: 'raise', to: raiseTo(0.6 + rand() * 0.5) }
  // the price of a call, as a share of the pot after it
  const odds = toCall / (pot + toCall)
  // a bet says the bettor holds better than a random hand: the bigger the bet, the more it says
  const facing = eq ** (1 + (2 * toCall) / pot)
  if (facing >= odds * tight) return call
  if (canRaise && rand() < aggro * 0.03) return { kind: 'raise', to: raiseTo(0.75) }
  return { kind: 'fold' }
}
