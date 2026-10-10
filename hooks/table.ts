// The table's moves, as pure functions over Table: a Sit & Go of six, you and five bots, each
// starting with the same stack, the blinds going up every few hands until one player holds every chip.
//
// A hand: the blinds, two cards each, then four streets of betting (preflop, the flop, the turn,
// the river). A street closes once everyone still able to bet has acted and matched the bet; the
// dealer then turns the next street over, on a beat of its own. A player who is all in bets no
// more, and wins only the pot its chips reached (side pots). Everything random follows from
// `seed`, so a table played twice from the same seed plays the same.
import type { Action, Player, Pot, Street, Table } from '../types'
import { BOTS, decide } from './bot'
import { DECK, reseed, rng, shuffled } from './cards'
import { handName, rank } from './eval'

export const YOU = 0
export const START_STACK = 1500
export const HANDS_PER_LEVEL = 6
// beats the banner stays up as a hand is dealt
export const DEAL_BEATS = 3
// small and big blind, a level every HANDS_PER_LEVEL hands; the last holds
export const BLINDS: readonly (readonly [number, number])[] = [
  [10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300],
  [200, 400], [300, 600], [400, 800], [600, 1200], [800, 1600], [1000, 2000],
]
const NEXT_STREET: Record<Street, Street> = { preflop: 'flop', flop: 'turn', turn: 'river', river: 'river' }
const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th']

export const level = (hand: number) => Math.min(BLINDS.length - 1, Math.floor((Math.max(hand, 1) - 1) / HANDS_PER_LEVEL))
export const blinds = (t: Pick<Table, 'hand'>) => BLINDS[level(t.hand)]!
// hands until the blinds go up, this one counted; 0 at the last level
export const handsToLevel = (hand: number) => (level(hand) === BLINDS.length - 1 ? 0 : HANDS_PER_LEVEL - ((hand - 1) % HANDS_PER_LEVEL))
export const ordinal = (n: number) => ORDINALS[n] ?? `${n}th`

export const pot = (t: Table) => t.players.reduce((n, p) => n + p.committed, 0)
const isLive = (p: Player) => p.hole.length > 0 && !p.folded
const canAct = (p: Player) => isLive(p) && !p.allIn
const needsAct = (t: Table) => (p: Player) => canAct(p) && (!p.acted || p.bet < t.currentBet)
export const who = (t: Table, seat: number) => (seat === YOU ? 'You' : t.players[seat]!.name)

// the first seat after `from`, going round, that `is` holds for
function after(t: Pick<Table, 'players'>, from: number, is: (p: Player) => boolean): number {
  const n = t.players.length
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n
    if (is(t.players[i]!)) return i
  }
  return -1
}

// a fresh Sit & Go, the button at a seat drawn from `seed`
export function newGame(seed: number): Table {
  const rand = rng(seed)
  const players: Player[] = ['You', ...BOTS.map(b => b.name)].map(name => ({
    name, stack: START_STACK, hole: [], bet: 0, committed: 0, folded: false, allIn: false, acted: false, last: '', place: 0,
  }))
  const button = Math.floor(rand() * players.length)
  // the first hand moves the button on by one
  const t: Table = {
    seed: reseed(rand), deck: [], board: [], players, street: 'preflop', button: (button + 5) % 6, turn: -1,
    currentBet: 0, minRaise: 0, size: 0, hand: 0, phase: 'ai', wait: 0, result: null, event: '', log: [],
  }
  return startHand(t)
}

// p puts in up to `amount`, all in once its stack runs out
function put(p: Player, amount: number) {
  const n = Math.min(amount, p.stack)
  p.stack -= n
  p.bet += n
  p.committed += n
  if (p.stack === 0) p.allIn = true
}

// the small and big blinds' seats, after the button among the players still in; heads up, the button
// posts the small blind
export function blindSeats(t: Pick<Table, 'players' | 'button'>): [number, number] {
  const isIn = (p: Player) => p.place === 0
  const sb = t.players.filter(isIn).length === 2 ? t.button : after(t, t.button, isIn)
  return [sb, after(t, sb, isIn)]
}

