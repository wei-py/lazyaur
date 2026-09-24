const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g
const UPDATE_RE = /^(\S+)\s+(\S+)\s+->\s+(\S+)(?:\s+\[([^\]]+)\])?$/
const SEARCH_HEAD_RE = /^(\S+)\/(\S+)\s+(\S+)(.*)$/

function stripAnsi(text) {
  return text.replace(ANSI_RE, "")
}

function queryFailure(cmd, stdout, stderr, code) {
  if (stdout.trim() !== "" || code <= 1) return null
  const detail = stderr.trim() || `${cmd.join(" ")} exited with code ${code}`
  return new Error(detail)
}

async function capture(cmd) {
  const proc = Bun.spawn({ cmd, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited
  return { stdout, stderr, code }
}

function parsePkgLines(stdout) {
  const pkgs = []
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const sep = trimmed.lastIndexOf(" ")
    if (sep <= 0) continue
    pkgs.push({ name: trimmed.slice(0, sep), version: trimmed.slice(sep + 1) })
  }
  return pkgs
}

async function fetchForeignNames() {
  const cmd = ["pacman", "-Qm"]
  const { stdout, stderr, code } = await capture(cmd)
  const failure = queryFailure(cmd, stdout, stderr, code)
  if (failure) throw failure
  return new Set(parsePkgLines(stdout).map((pkg) => pkg.name))
}

export async function fetchInstalled() {
  const cmd = ["pacman", "-Q"]
  const [result, foreign] = await Promise.all([capture(cmd), fetchForeignNames()])
  const failure = queryFailure(cmd, result.stdout, result.stderr, result.code)
  if (failure) throw failure
  // display order: AUR block first, then repository packages, name-sorted
  // within each (pacman -Q already is) — mirrors the origin grouping of search
  return parsePkgLines(result.stdout)
    .map(({ name, version }) => ({ name, version, aur: foreign.has(name) }))
    .sort((a, b) => Number(b.aur) - Number(a.aur))
}

export async function fetchUpdates() {
  const cmd = ["yay", "-Qu"]
  const [result, aurNames] = await Promise.all([capture(cmd), fetchForeignNames()])
  const failure = queryFailure(cmd, result.stdout, result.stderr, result.code)
  if (failure) throw failure
  const entries = []
  for (const line of result.stdout.split("\n")) {
    const match = UPDATE_RE.exec(line.trim())
    if (!match) continue
    const name = match[1]
    entries.push({
      name,
      from: match[2],
      to: match[3],
      age: match[4],
      aur: aurNames.has(name),
    })
  }
  return entries
}

export async function fetchInfo(name) {
  const remote = await capture(["yay", "-Si", name])
  if (remote.code === 0 && remote.stdout.trim() !== "") {
    return stripAnsi(remote.stdout).trimEnd()
  }

  const local = await capture(["pacman", "-Qi", name])
  if (local.code === 0 && local.stdout.trim() !== "") {
    return stripAnsi(local.stdout).trimEnd()
  }

  const detail = (remote.stderr || local.stderr).trim()
  throw new Error(detail || `package not found: ${name}`)
}

export function parseSearch(stdout) {
  const results = []
  for (const line of stripAnsi(stdout).split("\n")) {
    if (line.trim() === "") continue
    if (/^\s/.test(line)) {
      const last = results[results.length - 1]
      if (last) last.desc = last.desc === "" ? line.trim() : `${last.desc} ${line.trim()}`
      continue
    }
    const match = SEARCH_HEAD_RE.exec(line.trim())
    if (!match) continue
    const origin = match[1]
    results.push({
      name: match[2],
      version: match[3],
      origin,
      aur: origin === "aur",
      meta: match[4].trim(),
      desc: "",
    })
  }
  return results
}

export async function fetchSearch(query) {
  const cmd = ["yay", "--color", "never", "-Ss", "--", query]
  const { stdout, stderr, code } = await capture(cmd)
  const failure = queryFailure(cmd, stdout, stderr, code)
  if (failure) throw failure
  return parseSearch(stdout)
}

export function runStreaming(cmd, onLine, env) {
  const proc = Bun.spawn({
    cmd,
    stdout: "pipe",
    stderr: "pipe",
    env: env ? { ...Bun.env, ...env } : undefined,
  })
  const kill = () => {
    // kills the whole process group when the command was spawned via setsid,
    // so builds (makepkg) die with their parent instead of being orphaned
    try {
      process.kill(-proc.pid, "SIGTERM")
    } catch {
      try {
        proc.kill("SIGTERM")
      } catch {
        // process already exited
      }
    }
  }

  const pump = async (stream) => {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let carry = ""
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      carry += stripAnsi(decoder.decode(value, { stream: true }))
      const parts = carry.split(/\r\n|\r|\n/)
      carry = parts.pop() ?? ""
      for (const part of parts) onLine(part)
    }
    carry += decoder.decode()
    if (carry) onLine(carry)
  }

  const done = (async () => {
    await Promise.all([pump(proc.stdout), pump(proc.stderr)])
    return await proc.exited
  })()

  return { done, kill }
}
