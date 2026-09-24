import { themeName } from "../../vendor/lazy-kit/themes.js"
import { COLORS } from "./colors.js"
import { t } from "./i18n.js"

export function Panel(props) {
  const budget = props.width ? Math.max(4, props.width - 4) : Number.POSITIVE_INFINITY
  const title
    = props.title.length > budget ? `${props.title.slice(0, Math.max(1, budget - 1))}…` : props.title
  return (
    <box
      border
      title={title}
      titleColor={props.focused ? COLORS.focus : COLORS.muted}
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

export function Row(props) {
  return (
    <box height={1} backgroundColor={props.selected ? COLORS.selection : undefined} paddingLeft={1}>
      <text wrapMode="none">{props.children}</text>
    </box>
  )
}

export function ListPanel(props) {
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
    <Panel title={props.title} focused={props.focused} height={props.height} width={props.width}>
      {visible}
    </Panel>
  )
}

export function MenuBar(props) {
  return (
    <text wrapMode="none" paddingLeft={1} flexDirection="row">
      {props.children}
    </text>
  )
}

export function Hint(props) {
  return (
    <span>
      {props.sep ? <span fg={COLORS.border}>  ·  </span> : null}
      <span fg={COLORS.focus} attributes={1}>
        {props.k}
      </span>
      <span fg={COLORS.muted}> {props.desc}</span>
    </span>
  )
}

export function PopupShell(props) {
  const popupWidth = Math.min(props.width - 4, 64)
  const contentHeight = Math.max(3, props.rows + 2)
  const left = Math.max(1, Math.round((props.width - popupWidth) / 2))
  const top = Math.max(1, Math.round((props.height - contentHeight) / 2))
  const accentColor = props.tone === "warn" ? COLORS.warning : COLORS.focus
  return (
    <box
      position="absolute"
      left={left}
      top={top}
      width={popupWidth}
      height={contentHeight}
      border
      borderStyle="rounded"
      borderColor={accentColor}
      title={props.title}
      titleColor={accentColor}
      titleAlignment="center"
      bottomTitle={props.bottomTitle}
      bottomTitleAlignment="center"
      backgroundColor={COLORS.surface}
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      overflow="hidden"
    >
      {props.children}
    </box>
  )
}

export function Popup(props) {
  return (
    <PopupShell
      title={props.title}
      width={props.width}
      height={props.height}
      rows={props.lines.length}
      bottomTitle={t(props.language, "press any key to close")}
    >
      {props.lines.map((line, index) => (
        <text key={index} wrapMode="none">
          {line}
        </text>
      ))}
    </PopupShell>
  )
}

export function PasswordPopup(props) {
  return (
    <PopupShell
      title={t(props.language, "Privilege required")}
      width={props.width}
      height={props.height}
      rows={4}
      tone="warn"
      bottomTitle={t(props.language, "enter submit · esc cancel")}
    >
      <text wrapMode="none" fg={COLORS.text}>
        {props.label}
      </text>
      <text wrapMode="none" fg={COLORS.muted}>
        {t(props.language, "needs root privileges — sudo password")}
      </text>
      <text wrapMode="none" fg={COLORS.warning}>
        {props.attempt > 1 ? t(props.language, "sudo is asking again (attempt {attempt})", { attempt: props.attempt }) : ""}
      </text>
      <text wrapMode="none">
        <span fg={COLORS.muted}>{t(props.language, "password ")}</span>
        <span fg={COLORS.text}>{"•".repeat(props.valueLength)}</span>
        <span fg={COLORS.warning}>▌</span>
      </text>
    </PopupShell>
  )
}

export function SearchPopup(props) {
  return (
    <PopupShell
      title={t(props.language, "Search")}
      width={props.width}
      height={props.height}
      rows={3}
      bottomTitle={t(props.language, "enter search · esc cancel")}
    >
      <text wrapMode="none">
        <span fg={props.scope === "local" ? COLORS.focus : COLORS.muted} attributes={props.scope === "local" ? 1 : 0}>
          local
        </span>
        <span fg={COLORS.border}> | </span>
        <span fg={props.scope === "add" ? COLORS.focus : COLORS.muted} attributes={props.scope === "add" ? 1 : 0}>
          add
        </span>
      </text>
      <text wrapMode="none">
        {props.value === "" ? (
          <span fg={COLORS.muted}>{t(props.language, "package name or keyword")}</span>
        ) : (
          <span fg={COLORS.text}>{props.value}</span>
        )}
        <span fg={COLORS.focus}>▌</span>
      </text>
      <text wrapMode="none" fg={COLORS.muted}>
        {props.scope === "local"
          ? t(props.language, "filters the current list instantly")
          : t(props.language, "searches AUR + repositories (yay -Ss)")}
      </text>
    </PopupShell>
  )
}

export function SettingsPopup(props) {
  const rows = [
    { label: t(props.language, "Language"), value: props.language === "zh" ? "中文" : "English" },
    { label: t(props.language, "Theme"), value: themeName(props.theme) },
  ]
  return (
    <PopupShell
      title={t(props.language, "Settings")}
      width={props.width}
      height={props.height}
      rows={2}
      bottomTitle={t(props.language, "enter/l next · h prev · esc close")}
    >
      {rows.map((row, index) => {
        const selected = index === props.cursor
        return (
          <box key={index} height={1} width="100%" backgroundColor={selected ? COLORS.selection : undefined}>
            <text wrapMode="none">
              <span fg={selected ? COLORS.text : COLORS.muted}>{row.label}: </span>
              <span fg={selected ? COLORS.focus : COLORS.muted}>{row.value}</span>
            </text>
          </box>
        )
      })}
    </PopupShell>
  )
}
