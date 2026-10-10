// Hold'em's state contract: every value the mod keeps in $.state.
// A card is a rank and a suit: 'As' 'Td' '9c', ranks 23456789TJQKA, suits s h d c.
export type Card = string
// a seat at the table: 0 is you, 1-5 the bots, in the order they act
export type Player = {
  name: string
  stack: number
  // two cards while dealt in; none once out
  hole: Card[]
  // chips put in on this street, and on the whole hand (this street's included)
  bet: number
  committed: number
  folded: boolean
  allIn: boolean
  // has acted since the last full raise, so the street can close on it
  acted: boolean
  // what it did last on this street, for its area: 'call 40', 'raise 120', 'check'
  last: string
  // its finishing place once it busts (6: first out), 0 while it plays
  place: number
}
export type Street = 'preflop' | 'flop' | 'turn' | 'river'
// a pot as it was won: the main pot first, then the side pots; `hand` is empty when nobody showed down
export type Pot = { amount: number; winners: number[]; hand: string }
// a hand's outcome: the pots, whose cards were shown, and what you won or lost on it
export type Result = { pots: Pot[]; shown: number[]; net: number }
export type Action = { kind: 'fold' | 'check' | 'call' | 'raise'; to?: number }
// deal: the cards are out and the blinds in, the hand's banner up for `wait` beats before anyone acts;
// act: your move; ai: a bot's move, or with turn -1 the dealer's (the next street, or the showdown);
// over: the hand is won (`result`); done: the Sit & Go is over, you won it or busted
export type Phase = 'deal' | 'act' | 'ai' | 'over' | 'done'
export type Table = {
  // the generator's state: the deal and the bots' choices follow from it
  seed: number
  deck: Card[]
  board: Card[]
  players: Player[]
  street: Street
  button: number
  // whose move it is, -1 the dealer's
  turn: number
  // the street's bet to match, and the least a raise adds to it
  currentBet: number
  minRaise: number
  // your raise size, an index into the sizes offered
  size: number
  hand: number
  phase: Phase
  // beats the deal's banner has left
  wait: number
  result: Result | null
  // what just happened
  event: string
  // the hand so far, street by street, cards as codes
  log: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'hold-em': { table: Table; isHidden: boolean; isLogShown: boolean; isLettered: boolean }
  }
}
