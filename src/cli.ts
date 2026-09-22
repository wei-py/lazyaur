#!/usr/bin/env bun
import pkg from "../package.json"
import { updateCommand } from "./commands/update"
import { startTui } from "./tui/app"

const USAGE = `lazyaur - lazy AUR/system package manager TUI (yay frontend)

Usage:
  lazyaur                 Open the TUI (default)
  lazyaur update [args]   Upgrade system and AUR packages (yay -Syu [args])
  lazyaur -v, --version   Print version
  lazyaur -h, --help      Show this help

Keys in the TUI:
  j/k or arrows   move cursor / scroll    h/l or arrows   switch panel
  tab/shift+tab   cycle panels            enter           open info panel
  /               search AUR + repos      esc             close search / cancel
  d               download PKGBUILD       i               download + install
  u               update selected         U               update all
  r               refresh                 q               quit
  ?               help                    y/n             confirm/cancel popup
`

async function main(): Promise<void> {
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
      console.log(USAGE)
      return
    case "update":
      await updateCommand(args.slice(1))
      return
    default:
      console.error(`lazyaur: unknown argument '${cmd}'`)
      console.error(USAGE)
      process.exitCode = 1
  }
}

await main()
