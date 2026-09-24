# lazyaur

Lazy AUR/system package manager TUI — a [yay](https://github.com/Jguer/yay) frontend built with [Bun](https://bun.com) and [OpenTUI](https://github.com/anomalyco/opentui).

## Install

Grab the tarball for your platform from [GitHub Releases](https://github.com/wei-py/lazyaur/releases):

```bash
tar xzf lazyaur-linux-x64.tar.gz
sudo install -m755 lazyaur /usr/local/bin/lazyaur
```

`yay` must be in `PATH`.

## Usage

```bash
lazyaur                 # open the TUI
lazyaur update [args]   # upgrade system + AUR packages (yay -Syu)
```

## Development

```bash
bun install
bun run start        # run the TUI
```

CI (`.github/workflows/ci.yml`) smoke-tests the CLI and compiles all release targets on every push/PR. Pushing a `v*` tag builds standalone binaries for linux/macos (x64 + arm64) and attaches them to a GitHub Release (`.github/workflows/release.yml`).
