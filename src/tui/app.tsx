import { createCliRenderer, type KeyEvent } from "@opentui/core"
import { createRoot, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import {
  fetchForeign,
  fetchInfo,
  fetchUpdates,
  runStreaming,
  type ForeignPkg,
  type UpdateEntry,
} from "./queries"
import { COLORS, Hint, ListPanel, MenuBar, Panel, Popup, Row } from "./ui"

type FocusPanel = "updates" | "aur" | "info"
type PopupState =
  | { kind: "confirm"; title: string; lines: string[]; onConfirm: () => void }
  | { kind: "info"; title: string; lines: string[] }

const PANELS: FocusPanel[] = ["updates", "aur", "info"]
const STATUS_HEIGHT = 4
const MENU_HEIGHT = 1
const HELP_LINES = [
  "j / k or arrows    move cursor, scroll info",
  "h / l or arrows    switch to previous / next panel",
  "tab / shift+tab    cycle panels forward / backward",
  "g / G              jump to top / bottom of panel",
  "enter              open the info panel",
  "u                  update the selected package",
  "U                  update all pending packages",
  "r                  refresh queries",
  "y / n              confirm / cancel a popup",
  "q                  quit",
]

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

function followOffset(cursor: number, visible: number, length: number, offset: number): number {
  if (visible <= 0) return offset
  let next = offset
  if (cursor < next) next = cursor
  if (cursor >= next + visible) next = cursor - visible + 1
  return clamp(next, 0, Math.max(0, length - visible))
}

function tildePath(path: string): string {
  const home = (Bun.env.HOME ?? "").replace(/\/$/, "")
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path
}

export function App() {
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()

  const [updates, setUpdates] = useState<UpdateEntry[] | null>(null)
  const [foreign, setForeign] = useState<ForeignPkg[] | null>(null)
  const [curUpdates, setCurUpdates] = useState(0)
  const [curAur, setCurAur] = useState(0)
  const [offUpdates, setOffUpdates] = useState(0)
  const [offAur, setOffAur] = useState(0)
  const [focus, setFocus] = useState<FocusPanel>("updates")
  const [lastList, setLastList] = useState<"updates" | "aur">("updates")
  const [info, setInfo] = useState<{ loading: boolean; text: string }>({ loading: true, text: "" })
  const [infoScroll, setInfoScroll] = useState(0)
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])

  const infoCache = useRef(new Map<string, string>())
  const killRef = useRef<(() => void) | null>(null)

  const updateList = updates ?? []
  const foreignList = foreign ?? []
  const aurUpdateCount = updateList.filter((entry) => entry.aur).length

  const mainHeight = Math.max(6, height - STATUS_HEIGHT - MENU_HEIGHT)
  const updatesHeight = Math.max(3, Math.round(mainHeight * 0.62))
  const aurHeight = Math.max(3, mainHeight - updatesHeight)
  const updatesRows = Math.max(1, updatesHeight - 2)
  const aurRows = Math.max(1, aurHeight - 2)
  const infoRows = Math.max(1, mainHeight - 2)
  const leftWidth = Math.max(30, Math.round(width * 0.45))

  const pushLog = useCallback((line: string) => {
    setLog((prev) => {
      const next = prev.length >= 200 ? prev.slice(-199) : prev.slice()
      next.push(line)
      return next
    })
  }, [])

  const refresh = useCallback(async () => {
    const [updateResult, foreignResult] = await Promise.allSettled([fetchUpdates(), fetchForeign()])
    if (updateResult.status === "fulfilled") {
      setUpdates(updateResult.value)
      setCurUpdates((cursor) => clamp(cursor, 0, Math.max(0, updateResult.value.length - 1)))
    } else {
      setUpdates([])
      pushLog(
        `error: ${updateResult.reason instanceof Error ? updateResult.reason.message : updateResult.reason}`,
      )
    }
    if (foreignResult.status === "fulfilled") {
      setForeign(foreignResult.value)
      setCurAur((cursor) => clamp(cursor, 0, Math.max(0, foreignResult.value.length - 1)))
    } else {
      setForeign([])
      pushLog(
        `error: ${foreignResult.reason instanceof Error ? foreignResult.reason.message : foreignResult.reason}`,
      )
    }
    infoCache.current.clear()
  }, [pushLog])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (focus === "updates" || focus === "aur") setLastList(focus)
  }, [focus])

  const infoList = focus === "info" ? lastList : focus === "aur" ? "aur" : "updates"
  const infoIndex = infoList === "aur" ? curAur : curUpdates
  const infoPkg =
    infoList === "aur" ? (foreignList[infoIndex]?.name ?? null) : (updateList[infoIndex]?.name ?? null)

  useEffect(() => {
    if (!infoPkg) {
      setInfo({ loading: false, text: "" })
      return
    }
    const cached = infoCache.current.get(infoPkg)
    if (cached !== undefined) {
      setInfo({ loading: false, text: cached })
      return
    }
    let stale = false
    setInfo({ loading: true, text: "" })
    const timer = setTimeout(() => {
      fetchInfo(infoPkg)
        .then((text) => {
          infoCache.current.set(infoPkg, text)
          if (!stale) setInfo({ loading: false, text })
        })
        .catch((error: unknown) => {
          if (!stale) {
            setInfo({
              loading: false,
              text: `error: ${error instanceof Error ? error.message : String(error)}`,
            })
          }
        })
    }, 120)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [infoPkg])

  useEffect(() => {
    const onDestroy = () => {
      killRef.current?.()
    }
    renderer.once("destroy", onDestroy)
    return () => {
      renderer.off("destroy", onDestroy)
    }
  }, [renderer])

  const runCommand = useCallback(
    (cmd: string[], label: string) => {
      setRunning(label)
      pushLog(`$ ${cmd.join(" ")}`)
      const { done, kill } = runStreaming(cmd, pushLog)
      killRef.current = kill
      void done.then((code) => {
        killRef.current = null
        setRunning(null)
        pushLog(`exit ${code}`)
        void refresh()
      })
    },
    [pushLog, refresh],
  )

  const infoLines = info.text === "" ? [] : info.text.split("\n")

  const moveCursor = useCallback(
    (delta: number) => {
      if (focus === "updates") {
        setCurUpdates((cursor) => {
          const next = clamp(cursor + delta, 0, Math.max(0, updateList.length - 1))
          setOffUpdates((offset) => followOffset(next, updatesRows, updateList.length, offset))
          return next
        })
      } else if (focus === "aur") {
        setCurAur((cursor) => {
          const next = clamp(cursor + delta, 0, Math.max(0, foreignList.length - 1))
          setOffAur((offset) => followOffset(next, aurRows, foreignList.length, offset))
          return next
        })
      } else {
        setInfoScroll((scroll) => clamp(scroll + delta, 0, Math.max(0, infoLines.length - infoRows)))
      }
    },
    [focus, updateList.length, foreignList.length, updatesRows, aurRows, infoLines.length, infoRows],
  )

  const jumpCursor = useCallback(
    (toEnd: boolean) => {
      if (focus === "updates") {
        const next = toEnd ? Math.max(0, updateList.length - 1) : 0
        setCurUpdates(next)
        setOffUpdates((offset) => followOffset(next, updatesRows, updateList.length, offset))
      } else if (focus === "aur") {
        const next = toEnd ? Math.max(0, foreignList.length - 1) : 0
        setCurAur(next)
        setOffAur((offset) => followOffset(next, aurRows, foreignList.length, offset))
      } else {
        setInfoScroll(toEnd ? Math.max(0, infoLines.length - infoRows) : 0)
      }
    },
    [focus, updateList.length, foreignList.length, updatesRows, aurRows, infoLines.length, infoRows],
  )

  const cyclePanel = useCallback((delta: number) => {
    setFocus((current) => {
      const index = PANELS.indexOf(current)
      return PANELS[(index + delta + PANELS.length) % PANELS.length]!
    })
  }, [])

  const updateSelected = useCallback(() => {
    if (focus === "updates") {
      const entry = updateList[curUpdates]
      if (!entry) return
      setPopup({
        kind: "confirm",
        title: "Update package",
        lines: [
          `${entry.name}  ${entry.from} -> ${entry.to}`,
          entry.aur ? "AUR package (PKGBUILD review skipped)" : "repository package",
        ],
        onConfirm: () => runCommand(["yay", "-Syu", "--noconfirm", entry.name], `yay -Syu ${entry.name}`),
      })
    } else if (focus === "aur") {
      const pkg = foreignList[curAur]
      if (!pkg) return
      setPopup({
        kind: "confirm",
        title: "Update package",
        lines: [`${pkg.name}  ${pkg.version}`, "AUR package (PKGBUILD review skipped)"],
        onConfirm: () => runCommand(["yay", "-Syu", "--noconfirm", pkg.name], `yay -Syu ${pkg.name}`),
      })
    }
  }, [focus, updateList, curUpdates, foreignList, curAur, runCommand])

  const updateAll = useCallback(() => {
    if (updateList.length === 0) {
      setPopup({ kind: "info", title: "Updates", lines: ["No pending updates."] })
      return
    }
    setPopup({
      kind: "confirm",
      title: "Update all",
      lines: [
        `Update ${updateList.length} packages?`,
        `${updateList.length - aurUpdateCount} repository, ${aurUpdateCount} AUR`,
        "AUR PKGBUILD review will be skipped",
      ],
      onConfirm: () => runCommand(["yay", "-Syu", "--noconfirm"], "yay -Syu"),
    })
  }, [updateList, aurUpdateCount, runCommand])

  useKeyboard((key: KeyEvent) => {
    if (popup) {
      if (popup.kind === "confirm") {
        if (key.name === "y") {
          const confirm = popup.onConfirm
          setPopup(null)
          confirm()
        } else if (key.name === "n" || key.name === "escape") {
          setPopup(null)
        }
      } else {
        setPopup(null)
      }
      return
    }

    const busy = running !== null

    switch (key.name) {
      case "q":
        if (!busy) renderer.destroy()
        return
      case "j":
      case "down":
        moveCursor(1)
        return
      case "k":
      case "up":
        moveCursor(-1)
        return
      case "h":
      case "left":
        cyclePanel(-1)
        return
      case "l":
      case "right":
        cyclePanel(1)
        return
      case "tab":
        cyclePanel(key.shift ? -1 : 1)
        return
      case "backtab":
        cyclePanel(-1)
        return
      case "g":
        jumpCursor(false)
        return
      case "G":
        jumpCursor(true)
        return
      case "return":
        if (focus !== "info") setFocus("info")
        return
      case "u":
        if (!busy && focus !== "info") updateSelected()
        return
      case "U":
        if (!busy) updateAll()
        return
      case "r":
        if (!busy) void refresh()
        return
      case "?":
        setPopup({ kind: "info", title: "Keys", lines: HELP_LINES })
        return
      default:
        if (key.sequence === "?") setPopup({ kind: "info", title: "Keys", lines: HELP_LINES })
    }
  })

  const tooSmall = width < 40 || height < 14
  if (tooSmall) {
    return (
      <box justifyContent="center" alignItems="center" width="100%" height="100%">
        <text fg={COLORS.warn}>
          terminal too small (min 40x14, current {width}x{height})
        </text>
      </box>
    )
  }

  const updateRows: ReactNode[] = updateList.map((entry, index) => (
    <Row key={entry.name} selected={focus === "updates" && index === curUpdates}>
      <span fg={entry.aur ? COLORS.aur : COLORS.repo}>{entry.aur ? "[aur]" : "[rep]"}</span>
      <span fg={COLORS.text}> {entry.name.padEnd(24).slice(0, 24)}</span>
      <span fg={COLORS.dim}> {entry.from} -&gt; </span>
      <span fg={COLORS.ok}>{entry.to}</span>
      {entry.age ? <span fg={COLORS.dim}> [{entry.age}]</span> : null}
    </Row>
  ))

  const aurRowsList: ReactNode[] = foreignList.map((pkg, index) => (
    <Row key={pkg.name} selected={focus === "aur" && index === curAur}>
      <span fg={COLORS.text}>{pkg.name.padEnd(28).slice(0, 28)}</span>
      <span fg={COLORS.dim}>{pkg.version}</span>
    </Row>
  ))

  const updateTitle =
    updates === null
      ? "Updates …"
      : `Updates (${updateList.length}${aurUpdateCount > 0 ? `, ${aurUpdateCount} aur` : ""})`
  const aurTitle = foreign === null ? "AUR …" : `AUR installed (${foreignList.length})`

  const lastLog = log.length > 0 ? log[log.length - 1]! : ""
  const stateText = running !== null ? `running: ${running}` : updates === null ? "checking…" : "idle"

  const hints: Record<FocusPanel, [string, string][]> = {
    updates: [
      ["j/k", "move"],
      ["h/l", "panels"],
      ["enter", "info"],
      ["u", "update"],
      ["U", "update all"],
      ["r", "refresh"],
      ["?", "help"],
      ["q", "quit"],
    ],
    aur: [
      ["j/k", "move"],
      ["h/l", "panels"],
      ["enter", "info"],
      ["u", "update"],
      ["r", "refresh"],
      ["?", "help"],
      ["q", "quit"],
    ],
    info: [
      ["j/k", "scroll"],
      ["h/l", "panels"],
      ["g/G", "top/end"],
      ["r", "refresh"],
      ["?", "help"],
      ["q", "quit"],
    ],
  }

  return (
    <box width="100%" height="100%" flexDirection="column">
      <box flexDirection="row" height={mainHeight}>
        <box flexDirection="column" width={leftWidth} height={mainHeight} overflow="hidden">
          <ListPanel
            title={updateTitle}
            focused={focus === "updates"}
            height={updatesHeight}
            cursor={curUpdates}
            offset={offUpdates}
            rows={updateRows}
            empty={updates === null ? "checking for updates…" : "no pending updates"}
          />
          <ListPanel
            title={aurTitle}
            focused={focus === "aur"}
            height={aurHeight}
            cursor={curAur}
            offset={offAur}
            rows={aurRowsList}
            empty={foreign === null ? "loading…" : "no foreign packages"}
          />
        </box>
        <Panel
          title={infoPkg ? `Info: ${infoPkg}` : "Info"}
          focused={focus === "info"}
          height={mainHeight}
          width={Math.max(20, width - leftWidth)}
          bottomTitle={
            info.loading
              ? "loading…"
              : infoLines.length > infoRows
                ? `${infoScroll + 1}-${Math.min(infoScroll + infoRows, infoLines.length)}/${infoLines.length}`
                : undefined
          }
        >
          <text wrapMode="none" fg={COLORS.text}>
            {infoLines.slice(infoScroll, infoScroll + infoRows).join("\n")}
          </text>
        </Panel>
      </box>

      <box
        border
        title="Status"
        titleColor={running !== null ? COLORS.warn : COLORS.dim}
        borderColor={running !== null ? COLORS.warn : COLORS.border}
        height={STATUS_HEIGHT}
        flexDirection="column"
        overflow="hidden"
      >
        <box height={1} paddingLeft={1} flexDirection="row">
          <text wrapMode="none">
            <span fg={COLORS.repo}>{tildePath(process.cwd())}</span>
            <span fg={COLORS.border}> │ </span>
            <span fg={COLORS.text}>updates </span>
            <span fg={updateList.length > 0 ? COLORS.ok : COLORS.dim}>{String(updateList.length)}</span>
            <span fg={COLORS.dim}> ({aurUpdateCount} aur)</span>
            <span fg={COLORS.border}> │ </span>
            <span fg={COLORS.text}>foreign </span>
            <span fg={COLORS.dim}>{String(foreignList.length)}</span>
            <span fg={COLORS.border}> │ </span>
            <span fg={running !== null ? COLORS.warn : COLORS.dim}>{stateText}</span>
          </text>
        </box>
        <box height={1} paddingLeft={1} flexDirection="row">
          <text wrapMode="none" fg={running !== null ? COLORS.warn : COLORS.dim}>
            {lastLog ? `» ${lastLog}` : ""}
          </text>
        </box>
      </box>

      <MenuBar>
        {running !== null ? (
          <Hint k="ctrl+c" desc="abort" />
        ) : (
          hints[focus].map(([k, desc], index) => (
            <Hint key={k} k={k} desc={desc} sep={index > 0} />
          ))
        )}
      </MenuBar>

      {popup ? (
        <Popup
          title={popup.title}
          lines={popup.lines}
          width={width}
          height={height}
          confirm={popup.kind === "confirm"}
        />
      ) : null}
    </box>
  )
}

export async function startTui(): Promise<void> {
  const renderer = await createCliRenderer({ exitOnCtrlC: true })
  createRoot(renderer).render(<App />)
}
