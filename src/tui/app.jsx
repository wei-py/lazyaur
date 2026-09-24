import { createCliRenderer, decodePasteBytes } from "@opentui/core"
import { createRoot, useKeyboard, usePaste, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { applyTextKey } from "../../vendor/lazy-kit/keys.js"
import { clamp, followOffset } from "../../vendor/lazy-kit/list.js"
import { THEMES } from "../../vendor/lazy-kit/themes.js"
import { createPrivilegeBridge } from "./privilege.js"
import { fetchInstalled, fetchInfo, fetchSearch, fetchUpdates, runStreaming } from "./queries.js"
import { COLORS, setTheme } from "./colors.js"
import { hintSegments, t } from "./i18n.js"
import { loadSettings, saveSettings } from "./settings.js"
import { Hint, ListPanel, MenuBar, Panel, PasswordPopup, Popup, Row, SearchPopup, SettingsPopup } from "./ui.jsx"

const BASE_PANELS = ["updates", "installed", "info"]
const SEARCH_PANELS = ["search", "info"]
const STATUS_HEIGHT = 4
const JOB_ROWS = 3
const MENU_HEIGHT = 1
const HEADER_HEIGHT = 1
// jobs run under setsid: detached from the controlling terminal so children
// (sudo, makepkg) can never scribble over the TUI or prompt behind the back of
// the privilege bridge, and so `x` can kill the whole process group
const SETSID = Bun.which("setsid")
const JOB_GLYPH = {
  queued: "·",
  running: "▶",
  done: "✓",
  failed: "✗",
  canceled: "⊘",
}
const JOB_COLOR = {
  queued: COLORS.muted,
  running: COLORS.warning,
  done: COLORS.present,
  failed: COLORS.warning,
  canceled: COLORS.muted,
}
const KIND_GLYPH = { download: "↓", install: "+", update: "↑" }
export function App() {
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()

  const [updates, setUpdates] = useState(null)
  const [installed, setInstalled] = useState(null)
  const [search, setSearch] = useState(null)
  const [curUpdates, setCurUpdates] = useState(0)
  const [curInstalled, setCurInstalled] = useState(0)
  const [curSearch, setCurSearch] = useState(0)
  const [offUpdates, setOffUpdates] = useState(0)
  const [offInstalled, setOffInstalled] = useState(0)
  const [offSearch, setOffSearch] = useState(0)
  const [focus, setFocus] = useState("updates")
  const [lastList, setLastList] = useState("updates")
  const [promptOpen, setPromptOpen] = useState(false)
  const [info, setInfo] = useState({ loading: true, text: "" })
  const [infoScroll, setInfoScroll] = useState(0)
  const [infoPopup, setInfoPopup] = useState(null)
  const [jobs, setJobs] = useState([])
  const [privQueue, setPrivQueue] = useState([])
  const [pwValue, setPwValue] = useState("")
  const [query, setQuery] = useState("")
  const [log, setLog] = useState([])
  const [language, setLanguage] = useState(() => loadSettings().language)
  const [theme, setThemeState] = useState(() => loadSettings().theme)
  const [settingsCursor, setSettingsCursorState] = useState(0)
  const [settingsPopup, setSettingsPopup] = useState(false)
  const [searchScope, setSearchScope] = useState("local")
  const [localFilter, setLocalFilter] = useState(null)
  const [quitPopup, setQuitPopup] = useState(false)

  const infoCache = useRef(new Map())
  const returnFocus = useRef("updates")
  const jobsRef = useRef([])
  const jobSeq = useRef(0)
  const killers = useRef(new Map())
  const jobChain = useRef(Promise.resolve())
  const bridge = useRef(null)
  // key routing reads refs, not state: keys of one input burst (typed fast or
  // pasted) must all see the mode the first key already switched to
  const prompts = useRef([])
  const searchOpen = useRef(false)
  const infoOpen = useRef(false)
  const queryText = useRef("")
  const pwText = useRef("")
  const settingsOpen = useRef(false)
  const quitOpen = useRef(false)
  const scopeRef = useRef("local")
  const settingsCursorRef = useRef(0)

  const updatesAll = updates ?? []
  const installedAll = installed ?? []
  const searchAll = search?.results ?? []
  const filterText = localFilter ? localFilter.query.toLowerCase() : ""
  const keep = (entry) => entry.name.toLowerCase().includes(filterText)
  const updateList = localFilter?.list === "updates" ? updatesAll.filter(keep) : updatesAll
  const installedList = localFilter?.list === "installed" ? installedAll.filter(keep) : installedAll
  const searchList = localFilter?.list === "search" ? searchAll.filter(keep) : searchAll
  const aurUpdateCount = updateList.filter((entry) => entry.aur).length
  const installedAurCount = installedList.filter((pkg) => pkg.aur).length
  const totalUpdates = updatesAll.length
  const totalInstalled = installedAll.length
  const totalAurUpdates = updatesAll.filter((entry) => entry.aur).length
  const totalAurInstalled = installedAll.filter((pkg) => pkg.aur).length
  const filterEmpty = localFilter ? t(language, 'no results for "{query}"', { query: localFilter.query }) : ""
  const panels = search !== null ? SEARCH_PANELS : BASE_PANELS

  const pushLog = useCallback((line) => {
    setLog((prev) => {
      const next = prev.length >= 200 ? prev.slice(-199) : prev.slice()
      next.push(line)
      return next
    })
  }, [])

  const updatePrompts = useCallback((next) => {
    prompts.current = next
    setPrivQueue(next)
  }, [])

  const refresh = useCallback(async () => {
    const [updateResult, installedResult] = await Promise.allSettled([fetchUpdates(), fetchInstalled()])
    if (updateResult.status === "fulfilled") {
      setUpdates(updateResult.value)
      setCurUpdates((cursor) => clamp(cursor, 0, Math.max(0, updateResult.value.length - 1)))
    } else {
      setUpdates([])
      pushLog(
        `error: ${updateResult.reason instanceof Error ? updateResult.reason.message : updateResult.reason}`,
      )
    }
    if (installedResult.status === "fulfilled") {
      setInstalled(installedResult.value)
      setCurInstalled((cursor) => clamp(cursor, 0, Math.max(0, installedResult.value.length - 1)))
    } else {
      setInstalled([])
      pushLog(
        `error: ${installedResult.reason instanceof Error ? installedResult.reason.message : installedResult.reason}`,
      )
    }
    infoCache.current.clear()
  }, [pushLog])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const instance = createPrivilegeBridge((prompt) => {
      updatePrompts([...prompts.current, prompt])
    })
    bridge.current = instance
    return () => {
      instance.dispose()
      bridge.current = null
    }
  }, [])

  useEffect(() => {
    if (focus === "updates" || focus === "installed") setLastList(focus)
  }, [focus])

  const activeList = focus === "info" ? lastList : focus
  const infoIndex =
    activeList === "installed" ? curInstalled : activeList === "search" ? curSearch : curUpdates
  const infoPkg =
    activeList === "installed"
      ? (installedList[infoIndex]?.name ?? null)
      : activeList === "search"
        ? (searchList[infoIndex]?.name ?? null)
        : (updateList[infoIndex]?.name ?? null)

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
        .catch((error) => {
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

  const patchJob = useCallback((id, patch) => {
    jobsRef.current = jobsRef.current.map((job) => (job.id === id ? { ...job, ...patch } : job))
    setJobs(jobsRef.current)
  }, [])

  const startJob = useCallback(
    (id) => {
      const job = jobsRef.current.find((candidate) => candidate.id === id)
      if (!job || job.state !== "queued") return
      patchJob(id, { state: "running", startedAt: Date.now() })
      pushLog(`$ ${job.cmd.join(" ")}`)
      const argv = SETSID ? ["setsid", ...job.cmd] : job.cmd
      const env = job.askpass === null ? undefined : { SUDO_ASKPASS: job.askpass }
      const { done, kill } = runStreaming(
        argv,
        (line) => {
          patchJob(id, { lastLine: line })
          pushLog(line)
        },
        env,
      )
      killers.current.set(id, kill)
      void done.then((code) => {
        killers.current.delete(id)
        bridge.current?.release(id)
        const current = jobsRef.current.find((candidate) => candidate.id === id)
        if (current?.state === "canceled") return
        patchJob(id, {
          state: code === 0 ? "done" : "failed",
          exitCode: code,
          endedAt: Date.now(),
        })
        pushLog(`exit ${code}`)
        void refresh()
      })
    },
    [patchJob, pushLog, refresh],
  )

  const submitJob = useCallback(
    (cmd, label, kind) => {
      jobSeq.current += 1
      const id = jobSeq.current
      // install/update steps spawn sudo internally: force askpass so the
      // password request always reaches the bridge instead of a tty
      const askpass = kind === "download" ? null : bridge.current?.askpassFor(id, label) ?? null
      const argv = kind === "download" ? cmd : [cmd[0], "--sudoflags=-A", ...cmd.slice(1)]
      const job = {
        id,
        kind,
        label,
        cmd: argv,
        askpass,
        state: "queued",
        lastLine: "",
        startedAt: null,
        endedAt: null,
        exitCode: null,
      }
      jobsRef.current = [...jobsRef.current, job]
      setJobs(jobsRef.current)
      if (kind === "download") {
        startJob(id)
      } else {
        // package transactions lock the alpm db: run them one at a time
        jobChain.current = jobChain.current.then(() => startJob(id))
      }
    },
    [startJob],
  )

  const abortJob = useCallback(
    (id) => {
      const job = jobsRef.current.find((candidate) => candidate.id === id)
      if (!job || (job.state !== "queued" && job.state !== "running")) return
      patchJob(id, { state: "canceled", endedAt: Date.now() })
      bridge.current?.release(id)
      updatePrompts(prompts.current.filter((prompt) => prompt.jobId !== id))
      const kill = killers.current.get(id)
      killers.current.delete(id)
      kill?.()
      pushLog(`canceled ${job.label}`)
    },
    [patchJob, pushLog],
  )

  useEffect(() => {
    const onDestroy = () => {
      for (const kill of killers.current.values()) kill()
      killers.current.clear()
    }
    renderer.once("destroy", onDestroy)
    return () => {
      renderer.off("destroy", onDestroy)
    }
  }, [renderer])

  const infoLines = info.text === "" ? [] : info.text.split("\n")

  const activeJobs = jobs.filter((job) => job.state === "running" || job.state === "queued")
  const settledJobs = jobs.filter((job) => job.state !== "running" && job.state !== "queued")
  const shownJobs = [...activeJobs, ...settledJobs.slice(Math.max(0, settledJobs.length - 1))].slice(
    0,
    JOB_ROWS,
  )
  const statusHeight = STATUS_HEIGHT + shownJobs.length
  const mainHeight = Math.max(6, height - statusHeight - MENU_HEIGHT - HEADER_HEIGHT)
  const updatesHeight = Math.max(3, Math.round(mainHeight * 0.62))
  const installedHeight = Math.max(3, mainHeight - updatesHeight)
  const updatesRows = Math.max(1, updatesHeight - 2)
  const installedRows = Math.max(1, installedHeight - 2)
  const infoRows = Math.max(1, mainHeight - 2)
  const leftWidth = Math.max(30, Math.round(width * 0.45))

  const moveCursor = useCallback(
    (delta) => {
      if (focus === "updates") {
        setCurUpdates((cursor) => {
          const next = clamp(cursor + delta, 0, Math.max(0, updateList.length - 1))
          setOffUpdates((offset) => followOffset(next, updatesRows, updateList.length, offset))
          return next
        })
      } else if (focus === "installed") {
        setCurInstalled((cursor) => {
          const next = clamp(cursor + delta, 0, Math.max(0, installedList.length - 1))
          setOffInstalled((offset) => followOffset(next, installedRows, installedList.length, offset))
          return next
        })
      } else if (focus === "search") {
        setCurSearch((cursor) => {
          const next = clamp(cursor + delta, 0, Math.max(0, searchList.length - 1))
          setOffSearch((offset) => followOffset(next, infoRows, searchList.length, offset))
          return next
        })
      } else {
        setInfoScroll((scroll) => clamp(scroll + delta, 0, Math.max(0, infoLines.length - infoRows)))
      }
    },
    [focus, updateList.length, installedList.length, searchList.length, updatesRows, installedRows, infoLines.length, infoRows],
  )

  const jumpCursor = useCallback(
    (toEnd) => {
      if (focus === "updates") {
        const next = toEnd ? Math.max(0, updateList.length - 1) : 0
        setCurUpdates(next)
        setOffUpdates((offset) => followOffset(next, updatesRows, updateList.length, offset))
      } else if (focus === "installed") {
        const next = toEnd ? Math.max(0, installedList.length - 1) : 0
        setCurInstalled(next)
        setOffInstalled((offset) => followOffset(next, installedRows, installedList.length, offset))
      } else if (focus === "search") {
        const next = toEnd ? Math.max(0, searchList.length - 1) : 0
        setCurSearch(next)
        setOffSearch((offset) => followOffset(next, infoRows, searchList.length, offset))
      } else {
        setInfoScroll(toEnd ? Math.max(0, infoLines.length - infoRows) : 0)
      }
    },
    [focus, updateList.length, installedList.length, searchList.length, updatesRows, installedRows, infoLines.length, infoRows],
  )

  const cyclePanel = useCallback(
    (delta) => {
      setFocus((current) => {
        const index = panels.indexOf(current)
        return panels[(index + delta + panels.length) % panels.length]
      })
    },
    [panels],
  )

  const runSearch = useCallback(
    (raw) => {
      const query = raw.trim()
      if (query === "") return
      setSearch({ query, results: null, error: null, scope: "add" })
      setCurSearch(0)
      setOffSearch(0)
      setFocus("search")
      setLastList("search")
      pushLog(`$ yay -Ss ${query}`)
      fetchSearch(query)
        .then((results) => {
          setSearch((current) => (current?.query === query ? { ...current, results } : current))
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          setSearch((current) =>
            current?.query === query ? { ...current, results: [], error: message } : current,
          )
          pushLog(`error: ${message}`)
        })
    },
    [pushLog],
  )

  const closeSearch = useCallback(() => {
    setSearch(null)
    setFocus(returnFocus.current)
    setLastList(returnFocus.current)
  }, [])

  const openSearch = useCallback(() => {
    if (focus !== "search" && lastList !== "search") {
      returnFocus.current = focus === "info" ? lastList : focus
    }
    searchOpen.current = true
    scopeRef.current = "local"
    setSearchScope("local")
    setPromptOpen(true)
  }, [focus, lastList])

  const selectedName = useCallback(() => {
    if (focus === "updates") return updateList[curUpdates]?.name ?? null
    if (focus === "installed") return installedList[curInstalled]?.name ?? null
    if (focus === "search") return searchList[curSearch]?.name ?? null
    return null
  }, [focus, updateList, curUpdates, installedList, curInstalled, searchList, curSearch])

  const requestQuit = () => {
    if (activeJobs.length > 0) {
      quitOpen.current = true
      setQuitPopup(true)
    } else {
      renderer.destroy()
    }
  }

  const setSettingsCursor = (next) => {
    settingsCursorRef.current = next
    setSettingsCursorState(next)
  }

  const applyLanguage = (next) => {
    setLanguage(next)
    saveSettings({ language: next, theme })
  }

  const applyThemeId = (next) => {
    setThemeState(next)
    setTheme(next)
    saveSettings({ language, theme: next })
  }

  const cycleSettingValue = (delta) => {
    if (settingsCursorRef.current === 0) {
      const order = ["en", "zh"]
      applyLanguage(order[(order.indexOf(language) + delta + order.length) % order.length])
    } else {
      const ids = THEMES.map((entry) => entry.id)
      applyThemeId(ids[(ids.indexOf(theme) + delta + ids.length) % ids.length])
    }
  }

  const restoreList = (saved) => {
    if (saved.list === "updates") {
      setCurUpdates(saved.cursor)
      setOffUpdates(saved.offset)
    } else if (saved.list === "installed") {
      setCurInstalled(saved.cursor)
      setOffInstalled(saved.offset)
    } else {
      setCurSearch(saved.cursor)
      setOffSearch(saved.offset)
    }
  }

  const clearLocalFilter = () => {
    if (!localFilter) return
    const saved = localFilter
    setLocalFilter(null)
    restoreList(saved)
  }

  const applyLocalFilter = (raw) => {
    const query = raw.trim()
    if (query === "") return
    const list
      = search !== null
        ? "search"
        : focus === "installed" || (focus === "info" && lastList === "installed")
          ? "installed"
          : "updates"
    const existing = localFilter
    const previous = existing?.list === list
      ? { cursor: existing.cursor, offset: existing.offset }
      : list === "updates"
        ? { cursor: curUpdates, offset: offUpdates }
        : list === "installed"
          ? { cursor: curInstalled, offset: offInstalled }
          : { cursor: curSearch, offset: offSearch }
    if (existing && existing.list !== list) restoreList(existing)
    setLocalFilter({ list, query, cursor: previous.cursor, offset: previous.offset })
    if (list === "updates") {
      setCurUpdates(0)
      setOffUpdates(0)
    } else if (list === "installed") {
      setCurInstalled(0)
      setOffInstalled(0)
    } else {
      setCurSearch(0)
      setOffSearch(0)
    }
  }

  useKeyboard((key) => {
    const mode = prompts.current.length > 0
      ? "password"
      : settingsOpen.current
        ? "settings"
        : quitOpen.current
          ? "quit"
          : infoOpen.current
          ? "info"
          : searchOpen.current
            ? "search"
            : "main"

    if (key.ctrl && key.name === "c") {
      // inside a flow ctrl+c cancels the flow; in the main view it quits
      if (mode === "password") {
        const prompt = prompts.current[0]
        prompt.resolve(null)
        abortJob(prompt.jobId)
        pwText.current = ""
        setPwValue("")
      } else if (mode === "settings") {
        settingsOpen.current = false
        setSettingsPopup(false)
      } else if (mode === "quit") {
        quitOpen.current = false
        setQuitPopup(false)
      } else if (mode === "info") {
        infoOpen.current = false
        setInfoPopup(null)
      } else if (mode === "search") {
        searchOpen.current = false
        setPromptOpen(false)
      } else {
        requestQuit()
      }
      return
    }

    if (mode === "password") {
      const prompt = prompts.current[0]
      const next = applyTextKey(key, pwText.current, pwText.current.length)
      if (next.cancel) {
        prompt.resolve(null)
        abortJob(prompt.jobId)
        pwText.current = ""
        setPwValue("")
      } else if (next.submit) {
        if (pwText.current !== "") {
          prompt.resolve(pwText.current)
          updatePrompts(prompts.current.slice(1))
          pwText.current = ""
          setPwValue("")
        }
      } else if (next.value !== pwText.current) {
        pwText.current = next.value
        setPwValue(pwText.current)
      }
      return
    }

    if (mode === "settings") {
      if (key.name === "escape") {
        settingsOpen.current = false
        setSettingsPopup(false)
      } else if (key.name === "j" || key.name === "down") {
        setSettingsCursor(1)
      } else if (key.name === "k" || key.name === "up") {
        setSettingsCursor(0)
      } else if (key.name === "enter" || key.name === "return" || key.name === "l" || key.name === "right") {
        cycleSettingValue(1)
      } else if (key.name === "h" || key.name === "left") {
        cycleSettingValue(-1)
      }
      return
    }

    if (mode === "quit") {
      if (key.name === "y" || key.name === "enter" || key.name === "return")
        renderer.destroy()
      else {
        quitOpen.current = false
        setQuitPopup(false)
      }
      return
    }

    if (mode === "info") {
      infoOpen.current = false
      setInfoPopup(null)
      return
    }

    if (mode === "search") {
      const next = applyTextKey(key, queryText.current, queryText.current.length)
      if (next.cancel) {
        searchOpen.current = false
        setPromptOpen(false)
      } else if (next.submit) {
        searchOpen.current = false
        setPromptOpen(false)
        if (scopeRef.current === "local") applyLocalFilter(queryText.current)
        else runSearch(queryText.current)
      } else if (next.value !== queryText.current) {
        queryText.current = next.value
        setQuery(queryText.current)
      } else if (key.name === "tab" || key.name === "backtab") {
        const scope = scopeRef.current === "local" ? "add" : "local"
        scopeRef.current = scope
        setSearchScope(scope)
      }
      return
    }

    const visibleRows = focus === "updates" ? updatesRows : focus === "installed" ? installedRows : infoRows
    const halfPage = Math.max(1, Math.floor(visibleRows / 2))
    if (key.ctrl && (key.name === "d" || key.name === "u")) {
      moveCursor(key.name === "d" ? halfPage : -halfPage)
      return
    }

    // shifted letters arrive as name 'l' + shift with sequence 'L'
    const name
      = key.shift && !key.ctrl && !key.meta && typeof key.sequence === "string" && /^[A-Z]$/.test(key.sequence)
        ? key.sequence
        : key.name
    switch (name) {
      case "q":
        requestQuit()
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
      case "home":
        jumpCursor(false)
        return
      case "G":
      case "end":
        jumpCursor(true)
        return
      case "pageup":
        moveCursor(-halfPage)
        return
      case "pagedown":
        moveCursor(halfPage)
        return
      case "return":
        if (focus !== "info") setFocus("info")
        return
      case "/":
        openSearch()
        return
      case "escape":
        if (localFilter) clearLocalFilter()
        else if (search) closeSearch()
        return
      case "d": {
        const name = selectedName()
        if (name) submitJob(["yay", "-G", name], `yay -G ${name}`, "download")
        return
      }
      case "i": {
        const name = selectedName()
        if (name) submitJob(["yay", "-S", "--noconfirm", name], `yay -S ${name}`, "install")
        return
      }
      case "u": {
        const name = selectedName()
        if (name && (focus === "updates" || focus === "installed")) {
          submitJob(["yay", "-Syu", "--noconfirm", name], `yay -Syu ${name}`, "update")
        }
        return
      }
      case "U":
        if (updateList.length === 0) {
          infoOpen.current = true
          setInfoPopup({ title: t(language, "Updates"), lines: [t(language, "No pending updates.")] })
        } else {
          submitJob(["yay", "-Syu", "--noconfirm"], "yay -Syu", "update")
        }
        return
      case "x": {
        const active = [...jobsRef.current]
          .reverse()
          .find((job) => job.state === "running" || job.state === "queued")
        if (active) abortJob(active.id)
        return
      }
      case "r":
        void refresh()
        if (search) runSearch(search.query)
        return
      case "1":
        if (search) setFocus("search")
        else setFocus("updates")
        return
      case "2":
        if (search) setFocus("info")
        else setFocus("installed")
        return
      case "3":
        if (!search) setFocus("info")
        return
      case ":":
        settingsOpen.current = true
        setSettingsPopup(true)
        setSettingsCursor(0)
        return
      case "L": {
        const nextLanguage = language === "zh" ? "en" : "zh"
        setLanguage(nextLanguage)
        saveSettings({ language: nextLanguage, theme })
        return
      }
      case "?":
        infoOpen.current = true
        setInfoPopup({ title: t(language, "Keys"), lines: t(language, "help_lines") })
        return
      default:
        if (key.sequence === "?") {
          infoOpen.current = true
          setInfoPopup({ title: t(language, "Keys"), lines: t(language, "help_lines") })
        } else if (key.sequence === "/") openSearch()
    }
  })

  usePaste((event) => {
    const text = [...decodePasteBytes(event.bytes)].filter((char) => char >= " ").join("")
    if (text === "") return
    if (prompts.current.length > 0) {
      pwText.current += text
      setPwValue(pwText.current)
    } else if (searchOpen.current) {
      queryText.current += text
      setQuery(queryText.current)
    }
  })

  const tooSmall = width < 40 || height < 14
  if (tooSmall) {
    return (
      <box justifyContent="center" alignItems="center" width="100%" height="100%">
        <text fg={COLORS.warning}>
          {t(language, "terminal too small (min 40x14, current {width}x{height})", { width, height })}
        </text>
      </box>
    )
  }

  const home = (Bun.env.HOME ?? "").replace(/\/$/, "")
  const cwd = process.cwd()
  const cwdLabel = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd

  const updateRows = updateList.map((entry, index) => (
    <Row key={entry.name} selected={focus === "updates" && index === curUpdates}>
      <span fg={entry.aur ? COLORS.aur : COLORS.repo}>{entry.aur ? "[aur]" : "[rep]"}</span>
      <span fg={COLORS.text}> {entry.name.padEnd(24).slice(0, 24)}</span>
      <span fg={COLORS.muted}> {entry.from} -&gt; </span>
      <span fg={COLORS.present}>{entry.to}</span>
      {entry.age ? <span fg={COLORS.muted}> [{entry.age}]</span> : null}
    </Row>
  ))

  const installedRowsList = installedList.map((pkg, index) => (
    <Row key={pkg.name} selected={focus === "installed" && index === curInstalled}>
      <span fg={pkg.aur ? COLORS.aur : COLORS.repo}>{pkg.aur ? "[aur]" : "[rep]"}</span>
      <span fg={COLORS.text}> {pkg.name.padEnd(24).slice(0, 24)}</span>
      <span fg={COLORS.muted}>{pkg.version}</span>
    </Row>
  ))

  const searchRowsList = searchList.map((result, index) => (
    <Row
      key={`${result.origin}/${result.name}`}
      selected={focus === "search" && index === curSearch}
    >
      <span fg={result.aur ? COLORS.aur : COLORS.repo}>{result.aur ? "[aur]" : "[rep]"}</span>
      <span fg={COLORS.text}> {result.name.padEnd(24).slice(0, 24)}</span>
      <span fg={COLORS.present}> {result.version.padEnd(13).slice(0, 13)}</span>
      <span fg={COLORS.muted}> {result.meta}</span>
    </Row>
  ))

  const updateTitle =
    updates === null
      ? `[1] ${t(language, "Updates")} …`
      : `[1] ${t(language, "Updates")} (${updateList.length}${aurUpdateCount > 0 ? `, ${aurUpdateCount} aur` : ""})`
  const installedTitle =
    installed === null
      ? `[2] ${t(language, "Installed")} …`
      : `[2] ${t(language, "Installed")} (${installedList.length}${installedAurCount > 0 ? `, ${installedAurCount} aur` : ""})`
  const searchLabel = search === null
      ? t(language, "Search")
      : `${t(language, "Search")} "${search.query}"`
  const searchBudget = leftWidth - 4 - 4 - ` (${searchList.length})`.length
  const searchTitle =
    `[1] ${searchLabel.length > searchBudget ? `${searchLabel.slice(0, Math.max(1, searchBudget - 1))}…` : searchLabel} (${searchList.length})`
  const searchEmpty =
    search === null
      ? t(language, "press / to search")
      : search.results === null
        ? t(language, "searching…")
        : search.error
          ? t(language, "error: {message}", { message: search.error })
          : localFilter?.list === "search" && searchList.length === 0 && searchAll.length > 0
            ? filterEmpty
            : t(language, 'no results for "{query}"', { query: search.query })

  const lastLog = log.length > 0 ? log[log.length - 1] : ""
  const hiddenJobs = jobs.length - shownJobs.length
  const stateText =
    activeJobs.length > 0
      ? `${t(language, "{count} active", { count: activeJobs.length })}${hiddenJobs > 0 ? ` +${hiddenJobs}` : ""}`
      : updates === null
        ? t(language, "checking…")
        : t(language, "idle")

  const prompt = privQueue[0]
  const chipPlain = "zh en"
  const pathBudget = Math.max(3, width - " LAZYAUR │ ".length - chipPlain.length - 1)
  const shownPath = cwdLabel.length > pathBudget ? `${cwdLabel.slice(0, pathBudget - 1)}…` : cwdLabel
  const headerPad = " ".repeat(Math.max(1, width - " LAZYAUR │ ".length - shownPath.length - chipPlain.length))
  return (
    <box width="100%" height="100%" flexDirection="column">
      <box height={1} flexDirection="row">
        <text wrapMode="none">
          <span> </span>
          <span fg={COLORS.focus}>LAZYAUR</span>
          <span fg={COLORS.border}> │ </span>
          <span fg={COLORS.repo}>{shownPath}</span>
          <span>{headerPad}</span>
        </text>
        <text wrapMode="none">
          <span fg={language === "zh" ? COLORS.focus : COLORS.muted}>zh</span>
          <span fg={COLORS.border}> </span>
          <span fg={language === "en" ? COLORS.focus : COLORS.muted}>en</span>
        </text>
      </box>
      <box flexDirection="row" height={mainHeight}>
        <box flexDirection="column" width={leftWidth} height={mainHeight} overflow="hidden">
          {search !== null ? (
            <ListPanel
              title={searchTitle}
              focused={focus === "search"}
              height={mainHeight}
              width={leftWidth}
              cursor={curSearch}
              offset={offSearch}
              rows={searchRowsList}
              empty={searchEmpty}
            />
          ) : (
            <>
              <ListPanel
                title={updateTitle}
                focused={focus === "updates"}
                height={updatesHeight}
                width={leftWidth}
                cursor={curUpdates}
                offset={offUpdates}
                rows={updateRows}
                empty={
                updates === null
                  ? t(language, "checking for updates…")
                  : localFilter?.list === "updates" && updateList.length === 0
                    ? filterEmpty
                    : t(language, "no pending updates")
              }
              />
              <ListPanel
                title={installedTitle}
                focused={focus === "installed"}
                height={installedHeight}
                width={leftWidth}
                cursor={curInstalled}
                offset={offInstalled}
                rows={installedRowsList}
                empty={
                installed === null
                  ? t(language, "loading…")
                  : localFilter?.list === "installed" && installedList.length === 0
                    ? filterEmpty
                    : t(language, "no installed packages")
              }
              />
            </>
          )}
        </box>
        <Panel
          title={`${search !== null ? "[2]" : "[3]"} ${infoPkg ? `${t(language, "Info")}: ${infoPkg}` : t(language, "Info")}`}
          focused={focus === "info"}
          height={mainHeight}
          width={Math.max(20, width - leftWidth)}
          bottomTitle={
            info.loading
              ? t(language, "loading…")
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
        title={t(language, "Status")}
        titleColor={activeJobs.length > 0 ? COLORS.warning : COLORS.muted}
        borderColor={activeJobs.length > 0 ? COLORS.warning : COLORS.border}
        height={statusHeight}
        flexDirection="column"
        overflow="hidden"
      >
        <box height={1} paddingLeft={1} flexDirection="row">
          <text wrapMode="none">
            <span fg={COLORS.text}>{t(language, "updates")} </span>
            <span fg={totalUpdates > 0 ? COLORS.present : COLORS.muted}>{String(totalUpdates)}</span>
            <span fg={COLORS.muted}> ({totalAurUpdates} aur)</span>
            <span fg={COLORS.border}> │ </span>
            <span fg={COLORS.text}>{t(language, "installed")} </span>
            <span fg={COLORS.muted}>{String(totalInstalled)}</span>
            <span fg={COLORS.muted}> ({totalAurInstalled} aur)</span>
            <span fg={COLORS.border}> │ </span>
            <span fg={activeJobs.length > 0 ? COLORS.warning : COLORS.muted}>{stateText}</span>
          </text>
        </box>
        {shownJobs.map((job) => {
          let detail = job.lastLine
          if (job.state === "queued") detail = t(language, "waiting for other jobs")
          if (job.endedAt !== null && job.startedAt !== null) {
            const seconds = `${Math.max(1, Math.round((job.endedAt - job.startedAt) / 1000))}s`
            detail =
              job.state === "canceled"
                ? t(language, "canceled · {seconds}", { seconds })
                : t(language, "exit {code} · {seconds}", { code: job.exitCode, seconds })
          }
          return (
            <box key={job.id} height={1} paddingLeft={1} flexDirection="row">
              <text wrapMode="none">
                <span fg={JOB_COLOR[job.state]}>{JOB_GLYPH[job.state]}</span>
                <span fg={COLORS.muted}> {KIND_GLYPH[job.kind]} </span>
                <span fg={COLORS.text}>{job.label}</span>
                <span fg={COLORS.muted}>  {detail}</span>
              </text>
            </box>
          )
        })}
        <box height={1} paddingLeft={1} flexDirection="row">
          <text wrapMode="none" fg={activeJobs.length > 0 ? COLORS.warning : COLORS.muted}>
            {lastLog ? `» ${lastLog}` : ""}
          </text>
        </box>
      </box>

      <MenuBar>
        {hintSegments(language, `${focus}_hint`).map(([k, desc], index) => (
          <Hint key={k} k={k} desc={desc} sep={index > 0} />
        ))}
      </MenuBar>

      {prompt ? (
        <PasswordPopup
          width={width}
          height={height}
          language={language}
          label={prompt.label}
          attempt={prompt.attempt}
          valueLength={pwValue.length}
        />
      ) : null}
      {infoPopup ? (
        <Popup title={infoPopup.title} lines={infoPopup.lines} width={width} height={height} language={language} />
      ) : null}
      {promptOpen ? <SearchPopup width={width} height={height} value={query} language={language} scope={searchScope} /> : null}
      {settingsPopup ? (
        <SettingsPopup
          width={width}
          height={height}
          language={language}
          theme={theme}
          cursor={settingsCursor}
        />
      ) : null}
      {quitPopup ? (
        <Popup
          title={t(language, "Quit?")}
          lines={[
            t(language, "jobs still running: {count}", { count: activeJobs.length }),
            t(language, "y quit · n cancel"),
          ]}
          width={width}
          height={height}
          language={language}
        />
      ) : null}
    </box>
  )
}

export async function startTui() {
  setTheme(loadSettings().theme)
  const renderer = await createCliRenderer({ exitOnCtrlC: false })
  createRoot(renderer).render(<App />)
}
