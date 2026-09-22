import type { ReactNode } from "react"

export const COLORS = {
  focus: "#7AA2F7",
  border: "#3C4361",
  cursor: "#2C3550",
  dim: "#6C7390",
  text: "#C0CAF5",
  warn: "#E0AF68",
  aur: "#BB9AF7",
  repo: "#7AA2F7",
  ok: "#9ECE6A",
}

type PanelProps = {
  title: string
  focused: boolean
  height?: number
  width?: number
  bottomTitle?: string
  children?: ReactNode
}

export function Panel(props: PanelProps) {
  return (
    <box
      border
      title={props.title}
      titleColor={props.focused ? COLORS.focus : COLORS.dim}
      bottomTitle={props.bottomTitle}
      bottomTitleAlignment="right"
      borderColor={props.focused ? COLORS.focus : COLORS.border}
      height={props.height}
      width={props.width}
      flexDirection="column"
      overflow="hidden"
    >
      {props.children}
    </box>
  )
}

export function Row(props: { selected: boolean; children?: ReactNode }) {
  return (
    <box height={1} backgroundColor={props.selected ? COLORS.cursor : undefined} paddingLeft={1}>
      <text wrapMode="none">{props.children}</text>
    </box>
  )
}

export function ListPanel(props: {
  title: string
  focused: boolean
  height: number
  cursor: number
  offset: number
  rows: ReactNode[]
  empty: string
}) {
  const inner = Math.max(1, props.height - 2)
  const visible =
    props.rows.length > 0
      ? props.rows.slice(props.offset, props.offset + inner)
      : [
          <Row key="empty" selected={props.focused}>
            {props.empty}
          </Row>,
        ]
  return (
    <Panel title={props.title} focused={props.focused} height={props.height}>
      {visible}
    </Panel>
  )
}

export function MenuBar(props: { children?: ReactNode }) {
  return (
    <text wrapMode="none" paddingLeft={1} flexDirection="row">
      {props.children}
    </text>
  )
}

export function Hint(props: { k: string; desc: string; sep?: boolean }) {
  return (
    <span>
      {props.sep ? <span fg={COLORS.border}>  ·  </span> : null}
      <span fg={COLORS.focus} attributes={1}>
        {props.k}
      </span>
      <span fg={COLORS.dim}> {props.desc}</span>
    </span>
  )
}

export function Popup(props: {
  title: string
  lines: string[]
  width: number
  height: number
  confirm: boolean
}) {
  const popupWidth = Math.min(props.width - 4, 64)
  const contentHeight = Math.max(3, props.lines.length + 2)
  const left = Math.max(1, Math.round((props.width - popupWidth) / 2))
  const top = Math.max(1, Math.round((props.height - contentHeight) / 2))
  return (
    <box
      position="absolute"
      left={left}
      top={top}
      width={popupWidth}
      height={contentHeight}
      border
      borderStyle="rounded"
      borderColor={COLORS.focus}
      title={props.title}
      titleColor={COLORS.focus}
      titleAlignment="center"
      bottomTitle={props.confirm ? "y confirm · n cancel" : "press any key to close"}
      bottomTitleAlignment="center"
      backgroundColor="#1F2438"
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      overflow="hidden"
    >
      {props.lines.map((line, i) => (
        <text key={i} wrapMode="none">
          {line}
        </text>
      ))}
    </box>
  )
}

export function SearchPopup(props: {
  width: number
  height: number
  onSubmit: (value: string) => void
}) {
  const popupWidth = Math.min(props.width - 4, 64)
  const contentHeight = 4
  const left = Math.max(1, Math.round((props.width - popupWidth) / 2))
  const top = Math.max(1, Math.round((props.height - contentHeight) / 2))
  return (
    <box
      position="absolute"
      left={left}
      top={top}
      width={popupWidth}
      height={contentHeight}
      border
      borderStyle="rounded"
      borderColor={COLORS.focus}
      title="Search"
      titleColor={COLORS.focus}
      titleAlignment="center"
      bottomTitle="enter search · esc cancel"
      bottomTitleAlignment="center"
      backgroundColor="#1F2438"
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      overflow="hidden"
    >
      <input
        focused
        placeholder="package name or keyword"
        onSubmit={(value: unknown) => props.onSubmit(String(value))}
        textColor={COLORS.text}
        cursorColor={COLORS.focus}
        backgroundColor="#1F2438"
        focusedBackgroundColor="#1F2438"
      />
      <text wrapMode="none" fg={COLORS.dim}>
        searches AUR + repositories (yay -Ss)
      </text>
    </box>
  )
}
