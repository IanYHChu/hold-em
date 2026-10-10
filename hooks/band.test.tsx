import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  plugin: 'hold-em',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const

// the engine beneath a session start: a clock that moves when the test moves it, and the command table
function boot(on: On) {
  const clock = mock.clock(on)
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  return clock
}

// The first deal (seed 1) puts the button on Cy, so you act first, under the gun.

test('the band: five bots, you and the board, your moves', async $ => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  for (const k of ['seats', 'seat1', 'seat5', 'middle', 'you', 'board', 'pot', 'event', 'keys', 'moves', 'call', 'raise', 'logKey', 'suitsKey']) {
    expect(await ui.find({ key: k })).toBeDefined()
  }
  for (const name of ['Ada', 'Bo', 'Cy', 'Dee', 'Eli']) expect(await ui.find({ type: 'Text', text: new RegExp(`^${name} [\\d,]+`) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '10/20' })).toBeDefined()
  // your two cards, drawn with their suits
  expect((await ui.findAll({ type: 'Text', text: /^(10|[2-9JQKA])[♠♥♦♣]$/ })).length).toBe(2)
  await ui.unmount()
})

test('calling hands the turn on; the raise size walks with a and d', async $ => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'raise' }))?.text).toBe('Raise to 40')
  await ui.press({ key: 'more' })
  expect((await ui.find({ key: 'raise' }))?.text).not.toBe('Raise to 40')
  await ui.press({ key: 'less' })
  expect((await ui.find({ key: 'raise' }))?.text).toBe('Raise to 40')
  await ui.press({ key: 'call' })
  expect(await ui.find({ key: 'moves' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /to act|Dealing/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'call 20' })).toBeDefined()
  await ui.unmount()
})

test('folded, you watch the bots play the hand out on the beat, then q deals the next', async ($, on) => {
  const clock = boot(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'call' })
  // the table is yours now, so the session keeps it
  await $.session.start(START)
  expect(await ui.find({ key: 'next' })).toBeUndefined()
  for (let i = 0; i < 60 && !(await ui.find({ key: 'next' })) && !(await ui.find({ key: 'moves' })); i++) await clock.advance(700)
  // the bots called or folded round, and the dealer and they played on to your next move or the end
  expect((await ui.find({ key: 'moves' })) ?? (await ui.find({ key: 'next' }))).toBeDefined()
  while (await ui.find({ key: 'moves' })) {
    await ui.press({ key: (await ui.find({ key: 'fold' })) ? 'fold' : 'call' })
    for (let i = 0; i < 60 && !(await ui.find({ key: 'next' })) && !(await ui.find({ key: 'moves' })); i++) await clock.advance(700)
  }
  expect(await ui.find({ type: 'Text', text: /(wins?|split) [\d,]+/ })).toBeDefined()
  await ui.press({ key: 'next' })
  expect(await ui.find({ key: 'next' })).toBeUndefined()
  // the next hand's banner, in place of the bots, and nothing to press but the log and the suits
  expect(await ui.find({ key: 'banner' })).toBeDefined()
  expect(await ui.find({ key: 'seats' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Hand 2 · Blinds 10/20, up in 5 hands' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^6 left · You [\d,]+ \(\d+ BB\), \d(st|nd|rd|th) in chips · you're in the big blind$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Dealing hand 2' })).toBeDefined()
  await clock.advance(700 * 3)
  expect(await ui.find({ key: 'banner' })).toBeUndefined()
  expect(await ui.find({ key: 'seats' })).toBeDefined()
  await ui.press({ key: 'logKey' })
  expect(await ui.find({ type: 'Text', text: /^Hand 2, blinds 10\/20/ })).toBeDefined()
  await ui.unmount()
})

test('the beat waits while the band is hidden', async ($, on) => {
  const clock = boot(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'call' })
  await $.session.start(START)
  await $.command.run({ command: 'holdem', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as never)
  await clock.advance(700 * 20)
  await $.command.run({ command: 'holdem', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as never)
  // nobody else has moved: the first bot still to act
  expect(await ui.find({ type: 'Text', text: 'Ada to act' })).toBeDefined()
  await ui.unmount()
})

test('v shows the log above the table; c turns the suits to letters', async $ => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'log' })).toBeUndefined()
  await ui.press({ key: 'logKey' })
  expect(await ui.find({ key: 'log' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Hand 1, blinds 10\/20, up in 6 hands +You 1,500/ })).toBeDefined()
  await ui.press({ key: 'logKey' })
  expect(await ui.find({ key: 'log' })).toBeUndefined()
  await ui.press({ key: 'suitsKey' })
  expect((await ui.findAll({ type: 'Text', text: /^[2-9TJQKA][shdc]$/ })).length).toBe(2)
  await ui.unmount()
})

test('the band yields to a survey', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine survey</Text>
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, hasSurvey: true } })
  expect(await ui.find({ type: 'Text', text: 'engine survey' })).toBeDefined()
  await ui.unmount()
})
