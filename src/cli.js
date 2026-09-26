#!/usr/bin/env bun
import pkg from "../package.json"
import { updateCommand } from "./commands/update.js"
import { startTui } from "./tui/app.jsx"
import { t } from "./tui/i18n.js"
import { loadSettings } from "./tui/settings.js"

function usage() {
  return t(loadSettings().language, "usage")
}

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0]

  if (cmd === undefined) {
    await startTui()
    return
  }

  switch (cmd) {
    case "-v":
    case "--version":
    case "version":
      console.log(`lazyaur ${pkg.version}`)
      return
    case "-h":
    case "--help":
    case "help":
      console.log(usage())
      return
    case "update":
      await updateCommand(args.slice(1))
      return
    default:
      console.error(`lazyaur: unknown argument '${cmd}'`)
      console.error(usage())
      process.exitCode = 1
  }
}

await main()
