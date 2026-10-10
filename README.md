# hold-em: a Sit & Go while Claude works

[![ci](https://github.com/IanYHChu/hold-em/actions/workflows/ci.yml/badge.svg)](https://github.com/IanYHChu/hold-em/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/IanYHChu/hold-em/badge)](https://scorecard.dev/viewer/?uri=github.com/IanYHChu/hold-em)

While Claude thinks, runs your tests or edits a dozen files, what do you do? Watch the spinner?

Claude Code mods give a plugin the space above the prompt. `hold-em` turns it into a four-row poker
table where you play a **six-player Texas Hold'em Sit & Go** against five bots. When Claude comes back,
go back to work: the hand waits for you. Blinds, side pots, split pots, rising levels, busting out
and finishing places are all there, and none of it touches your conversation with Claude.

It spends no tokens: the game runs entirely on your machine. Dealing, betting and the bots' thinking
never call the model, so it's also something to do while you wait for a usage limit to reset.

```
Ada 1,500 D    Bo 1,490       Cy 1,480       Dee 1,480      Eli 1,440
               blind 10       blind 20       call 20        raise 60
K♠ 9♥ You 1,500   · · · · ·   Pot 110                           Eli raise 60
q: Fold w: Call 60 e: Raise to 100 a: ◀ d: ▶ r: All-in       v: Log c: ♠ 10/20
```

## Features

- **A real Sit & Go**: six players, 1,500 chips each, blinds up every six hands, played until one
  player holds every chip. You finish in a place, 6th to 1st
- **Full betting rules**: blinds, check, call, bet, raise with a minimum raise, all-in, side pots
  for every all-in, split pots with the odd chip to the first seat after the button, heads-up blinds
- **Bots with styles**: each one plays its hand out hundreds of times against the players still in
  to weigh its cards, then sets that against the price of the call. Ada is solid, Bo loose and
  aggressive, Cy a rock, Dee a calling station, Eli tight and aggressive. Short stacks push or fold
- **Showdowns you can read**: the cards shown in each bot's area, the winning hand by name
  (Full house, Queens over Fours), and what you won or lost on the hand
- **A banner for every deal**: as each hand is dealt, a banner holds the table for two seconds with
  the hand number, the blinds and when they go up, the players left, your stack in big blinds, your
  place in chips and your seat. It also keeps a double-pressed `q` from folding the new hand
- **A log**: press `v` for every stack and the hand's action street by street
- **Any terminal**: press `c` to draw suits as letters (`As Th`), for terminals that draw ♠♥♦♣ two
  cells wide

## Install

Requires Claude Code 2.1.288 or later (Claude Mods shipped in 2.1.287; 2.1.288 fixed the mod button
and the band above the prompt). Check with `claude --version`, update with `claude update`.

hold-em is in the [claude-mods-games](https://github.com/IanYHChu/claude-mods-games) marketplace.
Add it once, and install the other games from there too. Inside Claude Code:

```
/plugin marketplace add IanYHChu/claude-mods-games
/plugin install hold-em@claude-mods-games
```

Or in a terminal:

```sh
claude plugin marketplace add IanYHChu/claude-mods-games
claude plugin install hold-em@claude-mods-games
```

Start a new session and the table appears above the prompt.

## How to play

The table's keys are letters, so focus it first: press `ctrl+x` then `tab`, and `Esc` to go back to
the prompt. In fullscreen mode (`/tui fullscreen`) you can also click the table, or click a move;
default mode doesn't support clicks.

| When | Keys |
|---|---|
| Your turn | `q` fold, `w` check or call, `e` bet or raise. With nothing to call there is no fold, so `q` does nothing |
| Sizing a bet | `a` smaller, `d` larger: the minimum, half pot, three quarters, pot, all in |
| All in | `r` |
| A hand is over | `q` next hand |
| The Sit & Go is over | `q` play another |
| Any time | `v` show or hide the log, `c` suits as symbols or letters |

Commands:

- `/holdem`: hide or show the table (for when someone walks by)
- `/holdem-new`: start a new Sit & Go, every stack back to 1,500

## Reading the table

- **Rows 1 and 2**: one area per bot, in the order they act after you. The name and stack, `D` on
  the button, bold on its turn; underneath, what it did on this street (`call 40`, `raise 120`,
  `fold`, `all-in`), or once it's out, its place. At a showdown, the cards it shows. While a hand is
  dealt, a banner takes their place: `Hand 12 · Blinds 25/50, up in 3 hands` over
  `4 left · You 1,560 (31 BB), 2nd in chips · you're in the big blind`
- **Row 3**: your cards and stack, the board, the pot; at the right, what just happened (as a hand
  is dealt, who busted on the last one)
- **Row 4**: your moves on your turn, or whose turn it is. When a hand is over, the winning hand,
  any side pots and your net. At the right `v` log, `c` suits and the blinds (`10/20`)

## Blinds

| Hands | Blinds | | Hands | Blinds |
|---|---|---|---|---|
| 1-6 | 10/20 | | 43-48 | 200/400 |
| 7-12 | 15/30 | | 49-54 | 300/600 |
| 13-18 | 25/50 | | 55-60 | 400/800 |
| 19-24 | 50/100 | | 61-66 | 600/1,200 |
| 25-30 | 75/150 | | 67-72 | 800/1,600 |
| 31-36 | 100/200 | | 73 on | 1,000/2,000 |
| 37-42 | 150/300 | | | |

No antes. A Sit & Go usually takes 40 to 80 hands.

## Security

Claude Code mods aren't sandboxed, so here is everything hold-em does: it draws the table, keeps
the game and runs a timer through the Mods API, and registers the `/holdem` and `/holdem-new`
commands. It doesn't read or write files, use the network or run programs, and it doesn't see your
conversation with Claude or Claude's tool calls. The code imports only the Mods API and its own
files; run `claude plugin validate .` to see which hooks it registers and which APIs it calls.

The [claude-mods-games](https://github.com/IanYHChu/claude-mods-games) marketplace checks every
pinned version and publishes the results in
[CAPABILITIES.md](https://github.com/IanYHChu/claude-mods-games/blob/main/CAPABILITIES.md).

## Development

```sh
claude plugin test .       # run the tests
claude plugin validate .   # check the manifest and the hooks module
```

The code is in `hooks/`: `cards.ts` the deck and how cards are drawn, `eval.ts` hand ranking,
`bot.ts` the bots, `table.ts` the betting, pots and the Sit & Go, `register.tsx` the table and keys.

## License

MIT
