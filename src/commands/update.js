export async function updateCommand(extraArgs) {
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
