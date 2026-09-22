export type UpdateEntry = {
  name: string
  from: string
  to: string
  age?: string
  aur: boolean
}

export type ForeignPkg = {
  name: string
  version: string
}

export type SearchResult = {
  name: string
  version: string
  origin: string
  aur: boolean
  meta: string
  desc: string
}

const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g
const UPDATE_RE = /^(\S+)\s+(\S+)\s+->\s+(\S+)(?:\s+\[([^\]]+)\])?$/
const SEARCH_HEAD_RE = /^(\S+)\/(\S+)\s+(\S+)(.*)$/

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "")
}

function queryFailure(cmd: string[], stdout: string, stderr: string, code: number): Error | null {
  if (stdout.trim() !== "" || code <= 1) return null
  const detail = stderr.trim() || `${cmd.join(" ")} exited with code ${code}`
  return new Error(detail)
}

async function capture(cmd: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn({ cmd, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited
  return { stdout, stderr, code }
}

export async function fetchForeign(): Promise<ForeignPkg[]> {
  const cmd = ["pacman", "-Qm"]
  const { stdout, stderr, code } = await capture(cmd)
  const failure = queryFailure(cmd, stdout, stderr, code)
  if (failure) throw failure

  const pkgs: ForeignPkg[] = []
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const sep = trimmed.lastIndexOf(" ")
    if (sep <= 0) continue
    pkgs.push({ name: trimmed.slice(0, sep), version: trimmed.slice(sep + 1) })
  }
  return pkgs
}

export async function fetchUpdates(): Promise<UpdateEntry[]> {
  const cmd = ["yay", "-Qu"]
  const [result, foreign] = await Promise.all([capture(cmd), fetchForeign()])
  const failure = queryFailure(cmd, result.stdout, result.stderr, result.code)
  if (failure) throw failure

  const aurNames = new Set(foreign.map((pkg) => pkg.name))
  const entries: UpdateEntry[] = []
  for (const line of result.stdout.split("\n")) {
    const match = UPDATE_RE.exec(line.trim())
    if (!match) continue
    const name = match[1]!
    entries.push({
      name,
      from: match[2]!,
      to: match[3]!,
      age: match[4],
      aur: aurNames.has(name),
    })
  }
  return entries
}

export async function fetchInfo(name: string): Promise<string> {
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

export function parseSearch(stdout: string): SearchResult[] {
  const results: SearchResult[] = []
  for (const line of stripAnsi(stdout).split("\n")) {
    if (line.trim() === "") continue
    if (/^\s/.test(line)) {
      const last = results[results.length - 1]
      if (last) last.desc = last.desc === "" ? line.trim() : `${last.desc} ${line.trim()}`
      continue
    }
    const match = SEARCH_HEAD_RE.exec(line.trim())
    if (!match) continue
    const origin = match[1]!
    results.push({
      name: match[2]!,
      version: match[3]!,
      origin,
      aur: origin === "aur",
      meta: match[4]!.trim(),
      desc: "",
    })
  }
  return results
}

export async function fetchSearch(query: string): Promise<SearchResult[]> {
  const cmd = ["yay", "--color", "never", "-Ss", "--", query]
  const { stdout, stderr, code } = await capture(cmd)
  const failure = queryFailure(cmd, stdout, stderr, code)
  if (failure) throw failure
  return parseSearch(stdout)
}

export function runStreaming(
  cmd: string[],
  onLine: (line: string) => void,
): { done: Promise<number>; kill: () => void } {
  const proc = Bun.spawn({ cmd, stdout: "pipe", stderr: "pipe" })
  const kill = (): void => {
    try {
      proc.kill("SIGTERM")
    } catch {
      // process already exited
    }
  }

  const pump = async (stream: ReadableStream<Uint8Array>): Promise<void> => {
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
