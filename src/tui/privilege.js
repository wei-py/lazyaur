import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Bridges sudo's askpass program to the TUI: when a background job hits a step
// that needs root, sudo runs the per-job askpass script, which connects back to
// the loopback socket below. That raises a password popup at exactly the moment
// the privilege is needed — jobs that never need root never prompt.
//
// Transport: the askpass script speaks one line of bash /dev/tcp. It sends a
// per-job random token (only readable by this user, script lives in a 0700
// dir) and then reads one line back: the password. The password never touches
// the disk and is only ever written to the socket that presented the token.

const ASKPASS_SCRIPT = `#!/bin/bash
exec 3<>/dev/tcp/127.0.0.1/__PORT__ || exit 1
printf '%s\\n' '__TOKEN__' >&3
IFS= read -r -u 3 pass || exit 1
printf '%s\\n' "$pass"
`

export function createPrivilegeBridge(onPrompt) {
  const dir = mkdtempSync(join(tmpdir(), "lazyaur-askpass-"))
  chmodSync(dir, 0o700)
  const entries = new Map()
  const jobs = new Map()
  const buffers = new WeakMap()
  const owners = new WeakMap()

  const settle = (entry, password) => {
    entry.prompting = false
    if (password === null) {
      // canceled: close without an answer so the askpass script exits non-zero
      // and sudo aborts without prompting again (later connections are refused)
      entry.done = true
    }
    for (const socket of entry.sockets) {
      if (password !== null) socket.write(`${password}\n`)
      socket.end()
    }
    entry.sockets.clear()
  }

  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      data(socket, data) {
        const buf = (buffers.get(socket) ?? "") + String(data)
        const newline = buf.indexOf("\n")
        if (newline < 0) {
          buffers.set(socket, buf)
          return
        }
        buffers.delete(socket)
        const entry = entries.get(buf.slice(0, newline).trim())
        if (!entry || entry.done) {
          socket.end()
          return
        }
        owners.set(socket, entry)
        entry.sockets.add(socket)
        if (!entry.prompting) {
          entry.prompting = true
          entry.attempt += 1
          onPrompt({
            jobId: entry.jobId,
            label: entry.label,
            attempt: entry.attempt,
            resolve: (password) => settle(entry, password),
          })
        }
        // A concurrent askpass for the same auth cycle attaches to the open
        // popup and gets the same answer.
      },
      close(socket) {
        const entry = owners.get(socket)
        entry?.sockets.delete(socket)
      },
      error(socket) {
        const entry = owners.get(socket)
        entry?.sockets.delete(socket)
      },
    },
  })

  return {
    askpassFor(jobId, label) {
      const token = crypto.randomUUID().replaceAll("-", "")
      const entry = {
        jobId,
        label,
        attempt: 0,
        prompting: false,
        done: false,
        sockets: new Set(),
      }
      entries.set(token, entry)
      jobs.set(jobId, entry)
      const path = join(dir, `askpass-${jobId}`)
      writeFileSync(path, ASKPASS_SCRIPT.replace("__PORT__", String(server.port)).replace("__TOKEN__", token))
      chmodSync(path, 0o700)
      return path
    },
    release(jobId) {
      const entry = jobs.get(jobId)
      if (!entry) return
      settle(entry, null)
    },
    dispose() {
      server.stop(true)
      for (const entry of entries.values()) {
        entry.done = true
        entry.sockets.clear()
      }
      entries.clear()
      jobs.clear()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