// the next hand: the button on to the next player still in, the cards, the blinds, and the banner up
export function startHand(t: Table): Table {
  const rand = rng(t.seed)
  const deck = shuffled(DECK, rand)
  const players = t.players.map(p => ({
    ...p, hole: p.place ? [] : [deck.pop()!, deck.pop()!], bet: 0, committed: 0, folded: false, allIn: false, acted: false, last: '',
  }))
  const s: Table = { ...t, seed: reseed(rand), deck, players, board: [], street: 'preflop', hand: t.hand + 1, result: null, size: 0 }
  const isIn = (p: Player) => p.place === 0
  s.button = after(s, t.button, isIn)
  const [sbSeat, bbSeat] = blindSeats(s)
  const [sb, bb] = blinds(s)
  put(players[sbSeat]!, sb)
  put(players[bbSeat]!, bb)
  players[sbSeat]!.last = `blind ${players[sbSeat]!.bet}`
  players[bbSeat]!.last = `blind ${players[bbSeat]!.bet}`
  s.currentBet = bb
  s.minRaise = bb
  s.log = [`Hand ${s.hand}, blinds ${sb}/${bb}: ${who(s, sbSeat)} ${sb}, ${who(s, bbSeat)} ${bb}`]
  // who busted on the last hand: dealt in, and out now
  const knocked = t.players.filter(p => p.hole.length && p.place).map(p => `${p.name} out in ${ordinal(p.place)}`)
  s.event = knocked.join(', ') || `Hand ${s.hand}`
  return { ...toAct(s, bbSeat), phase: 'deal', wait: DEAL_BEATS }
}

// the banner down: the first to act takes the turn
export const dealt = (t: Table): Table => (t.phase === 'deal' ? { ...t, wait: 0, phase: t.turn === YOU ? 'act' : 'ai' } : t)

// the turn passes on from `seat`: to the next who must act, or to the dealer once the street is closed
function toAct(t: Table, seat: number): Table {
  const live = t.players.filter(isLive)
  if (live.length === 1) return award(t)
  const turn = after(t, seat, needsAct(t))
  // nobody to act, or one left with nobody to bet against and nothing to call
  const actors = t.players.filter(canAct)
  const closed = turn < 0 || (actors.length === 1 && actors[0]!.bet >= t.currentBet)
  if (closed) return { ...t, turn: -1, phase: 'ai' }
  return { ...t, turn, phase: turn === YOU ? 'act' : 'ai', size: turn === YOU ? 0 : t.size }
}

// the move `seat` makes; one it may not make is taken as the nearest it may
export function act(t: Table, seat: number, a: Action): Table {
  if (t.turn !== seat || (t.phase !== 'act' && t.phase !== 'ai')) return t
  const players = t.players.map(p => ({ ...p }))
  const p = players[seat]!
  const s: Table = { ...t, players }
  const toCall = t.currentBet - p.bet
  const kind = a.kind === 'fold' && toCall === 0 ? 'check' : a.kind === 'check' && toCall > 0 ? 'call' : a.kind
  if (kind === 'fold') {
    p.folded = true
    p.last = 'fold'
  } else if (kind === 'check') {
    p.last = 'check'
  } else if (kind === 'call' || (a.to ?? 0) <= t.currentBet || p.stack <= toCall) {
    put(p, toCall)
    p.last = p.allIn ? `all-in ${p.bet}` : `call ${p.bet}`
  } else {
    const to = Math.min(p.bet + p.stack, Math.max(a.to ?? 0, t.currentBet + t.minRaise))
    put(p, to - p.bet)
    const by = to - t.currentBet
    // a full raise reopens the betting; a short all-in only asks the others to match it
    if (by >= t.minRaise) s.minRaise = by
    p.last = p.allIn ? `all-in ${to}` : t.currentBet === 0 ? `bet ${to}` : `raise ${to}`
    s.currentBet = to
    for (const q of players) if (q !== p) q.acted = false
  }
  p.acted = true
  s.log = [...t.log, `${who(s, seat)} ${p.last}`]
  s.event = `${who(s, seat)} ${p.last}`
  return toAct(s, seat)
}

// the dealer's move: the next street turned over, or the showdown after the river
function deal(t: Table): Table {
  if (t.street === 'river') return showdown(t)
  const street = NEXT_STREET[t.street]
  const deck = [...t.deck]
  const cards = street === 'flop' ? [deck.pop()!, deck.pop()!, deck.pop()!] : [deck.pop()!]
  const board = [...t.board, ...cards]
  const players = t.players.map(p => ({ ...p, bet: 0, acted: false, last: p.folded ? p.last : '' }))
  const name = street[0]!.toUpperCase() + street.slice(1)
  const s: Table = {
    ...t, deck, board, players, street, currentBet: 0, minRaise: blinds(t)[1],
    log: [...t.log, `${name} ${board.join(' ')}`], event: name,
  }
  return toAct(s, t.button)
}

// the pots, main then side: each takes from everyone up to the next all-in's stake, and goes to the
// best hand among those who reached it. Odd chips go to the first winner after the button
function showdown(t: Table): Table {
  const players = t.players.map(p => ({ ...p }))
  const live = players.map((p, i) => i).filter(i => isLive(players[i]!))
  const ranks = new Map(live.map(i => [i, rank([...players[i]!.hole, ...t.board])]))
  const stakes = [...new Set(live.map(i => players[i]!.committed))].sort((a, b) => a - b)
  const pots: Pot[] = []
  let below = 0
  for (const [k, stake] of stakes.entries()) {
    // the last pot also takes what any folded player put in above it
    const top = k === stakes.length - 1 ? Infinity : stake
    const amount = players.reduce((n, p) => n + Math.max(0, Math.min(p.committed, top) - below), 0)
    const reached = live.filter(i => players[i]!.committed >= stake)
    const best = Math.max(...reached.map(i => ranks.get(i)!))
    const winners = reached.filter(i => ranks.get(i) === best)
    below = stake
    if (!amount) continue
    const last = pots[pots.length - 1]
    // a bet nobody called comes back as a pot of one; pots with the same winners merge
    if (last && last.winners.join() === winners.join()) last.amount += amount
    else pots.push({ amount, winners, hand: handName(best) })
  }
  for (const p of pots) share(t, players, p)
  return finish(t, players, pots, live)
}

