import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'bun:test'
import { hintSegments } from './i18n.js'

const xdg = mkdtempSync(join(tmpdir(), 'lazyaur-test-xdg-'))
const bin = mkdtempSync(join(tmpdir(), 'lazyaur-test-bin-'))
// fake yay: -G blocks until killed, everything else exits immediately
const yay = join(bin, 'yay')
writeFileSync(
  yay,
  `#!/bin/sh
case "$1" in
  -G) sleep 30; exit 0 ;;
  *) exit 0 ;;
esac
`,
)
chmodSync(yay, 0o755)
process.env.PATH = `${bin}:${process.env.PATH}`
process.env.XDG_CONFIG_HOME = xdg
process.env.LC_ALL = 'en_US.UTF-8'
process.env.LANG = 'en_US.UTF-8'

const { createRoot } = await import('@opentui/react')
const { createTestRenderer } = await import('@opentui/core/testing')
const { App } = await import('./app.jsx')

const settingsPath = join(xdg, 'lazyaur', 'settings.json')
let ui
let root

const settle = () => new Promise(resolve => setTimeout(resolve, 40))
const frame = async () => {
  await settle()
  await ui.renderOnce()
  await settle()
  await ui.renderOnce()
  return ui.captureCharFrame()
}
const waitFor = async (predicate, what) => {
  for (let attempt = 0; attempt < 200; attempt++) {
    const current = await frame()
    if (predicate(current))
      return current
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`timeout waiting for ${what}`)
}
const type = (value) => {
  for (const ch of value)
    ui.mockInput.pressKey(ch)
}
const titleFg = (text) => {
  const spans = ui.captureSpans().lines.flatMap(line => line.spans)
  const span = spans.find(candidate => candidate.text.includes(text))
  if (!span)
    throw new Error(`span not found: ${text}`)
  return [...span.fg.buffer].join(',')
}

beforeEach(async () => {
  rmSync(join(xdg, 'lazyaur'), { recursive: true, force: true })
  ui = await createTestRenderer({
    width: 110,
    height: 40,
    exitOnCtrlC: false,
    exitSignals: [],
  })
  root = createRoot(ui.renderer)
  root.render(<App />)
})

afterEach(() => {
  try {
    root.unmount()
  }
  catch {}
  ui.renderer.destroy()
})

test('header line, language chip, panel numbers and hint tail', async () => {
  const f = await frame()
  expect(f).toContain(' LAZYAUR │ ~/')
  expect(f).toContain('zh en')
  expect(f).toContain('[1] Updates')
  expect(f).toContain('[3] Info')
  expect(f).toContain('1 2 3 panels')
  for (const id of ['updates_hint', 'installed_hint', 'search_hint', 'info_hint']) {
    const chips = hintSegments('en', id)
    expect(chips.at(-1)).toEqual(['L', 'language'])
    expect(chips.at(-2)).toEqual([':', 'settings'])
    expect(chips.some(([key]) => key === '1 2 3')).toBe(true)
  }
}, 60000)

test('L flips to Chinese instantly and persists settings.json', async () => {
  await frame()
  ui.mockInput.pressKey('L')
  const zh = await frame()
  expect(zh).toContain('移动')
  expect(zh).toContain('已安装')
  expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toMatchObject({ language: 'zh' })
  ui.mockInput.pressKey('L')
  const en = await frame()
  expect(en).toContain('move')
  expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toMatchObject({ language: 'en' })
}, 60000)

test('colon opens the two-row Settings popup, cycling theme persists', async () => {
  await frame()
  ui.mockInput.pressKey(':')
  let f = await frame()
  expect(f).toContain('Settings')
  expect(f).toContain('Language: English')
  expect(f).toContain('Theme: Default')
  ui.mockInput.pressKey('j')
  ui.mockInput.pressEnter()
  f = await frame()
  expect(f).toContain('Theme: Gruvbox Dark')
  expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toMatchObject({ theme: 'gruvbox-dark' })
  ui.mockInput.pressEscape()
  f = await frame()
  expect(f).not.toContain('Language: English')
}, 60000)

test('digit 2 focuses the Installed panel', async () => {
  await waitFor(text => text.includes('[2] Installed ('), 'installed list')
  const before = titleFg('[2] Installed')
  const updates = titleFg('[1] Updates')
  expect(before).not.toBe(updates)
  ui.mockInput.pressKey('2')
  await frame()
  expect(titleFg('[2] Installed')).not.toBe(before)
  expect(titleFg('[1] Updates')).toBe(before)
}, 60000)

test('background download job shows its row and x cancels it', async () => {
  await waitFor(text => text.includes('[2] Installed ('), 'installed list')
  const lines = (await frame()).split('\n')
  const titleIndex = lines.findIndex(line => line.includes('[2] Installed'))
  let pkgName = null
  for (let i = titleIndex + 1; i < lines.length && !pkgName; i++) {
    const match = /\[(?:rep|aur)\] (\S+)/.exec(lines[i])
    if (match)
      pkgName = match[1]
  }
  expect(pkgName).toBeTruthy()
  ui.mockInput.pressKey('2')
  await frame()
  ui.mockInput.pressKey('d')
  const running = await waitFor(text => text.includes(`▶ ↓ yay -G ${pkgName}`), 'job row')
  expect(running).toContain('Status')
  ui.mockInput.pressKey('q')
  let f = await frame()
  expect(f).toContain('Quit?')
  expect(f).toContain('jobs still running: 1')
  ui.mockInput.pressKey('n')
  f = await frame()
  expect(f).not.toContain('Quit?')
  expect(f).toContain(`▶ ↓ yay -G ${pkgName}`)
  ui.mockInput.pressKey('x')
  await waitFor(text => /⊘ ↓ yay -G .*canceled ·/.test(text), 'cancel row')
}, 60000)

test('search popup tab switches local/add scope and local filters instantly', async () => {
  await waitFor(text => text.includes('[2] Installed ('), 'installed list')
  const loaded = await frame()
  const total = Number(/\[2\] Installed \((\d+)/.exec(loaded)[1])
  const lines = loaded.split('\n')
  const titleIndex = lines.findIndex(line => line.includes('[2] Installed'))
  let pkgName = null
  for (let i = titleIndex + 1; i < lines.length && !pkgName; i++) {
    const match = /\[(?:rep|aur)\] (\S+)/.exec(lines[i])
    if (match)
      pkgName = match[1]
  }
  expect(pkgName).toBeTruthy()
  ui.mockInput.pressKey('2')
  await frame()
  ui.mockInput.pressKey('/')
  let f = await frame()
  expect(f).toContain('local | add')
  expect(f).toContain('filters the current list instantly')
  ui.mockInput.pressTab()
  f = await frame()
  expect(f).toContain('searches AUR + repositories (yay -Ss)')
  ui.mockInput.pressTab()
  f = await frame()
  expect(f).toContain('filters the current list instantly')
  type(pkgName)
  ui.mockInput.pressEnter()
  f = await waitFor(text => /\[2\] Installed \((\d+)/.exec(text)?.[1] !== String(total), 'filter to apply')
  expect(Number(/\[2\] Installed \((\d+)/.exec(f)[1])).toBeLessThan(total)
  expect(f).toContain(` installed ${total} (`)
  ui.mockInput.pressEscape()
  f = await frame()
  expect(Number(/\[2\] Installed \((\d+)/.exec(f)[1])).toBe(total)
}, 60000)
