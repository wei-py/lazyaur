export async function updateCommand(extraArgs: string[]): Promise<void> {
  if (!Bun.which("yay")) {
    console.error("lazyaur: yay not found in PATH")
    process.exitCode = 1
    return
  }

  const proc = Bun.spawn({
    cmd: ["yay", "-Syu", ...extraArgs],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })

  process.exitCode = await proc.exited
}