// a pot shared out among its winners, the odd chips from the button round
function share(t: Table, players: Player[], p: Pot) {
  const each = Math.floor(p.amount / p.winners.length)
  let odd = p.amount - each * p.winners.length
  const order = [...p.winners].sort((a, b) => ((a - t.button + 5) % 6) - ((b - t.button + 5) % 6))
  for (const i of order) {
    players[i]!.stack += each + (odd > 0 ? 1 : 0)
    odd--
  }
}

// everyone else folded: the last player in takes it all, unshown
function award(t: Table): Table {
  const players = t.players.map(p => ({ ...p }))
  const winner = players.findIndex(isLive)
  const p: Pot = { amount: pot(t), winners: [winner], hand: '' }
  share(t, players, p)
  return finish(t, players, [p], [])
}

// the hand settled: the pots paid, the busted given their places (the bigger stack going in
// placing higher), the result to show
function finish(t: Table, players: Player[], pots: Pot[], shown: number[]): Table {
  for (const p of players) {
    p.committed = 0
    p.bet = 0
  }
  const before = t.players.map(p => p.stack + p.committed)
  const busted = players.map((p, i) => i).filter(i => players[i]!.place === 0 && players[i]!.stack === 0)
  let place = players.filter(p => p.place === 0).length
  for (const i of busted.sort((a, b) => before[a]! - before[b]!)) players[i]!.place = place--
  // with one player left, it wins
  const left = players.filter(p => p.place === 0)
  if (left.length === 1) left[0]!.place = 1
  const s: Table = { ...t, players, turn: -1, phase: 'over', currentBet: 0 }
  const names = (ws: number[]) => ws.map(i => who(s, i)).join(' and ')
  const main = pots[0]!
  const verb = main.winners.length > 1 ? 'split' : main.winners[0] === YOU ? 'win' : 'wins'
  s.event = `${names(main.winners)} ${verb} ${main.amount}${main.hand ? ` with ${main.hand}` : ''}`
  s.result = { pots, shown, net: players[YOU]!.stack - before[YOU]! }
  s.log = [...t.log, ...pots.map(p => `${names(p.winners)} ${p.winners.length > 1 ? 'split' : 'take'} ${p.amount}`)]
  return s
}

// the bots' and the dealer's moves, one a beat; while a hand is dealt, its banner counts down
export function step(t: Table): Table {
  if (t.phase === 'deal') return t.wait > 1 ? { ...t, wait: t.wait - 1 } : dealt(t)
  if (t.phase !== 'ai') return t
  if (t.turn < 0) return deal(t)
  const rand = rng(t.seed)
  const a = decide(t, t.turn, blinds(t)[1], rand)
  return act({ ...t, seed: reseed(rand) }, t.turn, a)
}

// after a hand: the next, or the end once you bust or hold every chip
export function nextHand(t: Table): Table {
  if (t.phase !== 'over') return t
  const you = t.players[YOU]!
  if (you.place === 1) return { ...t, phase: 'done', event: 'You won the Sit & Go' }
  if (you.place) return { ...t, phase: 'done', event: `You finished ${ordinal(you.place)} of ${t.players.length}` }
  return startHand(t)
}

// the raise sizes open to you, as amounts to raise to: the least, half, three quarters and the whole
// pot, and all in. None when a call takes everything, or nobody is left to bet against
export function sizes(t: Table): number[] {
  const p = t.players[YOU]!
  const all = p.bet + p.stack
  const others = t.players.some((q, i) => i !== YOU && canAct(q))
  if (t.phase !== 'act' || all <= t.currentBet || !others) return []
  const least = Math.min(all, t.currentBet + t.minRaise)
  const unit = blinds(t)[0]
  const toCall = t.currentBet - p.bet
  const fractions = [0.5, 0.75, 1].map(f => Math.ceil((t.currentBet + f * (pot(t) + toCall)) / unit) * unit)
  return [...new Set([least, ...fractions.filter(x => x > least && x < all), all])]
}

// your raise size moved by one, held within the sizes offered
export const resize = (t: Table, by: number): Table => ({ ...t, size: Math.max(0, Math.min(sizes(t).length - 1, t.size + by)) })
