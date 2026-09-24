import { hintSegments as kitHintSegments, translate } from '../../vendor/lazy-kit/i18n.js'

// Key = the English source text; the English catalog only carries entries
// whose key is not the sentence itself (help lines, CLI usage).
const EN = {
  help_lines: [
    'j / k or arrows    move cursor, scroll info',
    'h / l or arrows    switch to previous / next panel',
    'tab / shift+tab    cycle panels forward / backward',
    '1 / 2 / 3          jump to panel',
    'g / G              jump to top / bottom of panel',
    'home / end         jump to first / last row',
    'pgup / pgdn        half page (ctrl+d / ctrl+u)',
    'enter              open the info panel',
    '/                  search packages (AUR + repos)',
    'd                  download PKGBUILD source (background)',
    'i                  download and install (background)',
    'u / U              update the selected / all packages',
    'x                  abort the last active background job',
    'r                  refresh queries, re-run search',
    'esc                close search or popup',
    ':                  settings (language / theme)',
    'L                  switch 中文 / English',
    'q / ?              quit / toggle this help',
    '',
    'jobs run in the background and list in the status bar;',
    'the sudo password is asked in a popup only when a job needs root',
  ],
  usage: `lazyaur - lazy AUR/system package manager TUI (yay frontend)

Usage:
  lazyaur                 Open the TUI (default)
  lazyaur update [args]   Upgrade system and AUR packages (yay -Syu [args])
  lazyaur -v, --version   Print version
  lazyaur -h, --help      Show this help

Keys in the TUI:
  j/k or arrows   move cursor / scroll    h/l or arrows   switch panel
  tab/shift+tab   cycle panels            1/2/3           jump to panel
  enter           open info panel         /               search AUR + repos
  d               download (background)   i               install (background)
  u / U           update selected / all   x               abort last job
  r               refresh                 esc             close search / popup
  :               settings                L               switch 中文/English
  q               quit                    ?               help

Background jobs run without blocking the UI and list in the status bar.
The sudo password is asked in a popup only when a job actually needs root.
`,
}

const ZH = {
  help_lines: [
    'j / k 或方向键      移动光标、滚动信息',
    'h / l 或方向键      上一 / 下一面板',
    'tab / shift+tab     循环切换面板',
    '1 / 2 / 3           跳转到面板',
    'g / G               跳到面板顶部 / 底部',
    'home / end          跳到首行 / 末行',
    'pgup / pgdn         半页（ctrl+d / ctrl+u）',
    'enter               打开信息面板',
    '/                   搜索软件包（AUR + 仓库）',
    'd                   下载 PKGBUILD 源码（后台）',
    'i                   下载并安装（后台）',
    'u / U               更新所选 / 全部软件包',
    'x                   中止最近的后台任务',
    'r                   刷新查询、重新搜索',
    'esc                 关闭搜索或弹层',
    ':                   设置（语言 / 主题）',
    'L                   切换 中文 / English',
    'q / ?               退出 / 开关本帮助',
    '',
    '任务在后台运行并显示在状态栏；',
    '只有任务需要 root 时才会弹出 sudo 密码框',
  ],
  usage: `lazyaur - 惰性 AUR/系统包管理 TUI（yay 前端）

用法:
  lazyaur                 打开 TUI（默认）
  lazyaur update [args]   升级系统与 AUR 软件包（yay -Syu [args]）
  lazyaur -v, --version   打印版本
  lazyaur -h, --help      显示本帮助

TUI 按键:
  j/k 或方向键   移动光标 / 滚动    h/l 或方向键   切换面板
  tab/shift+tab  循环切换面板        1/2/3          跳转到面板
  enter          打开信息面板        /              搜索 AUR + 仓库
  d              下载（后台）        i              安装（后台）
  u / U          更新所选 / 全部     x              中止最近任务
  r              刷新                esc            关闭搜索 / 弹层
  :              设置                L              切换 中文/English
  q              退出                ?              帮助

任务在后台运行并显示在状态栏；
只有任务需要 root 时才会弹出 sudo 密码框。
`,
  'terminal too small (min 40x14, current {width}x{height})':
    '终端太小（最小 40x14，当前 {width}x{height}）',
  'Updates': '更新',
  'Installed': '已安装',
  'Search': '搜索',
  'Info': '信息',
  'Status': '状态',
  'Keys': '按键',
  'Settings': '设置',
  'Language': '语言',
  'Theme': '主题',
  'checking for updates…': '正在检查更新…',
  'no pending updates': '没有待更新的包',
  'loading…': '加载中…',
  'no installed packages': '没有已安装的包',
  'press / to search': '按 / 搜索',
  'searching…': '搜索中…',
  'error: {message}': '错误：{message}',
  'no results for "{query}"': '没有匹配 "{query}" 的结果',
  'No pending updates.': '没有待更新的包。',
  '{count} active': '{count} 进行中',
  'checking…': '检查中…',
  'idle': '空闲',
  'updates': '更新',
  'installed': '已安装',
  'waiting for other jobs': '正在等待其他任务',
  'canceled · {seconds}': '已取消 · {seconds}',
  'exit {code} · {seconds}': '退出 {code} · {seconds}',
  'press any key to close': '按任意键关闭',
  'Privilege required': '需要权限',
  'enter submit · esc cancel': 'Enter 提交 · Esc 取消',
  'needs root privileges — sudo password': '需要 root 权限 — sudo 密码',
  'sudo is asking again (attempt {attempt})': 'sudo 再次询问（第 {attempt} 次）',
  'password ': '密码 ',
  'enter search · esc cancel': 'Enter 搜索 · Esc 取消',
  'package name or keyword': '包名或关键词',
  'filters the current list instantly': '即时过滤当前列表',
  'searches AUR + repositories (yay -Ss)': '搜索 AUR 与软件仓库（yay -Ss）',
  'enter/l next · h prev · esc close': 'Enter/l 下一项 · h 上一项 · Esc 关闭',
  'Quit?': '退出？',
  'jobs still running: {count}': '仍在运行的任务：{count}',
  'y quit · n cancel': 'y 退出 · n 取消',
}

