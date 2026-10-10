import { expect, test } from 'claude-code/testing'

import type { Player, Table } from '../types'
import { decide, equity } from './bot'
import { chips, label, rng } from './cards'
import { category, handName, rank } from './eval'
import { BLINDS, DEAL_BEATS, START_STACK, YOU, act, blinds, dealt, newGame, nextHand, pot, sizes, step } from './table'

const h = (s: string) => s.split(' ')
const total = (t: Table) => t.players.reduce((n, p) => n + p.stack + p.committed, 0)

test('cards draw with their suits, or as letters', () => {
  expect(label('As')).toBe('A♠')
  expect(label('Th')).toBe('10♥')
  expect(label('Th', true)).toBe('Th')
  expect(chips(1500)).toBe('1,500')
  expect(chips(980)).toBe('980')
})

test('hands rank by category, then by their cards', () => {
  const order = [
    'As Ks Qs Js Ts 2d 3c', // royal flush
    '9h 8h 7h 6h 5h Ad Ac', // straight flush
    '7s 7h 7d 7c Kd 2s 3s', // four of a kind
    'Qs Qh Qd 4c 4d 2s 3h', // full house
    'Ad Jd 8d 5d 2d Kc Qh', // flush
    'Ts 9h 8d 7c 6s 2h 2c', // straight
    '5s 4h 3d 2c As Kd 9h', // the wheel
    '8s 8h 8d Kc 2d 4s 6h', // three of a kind
    'Ks Kh 4d 4c As 7d 2h', // two pair
    'Ks Kh 4d 4c Qs 7d 2h', // two pair, a lower kicker
    'Js Jh 9d 7c 5s 3d 2h', // a pair
    'Ah Qd 9s 7c 5h 3d 2s', // ace high
  ].map(x => rank(h(x)))
  for (let i = 1; i < order.length; i++) expect(order[i - 1]! > order[i]!).toBe(true)
  expect(handName(order[0]!)).toBe('Royal flush')
  expect(handName(order[3]!)).toBe('Full house, Queens over Fours')
  expect(handName(order[6]!)).toBe('Straight, Five high')
  expect(handName(order[8]!)).toBe('Two pair, Kings and Fours')
  expect(handName(order[11]!)).toBe('Ace high')
})

test('the best five count, and no more', () => {
  // two sets of trips are a full house; three pairs play the best two and the best kicker
  expect(handName(rank(h('9s 9h 9d 5c 5d 5s Ah')))).toBe('Full house, Nines over Fives')
  expect(rank(h('Qs Qh 8d 8c 3s 3d Kh'))).toBe(rank(h('Qd Qc 8s 8h 2s 2d Kc')))
  // a sixth and seventh card past the five decide nothing
  expect(rank(h('As Ah Kd Qc Jh 3s 2d'))).toBe(rank(h('Ad Ac Ks Qh Jd 4c 5h')))
  // a board that plays for both splits
  expect(rank(h('2c 3d Ts Js Qs Ks As'))).toBe(rank(h('2h 4d Ts Js Qs Ks As')))
  expect(category(rank(h('2s 3s 4s 5s 7h 8h 9h')))).toBe(0)
})

test('equity: aces are favourites, a made nut hand cannot lose', () => {
  const aces = equity(h('As Ah'), [], 1, rng(5), 400)
  expect(aces > 0.75 && aces < 0.92).toBe(true)
  expect(equity(h('As Ks'), h('Qs Js Ts'), 3, rng(5), 100)).toBe(1)
  expect(equity(h('7c 2d'), [], 0, rng(5))).toBe(1)
})

test('the deal: two cards each, the blinds in, every chip accounted for', () => {
  const t = newGame(1)
  expect(t.hand).toBe(1)
  expect(t.phase).toBe('deal')
  expect(t.players.every(p => p.hole.length === 2)).toBe(true)
  expect(new Set(t.players.flatMap(p => p.hole)).size).toBe(12)
  expect(t.deck.length).toBe(40)
  expect(pot(t)).toBe(30)
  expect(t.currentBet).toBe(20)
  expect(total(t)).toBe(START_STACK * 6)
  // the first to act sits three after the button
  expect(t.turn).toBe((t.button + 3) % 6)
})

test('the deal\'s banner holds the table for its beats, then the first to act moves', () => {
  let t = newGame(1)
  // nobody may act while it is up
  expect(act(t, t.turn, { kind: 'fold' })).toBe(t)
  for (let i = 1; i < DEAL_BEATS; i++) {
    t = step(t)
    expect(t.phase).toBe('deal')
  }
  t = step(t)
  // seed 1 puts the button on Cy: you act first
  expect(t.phase).toBe('act')
  expect(t.turn).toBe(YOU)
})

// everyone folds, round from whoever acts first
function foldAround(t: Table): Table {
  while (t.phase === 'act' || (t.phase === 'ai' && t.turn >= 0)) t = act(t, t.turn, { kind: 'fold' })
  return t
}

test('folded round to the big blind, it takes the blinds unshown', () => {
  const t = foldAround(dealt(newGame(1)))
  const bb = (t.button + 2) % 6
  expect(t.phase).toBe('over')
  expect(t.players[bb]!.stack).toBe(START_STACK + 10)
  expect(t.result!.shown).toEqual([])
  expect(t.result!.pots).toEqual([{ amount: 30, winners: [bb], hand: '' }])
  expect(total(t)).toBe(START_STACK * 6)
  const next = nextHand(t)
  expect(next.hand).toBe(2)
  expect(next.phase).toBe('deal')
  expect(next.button).toBe((t.button + 1) % 6)
})

