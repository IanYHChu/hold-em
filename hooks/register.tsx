// Hold'em: a six-player Texas Hold'em Sit & Go against five bots, in a four-row band above the prompt.
//
//   rows 1-2  an area per bot, in the order they act after you, left to right: its name and stack, D
//             on the button, bold on its turn; under it what it did last on this street (call 40,
//             raise 120, fold, all-in), or once out its place. At a showdown, the cards it showed.
//             While a hand is dealt, a banner in the middle instead: the hand and its blinds, then
//             where you stand (the players left, your stack in big blinds, your place in chips, your
//             seat), up for DEAL_BEATS beats before anyone acts
//   row 3     your cards and stack, the board, the pot; at the right what just happened
//   row 4     your moves on your turn (q fold, w check or call, e bet or raise, a d the size, r all in),
//             or whose turn it is; once a hand is won, q next hand, the winning hand and your net;
//             once the Sit & Go is over, q to play another. At the right v log, c suits, the blinds (10/20)
//
// v shows or hides the log above the table: the hand and the blinds, every stack, and the hand's
// action street by street. c swaps the suit symbols for letters (As Th), for a terminal that draws
// the symbols two cells wide.
//
// The keys are letters, so they need the band focused (ctrl+x tab, or a click). The bots and the
// dealer play on a fixed beat, and wait while the band is hidden.
// /holdem shows or hides the band, /holdem-new starts a new Sit & Go.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Card, Table } from '../types'
import { chips, color, label } from './cards'
import { YOU, act, blindSeats, blinds, dealt, handsToLevel, level, newGame, nextHand, ordinal, pot, resize, sizes, step, who } from './table'

const REF = { plugin: 'hold-em', key: 'table' } as const
// a fixed first deal, its banner done, so a test sees a known table at your move; a session deals
// afresh as it starts
const table = atom(REF, dealt(newGame(1)))
const isHidden = atom({ plugin: 'hold-em', key: 'isHidden' } as const, false)
const isLogShown = atom({ plugin: 'hold-em', key: 'isLogShown' } as const, false)
const isLettered = atom({ plugin: 'hold-em', key: 'isLettered' } as const, false)
const BEAT_MS = 700
const BOT_SEATS = [1, 2, 3, 4, 5]
const fresh = () => newGame(Math.floor(Math.random() * 4294967296))