const CATALOG = { en: EN, zh: ZH }

// Hint chips are `[key, desc]` tuples; descriptions translate, keys do not.
const HINTS = {
  en: {
    updates_hint: [
      ['j/k', 'move'],
      ['h/l', 'panels'],
      ['1 2 3', 'panels'],
      ['g/G', 'top/end'],
      ['enter', 'info'],
      ['/', 'search'],
      ['?', 'help'],
      ['r', 'refresh'],
      ['x', 'abort'],
      ['i', 'install'],
      ['u', 'update'],
      ['U', 'update all'],
      ['d', 'download'],
      ['q', 'quit'],
      [':', 'settings'],
      ['L', 'language'],
    ],
    installed_hint: [
      ['j/k', 'move'],
      ['h/l', 'panels'],
      ['1 2 3', 'panels'],
      ['g/G', 'top/end'],
      ['enter', 'info'],
      ['/', 'search'],
      ['?', 'help'],
      ['r', 'refresh'],
      ['x', 'abort'],
      ['i', 'install'],
      ['u', 'update'],
      ['d', 'download'],
      ['q', 'quit'],
      [':', 'settings'],
      ['L', 'language'],
    ],
    search_hint: [
      ['j/k', 'move'],
      ['h/l', 'panels'],
      ['1 2 3', 'panels'],
      ['enter', 'info'],
      ['esc', 'close'],
      ['/', 'search'],
      ['?', 'help'],
      ['r', 'refresh'],
      ['x', 'abort'],
      ['i', 'install'],
      ['d', 'download'],
      ['q', 'quit'],
      [':', 'settings'],
      ['L', 'language'],
    ],
    info_hint: [
      ['j/k', 'scroll'],
      ['h/l', 'panels'],
      ['1 2 3', 'panels'],
      ['g/G', 'top/end'],
      ['/', 'search'],
      ['?', 'help'],
      ['r', 'refresh'],
      ['x', 'abort'],
      ['q', 'quit'],
      [':', 'settings'],
      ['L', 'language'],
    ],
  },
  zh: {
    updates_hint: [
      ['j/k', '移动'],
      ['h/l', '面板'],
      ['1 2 3', '面板'],
      ['g/G', '顶部/底部'],
      ['enter', '详情'],
      ['/', '搜索'],
      ['?', '帮助'],
      ['r', '刷新'],
      ['x', '中止'],
      ['i', '安装'],
      ['u', '更新'],
      ['U', '全部更新'],
      ['d', '下载'],
      ['q', '退出'],
      [':', '设置'],
      ['L', '语言'],
    ],
    installed_hint: [
      ['j/k', '移动'],
      ['h/l', '面板'],
      ['1 2 3', '面板'],
      ['g/G', '顶部/底部'],
      ['enter', '详情'],
      ['/', '搜索'],
      ['?', '帮助'],
      ['r', '刷新'],
      ['x', '中止'],
      ['i', '安装'],
      ['u', '更新'],
      ['d', '下载'],
      ['q', '退出'],
      [':', '设置'],
      ['L', '语言'],
    ],
    search_hint: [
      ['j/k', '移动'],
      ['h/l', '面板'],
      ['1 2 3', '面板'],
      ['enter', '详情'],
      ['esc', '关闭'],
      ['/', '搜索'],
      ['?', '帮助'],
      ['r', '刷新'],
      ['x', '中止'],
      ['i', '安装'],
      ['d', '下载'],
      ['q', '退出'],
      [':', '设置'],
      ['L', '语言'],
    ],
    info_hint: [
      ['j/k', '滚动'],
      ['h/l', '面板'],
      ['1 2 3', '面板'],
      ['g/G', '顶部/底部'],
      ['/', '搜索'],
      ['?', '帮助'],
      ['r', '刷新'],
      ['x', '中止'],
      ['q', '退出'],
      [':', '设置'],
      ['L', '语言'],
    ],
  },
}

export function t(language, key, params) {
  return translate(CATALOG, language, key, params)
}

export function hintSegments(language, id) {
  return kitHintSegments(HINTS, language, id)
}