test('a full raise reopens the betting; a call that closes it brings the dealer', () => {
  let t = dealt(newGame(1))
  const first = t.turn
  t = act(t, first, { kind: 'raise', to: 60 })
  expect(t.currentBet).toBe(60)
  expect(t.minRaise).toBe(40)
  expect(t.players[first]!.last).toBe('raise 60')
  // the rest call round to the raiser, who is done
  while (t.turn >= 0 && t.turn !== first) t = act(t, t.turn, { kind: 'call' })
  expect(t.turn).toBe(-1)
  expect(t.phase).toBe('ai')
  expect(pot(t)).toBe(360)
  t = step(t)
  expect(t.street).toBe('flop')
  expect(t.board.length).toBe(3)
  expect(t.currentBet).toBe(0)
  // after the flop the small blind acts first
  expect(t.turn).toBe((t.button + 1) % 6)
  // checked round, the dealer turns the turn
  while (t.turn >= 0) t = act(t, t.turn, { kind: 'check' })
  t = step(t)
  expect(t.street).toBe('turn')
  expect(t.board.length).toBe(4)
})

test('a raise below the least is raised to it; a fold with nothing to call is a check', () => {
  let t = dealt(newGame(1))
  t = act(t, t.turn, { kind: 'raise', to: 25 })
  expect(t.currentBet).toBe(40)
  const at = t.turn
  const free = { ...t, currentBet: t.players[at]!.bet }
  expect(act(free, at, { kind: 'fold' }).players[at]!.folded).toBe(false)
})

// three players in on the river, all in for different amounts; the rest out
function river(holes: string[], committed: number[], board: string): Table {
  const t = newGame(1)
  const players: Player[] = t.players.map((p, i) => ({
    ...p, hole: i < 3 ? h(holes[i]!) : [], stack: 0, bet: 0, committed: committed[i] ?? 0,
    allIn: i < 3, folded: false, place: i < 3 ? 0 : 6 - i + 3,
  }))
  return { ...t, players, board: h(board), street: 'river', turn: -1, phase: 'ai', button: 0 }
}

test('side pots: each player wins only what its chips reached', () => {
  // you have the best hand but only 100 in; Ada 300 with the second best; Bo 300 with the worst
  const t = step(river(['As Ah', 'Ks Kh', 'Qs Qh'], [100, 300, 300], '2c 5d 8h 9s Jc'))
  expect(t.phase).toBe('over')
  expect(t.result!.pots.map(p => [p.amount, p.winners])).toEqual([[300, [0]], [400, [1]]])
  expect(t.players.map(p => p.stack).slice(0, 3)).toEqual([300, 400, 0])
  expect(t.result!.net).toBe(200)
  expect(t.result!.shown).toEqual([0, 1, 2])
  // Bo busts, in third
  expect(t.players[2]!.place).toBe(3)
  expect(t.event).toBe('You win 300 with Pair of Aces')
})

test('a split pot shares out, the odd chip to the first after the button', () => {
  // the board plays: all three split, with a chip a folded player left in
  const t = river(['2c 3d', '2d 3h', '2h 4c'], [100, 100, 100], 'As Ks Qs Js Ts')
  t.players[3] = { ...t.players[3]!, hole: h('9c 9d'), committed: 1, stack: 50, folded: true, place: 0 }
  const s = step(t)
  expect(s.result!.pots.map(p => [p.amount, p.winners])).toEqual([[301, [0, 1, 2]]])
  expect(s.players.map(p => p.stack).slice(0, 3)).toEqual([100, 101, 100])
  expect(s.event).toBe('You and Ada and Bo split 301 with Royal flush')
})

test('your raise sizes: the least first, all in last, rising', () => {
  let t = newGame(1)
  while (t.phase !== 'act') t = step(t)
  const s = sizes(t)
  expect(s.length > 1).toBe(true)
  expect(s[0]).toBe(t.currentBet + t.minRaise)
  expect(s[s.length - 1]).toBe(t.players[YOU]!.bet + t.players[YOU]!.stack)
  for (let i = 1; i < s.length; i++) expect(s[i]! > s[i - 1]!).toBe(true)
})

test('the next deal names who busted on the last hand', () => {
  // Bo busts in the side pot hand
  const t = step(river(['As Ah', 'Ks Kh', 'Qs Qh'], [100, 300, 300], '2c 5d 8h 9s Jc'))
  expect(nextHand(t).event).toBe('Bo out in 3rd')
})

test('the blinds go up every six hands', () => {
  expect(blinds({ hand: 1 })).toEqual(BLINDS[0])
  expect(blinds({ hand: 6 })).toEqual(BLINDS[0])
  expect(blinds({ hand: 7 })).toEqual(BLINDS[1])
  expect(blinds({ hand: 999 })).toEqual(BLINDS[BLINDS.length - 1])
})

test('whole Sit & Gos, every seat a bot: chips kept, and every one ends', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    let t = newGame(seed)
    for (let moves = 0; t.phase !== 'done'; moves++) {
      if (t.phase === 'act') t = act(t, YOU, decide(t, YOU, blinds(t)[1], rng(t.seed + 1)))
      else if (t.phase === 'over') t = nextHand(t)
      else t = step(t)
      expect(total(t)).toBe(START_STACK * 6)
      expect(t.players.every(p => p.stack >= 0)).toBe(true)
      expect(moves < 20000).toBe(true)
    }
    const places = t.players.map(p => p.place).filter(Boolean)
    expect(new Set(places).size).toBe(places.length)
    expect(t.players[YOU]!.place > 0).toBe(true)
    expect(t.hand < 400).toBe(true)
  }
})