export const register: Register = on => {
  let beat: { cancel(): void } | undefined

  on('session.start', async ($, e, next) => {
    // a new session deals; a hot reload keeps the table it holds
    if ((await $.state.get(REF)).version === 0) await $.state.set(REF, fresh())
    beat?.cancel()
    beat = $.clock.every(BEAT_MS, () => {
      void (async () => {
        if (await read($, isHidden)) return
        const { phase } = await read($, table)
        if (phase !== 'ai' && phase !== 'deal') return
        await update($, table, step)
      })()
    })
    await $.command.register({ name: 'holdem', description: "Hold'em: show or hide the table" })
    await $.command.register({ name: 'holdem-new', description: "Hold'em: a new Sit & Go, every stack back to the start" })
    return next(e)
  })

  on('command.run', { command: 'holdem' }, async $ => {
    const hidden = await update($, isHidden, h => !h)
    return { text: hidden ? "Hold'em hidden (/holdem brings it back)." : "Hold'em shown above the prompt." }
  })
  on('command.run', { command: 'holdem-new' }, async $ => {
    await update($, table, fresh)
    await update($, isHidden, () => false)
    return { text: "Hold'em: a new Sit & Go is dealt." }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const t = await read($, table)
    const letters = await read($, isLettered)
    const move = (fn: (s: Table) => Table) => () => update($, table, fn)

    const card = (c: Card, dim = false) => <Text bold color={dim ? undefined : color(c)} dimColor={dim}>{label(c, letters)}</Text>
    const button = (seat: number) => (t.button === seat ? <Text color="yellow"> D</Text> : '')

    // rows 1-2: an area per bot
    const bots = (
      <Box key="seats" flexDirection="row" height={2} columnGap={1}>
        {BOT_SEATS.map(i => {
          const p = t.players[i]!
          const isTurn = t.phase === 'ai' && t.turn === i
          const isShown = t.result?.shown.includes(i) ?? false
          const isOut = p.place > 0 && !isShown
          const doing = isOut ? <Text dimColor>{p.place === 1 ? 'winner' : `out, ${ordinal(p.place)}`}</Text>
            : isShown ? <Box flexDirection="row" columnGap={1}>{p.hole.map(c => card(c))}</Box>
            : p.folded ? <Text dimColor>fold</Text>
            : p.allIn ? <Text color="yellow">all-in</Text>
            : <Text color={/^(bet|raise)/.test(p.last) ? 'yellow' : undefined}>{p.last}</Text>
          return (
            <Box key={`seat${i}`} flexGrow={1} width={0} height={2} flexDirection="column" overflow="hidden">
              <Text wrap="truncate" bold={isTurn} dimColor={isOut || p.folded}>{`${p.name} ${chips(p.stack)}`}{button(i)}</Text>
              {doing}
            </Box>
          )
        })}
      </Box>
    )

    // rows 1-2 while a hand is dealt: the banner, centred
    const [sb, bb] = blinds(t)
    const toLevel = handsToLevel(t.hand)
    const alive = t.players.filter(p => p.place === 0)
    const me = t.players[YOU]!
    const rankInChips = 1 + alive.filter(p => p.stack + p.committed > me.stack + me.committed).length
    const [sbSeat, bbSeat] = blindSeats(t)
    const seat = t.button === YOU ? (sbSeat === YOU ? 'on the button, in the small blind' : 'on the button')
      : sbSeat === YOU ? 'in the small blind'
      : bbSeat === YOU ? 'in the big blind'
      : t.turn === YOU ? 'first to act' : ''
    const title = t.hand === 1 ? `A new Sit & Go: six players, ${chips(me.stack + me.committed)} chips each, blinds ${sb}/${bb}`
      : level(t.hand) > level(t.hand - 1) ? `Hand ${t.hand} · Blinds up to ${sb}/${bb}`
      : `Hand ${t.hand} · Blinds ${sb}/${bb}${toLevel ? `, up in ${toLevel} hand${toLevel > 1 ? 's' : ''}` : ''}`
    const standing = [
      t.hand > 1 && `${alive.length} left`,
      `You ${chips(me.stack + me.committed)} (${Math.floor((me.stack + me.committed) / bb)} BB)${t.hand > 1 ? `, ${ordinal(rankInChips)} in chips` : ''}`,
      seat && `you're ${seat}`,
    ].filter(Boolean).join(' · ')
    const banner = t.phase === 'deal' && (
      <Box key="banner" flexDirection="column" height={2} alignItems="center">
        <Text bold color="yellow" wrap="truncate">{title}</Text>
        <Text wrap="truncate">{standing}</Text>
      </Box>
    )

    // row 3: you, the board, the pot; what just happened at the right
    const you = t.players[YOU]!
    const isYourTurn = t.phase === 'act'
    const dealt = you.hole.length > 0 && !(you.place > 0 && t.phase === 'done')
    const board = (
      <Box key="middle" flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row" columnGap={2} flexShrink={0}>
          <Box key="you" flexDirection="row" columnGap={1}>
            {dealt && you.hole.map(c => card(c, you.folded))}
            <Text bold={isYourTurn}>{`You ${chips(you.stack)}`}{button(YOU)}</Text>
            {you.last && t.phase !== 'over' && <Text dimColor>{you.last}</Text>}
          </Box>
          <Box key="board" flexDirection="row" columnGap={1}>
            {t.board.map(c => card(c))}
            {Array.from({ length: 5 - t.board.length }, () => <Text dimColor>·</Text>)}
          </Box>
          {t.phase !== 'over' && t.phase !== 'done' && <Box key="pot"><Text>{`Pot ${chips(pot(t))}`}</Text></Box>}
        </Box>
        <Box key="event" flexShrink={1} marginLeft={2} overflow="hidden">
          <Text wrap="truncate" bold={t.phase === 'over' || t.phase === 'done'}>{t.event}</Text>
        </Box>
      </Box>
    )

    // row 4: your moves, or whose turn it is, or the hand's result; the blinds at the right
    const toCall = t.currentBet - you.bet
    const offered = sizes(t)
    const at = Math.min(t.size, offered.length - 1)
    const raiseTo = offered[at] ?? 0
    const raiseLabel = raiseTo === you.bet + you.stack ? `All-in ${chips(raiseTo)}` : t.currentBet ? `Raise to ${chips(raiseTo)}` : `Bet ${chips(raiseTo)}`
    const callLabel = toCall === 0 ? 'Check' : toCall >= you.stack ? `All-in ${chips(you.stack)}` : `Call ${chips(toCall)}`
    const r = t.result
    const names = (ws: number[]) => ws.map(i => who(t, i)).join(' and ')
    const outcome = r && [
      r.pots[0]!.hand,
      ...r.pots.slice(1).map(p => `side pot ${chips(p.amount)}: ${names(p.winners)}${p.hand ? `, ${p.hand}` : ''}`),
    ].filter(Boolean).join(' · ')
    const keys = (
      <Box key="keys" flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row" columnGap={1} flexShrink={1} overflow="hidden">
          {t.phase === 'act' ? (
            <Box key="moves" flexDirection="row" columnGap={1}>
              {toCall > 0 && <Button key="fold" label="Fold" hotkey="q" plain onPress={move(s => act(s, YOU, { kind: 'fold' }))} />}
              <Button key="call" label={callLabel} hotkey="w" plain onPress={move(s => act(s, YOU, { kind: 'call' }))} />
              {offered.length > 0 && <Button key="raise" label={raiseLabel} hotkey="e" plain onPress={move(s => act(s, YOU, { kind: 'raise', to: raiseTo }))} />}
              {offered.length > 1 && <Button key="less" label="◀" hotkey="a" plain dimColor={at === 0} onPress={move(s => resize(s, -1))} />}
              {offered.length > 1 && <Button key="more" label="▶" hotkey="d" plain dimColor={at === offered.length - 1} onPress={move(s => resize(s, 1))} />}
              {offered.length > 1 && <Button key="allin" label="All-in" hotkey="r" plain onPress={move(s => act(s, YOU, { kind: 'raise', to: you.bet + you.stack }))} />}
            </Box>
          ) : t.phase === 'over' ? (
            <Box key="over" flexDirection="row" columnGap={2}>
              <Button key="next" label="Next hand" hotkey="q" plain onPress={move(nextHand)} />
              {r!.net !== 0 && <Text bold color={r!.net > 0 ? 'green' : 'red'}>{`You ${r!.net > 0 ? '+' : ''}${chips(r!.net)}`}</Text>}
              {outcome && <Text wrap="truncate">{outcome}</Text>}
            </Box>
          ) : t.phase === 'done' ? (
            <Button key="again" label="New Sit & Go" hotkey="q" plain onPress={move(fresh)} />
          ) : (
            <Text key="waiting" dimColor wrap="truncate">{t.phase === 'deal' ? `Dealing hand ${t.hand}` : t.turn >= 0 ? `${who(t, t.turn)} to act` : 'Dealing'}{you.folded ? ' · you folded' : you.allIn ? ' · you are all in' : ''}</Text>
          )}
        </Box>
        <Box key="aside" flexDirection="row" columnGap={1} flexShrink={0} marginLeft={1}>
          <Button key="logKey" label="Log" hotkey="v" plain dimColor onPress={() => update($, isLogShown, v => !v)} />
          <Button key="suitsKey" label={letters ? 'As' : '♠'} hotkey="c" plain dimColor onPress={() => update($, isLettered, v => !v)} />
          <Text dimColor wrap="truncate">{`${sb}/${bb}`}</Text>
        </Box>
      </Box>
    )

    // above the table, while v has it shown: the hand and the blinds, every stack, the action; a rule
    const standings = t.players.map((p, i) => `${who(t, i)} ${p.place ? (p.place === 1 ? 'winner' : `out ${ordinal(p.place)}`) : chips(p.stack)}`)
    const upIn = toLevel ? `, up in ${toLevel} hand${toLevel > 1 ? 's' : ''}` : ''
    const log = (await read($, isLogShown)) && (
      <Box key="log" flexDirection="column">
        <Text key="round" dimColor wrap="truncate">{`Hand ${t.hand}, blinds ${sb}/${bb}${upIn}    ${standings.join('  ')}`}</Text>
        <Text key="action" wrap="wrap">{t.log.map(l => l.replace(/\b[2-9TJQKA][shdc]\b/g, c => label(c, letters))).join(' · ')}</Text>
        <Text dimColor wrap="truncate">{'─'.repeat(e.props.bodyColumns)}</Text>
      </Box>
    )

    return (
      <Box flexDirection="column">
        {log}
        <Box key="table" flexDirection="column" height={4}>
          {banner || bots}
          {board}
          {keys}
        </Box>
      </Box>
    )
  })
}
