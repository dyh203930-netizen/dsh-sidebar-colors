// 侧边栏行颜色 —— Client 半（浏览器页面）
//
// 功能：
//   1. 会话行：在 "…" 菜单里多一行「文字颜色」，点色块立即给该会话的标题文字上色；
//      想用任意颜色时点「自定义…」会打开一个常驻色板浮层；
//   2. 工作区行：在工作区标题行上点右键，弹出同款色板，给该行加背景色；
//   3. 颜色保存在浏览器 localStorage 里，刷新/重启后仍然生效；
//   4. 上色方式：注入一段 CSS，用侧边栏行自带的 data-row-key 属性精确定位，不改官方组件。
//
// 注意：这里依赖官方侧边栏行上的 data-row-key（session:<id> / workspace:<key>），
// 若将来官方改了属性名，需要同步修改 buildCss 里的选择器。

window.__ModuleLoader__.load({
  id: '@local/sidebar-colors',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** 语言命名空间。 */
    const NS = 'sidebar.colors'

    /** localStorage 键名：改动这里等于清空所有已保存颜色。 */
    const STORAGE_KEY = 'dsh.sidebar-colors.v1'

    //----------------------------- 中英文案 -----------------------------

    /** 简体中文文案。 */
    const zh = {
      textColor: '文字颜色',
      workspaceBackground: '工作区背景',
      custom: '自定义…',
      clear: '默认',
    }

    /** 英文文案。 */
    const en = {
      textColor: 'Text color',
      workspaceBackground: 'Workspace background',
      custom: 'Custom…',
      clear: 'Default',
    }

    //----------------------------- 预设色 -----------------------------

    /**
     * 预设色板：8 个饱和度适中的颜色，深色/浅色主题下都还能看清。
     * 想加颜色直接往这里加十六进制值即可。
     */
    const PRESETS = ['#e5484d', '#f5a524', '#d4b106', '#30a46c', '#12a594', '#3e63dd', '#8e4ec6', '#8b8d98']

    //----------------------------- 颜色数据 -----------------------------

    /**
     * 判断一个字符串是否是合法的 #rgb / #rrggbb 颜色。
     * @param {unknown} value - 待判断的值。
     * @returns {boolean} true = 可用作 CSS 颜色。
     */
    function isHexColor(value) {
      return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
    }

    /**
     * 过滤掉不合法的记录，避免脏数据写进 CSS。
     * @param {unknown} record - 形如 { id: '#rrggbb' } 的对象。
     * @returns {Record<string, string>} 只保留合法颜色。
     */
    function sanitize(record) {
      const result = {}
      if (!record || typeof record !== 'object') return result
      for (const [key, value] of Object.entries(record)) {
        if (typeof key === 'string' && key !== '' && isHexColor(value)) result[key] = value
      }
      return result
    }

    /**
     * 从 localStorage 读取颜色配置。
     * @returns {{ sessions: Record<string,string>, workspaces: Record<string,string> }} 两份映射表。
     */
    function readStored() {
      try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
        if (!raw) return { sessions: {}, workspaces: {} }
        const parsed = JSON.parse(raw)
        return { sessions: sanitize(parsed?.sessions), workspaces: sanitize(parsed?.workspaces) }
      } catch {
        return { sessions: {}, workspaces: {} }
      }
    }

    /** 当前颜色配置；每次修改都替换成新对象，方便 React 判断变化。 */
    let state = readStored()

    /** 订阅者集合（React 组件用它感知颜色变化）。 */
    const listeners = new Set()

    /**
     * 通知所有订阅者颜色变了。
     */
    function notify() {
      for (const listener of listeners) listener()
    }

    /**
     * 订阅颜色变化（React 的 useSyncExternalStore 要求返回取消订阅函数）。
     * @param {() => void} listener - 变化回调。
     * @returns {() => void} 取消订阅。
     */
    function subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }

    /**
     * 读取当前颜色配置（useSyncExternalStore 的快照函数，引用稳定）。
     * @returns {{ sessions: Record<string,string>, workspaces: Record<string,string> }} 当前配置。
     */
    function getSnapshot() {
      return state
    }

    /**
     * 设置或清除某个会话/工作区的颜色，并落盘。
     * @param {'sessions'|'workspaces'} kind - 设置的是会话还是工作区。
     * @param {string} id - 会话 id 或工作区 key。
     * @param {string|null} color - 十六进制颜色；传 null 表示恢复默认。
     */
    function setColor(kind, id, color) {
      const nextGroup = { ...state[kind] }
      if (color && isHexColor(color)) nextGroup[id] = color
      else delete nextGroup[id]
      state = { ...state, [kind]: nextGroup }
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch {
        // 隐私模式等场景写不进去时只影响持久化，不影响本次会话
      }
      notify()
    }

    /**
     * 把 id 安全地转成 CSS 属性选择器里的字符串（转义反斜杠和引号）。
     * @param {string} value - 原始 id。
     * @returns {string} 可放进 [data-row-key="..."] 的字符串。
     */
    function cssAttr(value) {
      return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    }

    /**
     * 根据当前颜色配置生成 CSS 规则。
     * 会话：只改标题文字颜色；工作区：给标题行加一层半透明底色（不破坏文字对比度）。
     * @param {{sessions: Record<string,string>, workspaces: Record<string,string>}} colors - 颜色配置。
     * @returns {string} 完整 CSS 文本。
     */
    function buildCss(colors) {
      const rules = []
      for (const [id, color] of Object.entries(colors.sessions)) {
        const row = `[data-row-key="session:${cssAttr(id)}"]`
        rules.push(`${row} [class*="_title"]{color:${color}}`)
      }
      for (const [key, color] of Object.entries(colors.workspaces)) {
        const row = `[data-row-key="workspace:${cssAttr(key)}"]`
        rules.push(
          `${row}{background-color:color-mix(in srgb, ${color} 34%, transparent);border-radius:8px}`,
          `${row}:hover{background-color:color-mix(in srgb, ${color} 50%, transparent)}`,
        )
      }
      return rules.join('\n')
    }

    /**
     * React Hook：订阅颜色配置。
     * @returns {{sessions: Record<string,string>, workspaces: Record<string,string>}} 当前配置。
     */
    function useColors() {
      return React.useSyncExternalStore(subscribe, getSnapshot)
    }

    //----------------------------- 浮层联动 -----------------------------

    /**
     * 由 ColorLayer 挂载时填上的"打开色板浮层"函数。
     * 会话菜单项通过它请求打开自定义色板（菜单项自己不能直接渲染浮层）。
     * @type {(request: {kind:'sessions'|'workspaces', id:string, label:string, x:number, y:number}) => void}
     */
    let openPopover = () => {}

    //----------------------------- 样式 -----------------------------

    /** 色板与浮层的样式（颜色只用主题 token，色块本身用用户选的颜色）。 */
    const CSS = `
.dshsc_swatches{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dshsc_swatch{width:16px;height:16px;padding:0;border-radius:50%;border:1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);cursor:pointer;box-sizing:border-box;flex:none}
.dshsc_swatch:hover{transform:scale(1.12)}
.dshsc_swatch[data-on="true"]{box-shadow:0 0 0 2px var(--dsw-alias-bg-overlay),0 0 0 3px var(--dsw-alias-label-primary)}
.dshsc_custom{position:relative;width:16px;height:16px;flex:none;cursor:pointer;border-radius:50%;overflow:hidden;background:conic-gradient(#e5484d,#f5a524,#30a46c,#3e63dd,#8e4ec6,#e5484d);border:1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);box-sizing:border-box}
.dshsc_custom input{position:absolute;inset:0;width:100%;height:100%;opacity:0;border:0;padding:0;cursor:pointer}
.dshsc_link{padding:0;border:0;background:none;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.dshsc_link:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}
.dshsc_menuRow{display:flex;flex-direction:column;gap:6px;padding:8px 10px;box-sizing:border-box;cursor:default}
.dshsc_menuHead{display:flex;align-items:center;gap:8px}
.dshsc_menuLabel{flex:1;color:var(--dsw-alias-label-secondary);font-size:12px}
.dshsc_backdrop{position:fixed;inset:0;z-index:60;pointer-events:auto}
.dshsc_panel{position:fixed;z-index:61;pointer-events:auto;display:flex;flex-direction:column;gap:8px;min-width:236px;max-width:300px;padding:10px 12px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);box-shadow:0 8px 28px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);font-size:12px;color:var(--dsw-alias-label-primary)}
.dshsc_panelTitle{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dshsc_panelName{font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`

    //----------------------------- 色板组件 -----------------------------

    /**
     * 一排预设色块 + 自定义取色 + 恢复默认。
     * @param {Object} props - 组件参数。
     * @param {'sessions'|'workspaces'} props.kind - 给会话还是工作区上色。
     * @param {string} props.id - 会话 id 或工作区 key。
     * @param {(key:string)=>string} props.t - 本地化函数。
     * @param {() => void} props.onPicked - 立即生效类操作后的回调（例如关闭菜单/浮层）。
     * @param {() => void} [props.onCustom] - 点「自定义…」时的回调；不传则不显示该按钮。
     * @returns {any} React 元素。
     */
    function Swatches({ kind, id, t, onPicked, onCustom }) {
      const colors = useColors()
      const current = colors[kind][id]

      /**
       * 选色后立即生效并通知外层收起。
       * @param {string|null} color - 颜色或 null（默认）。
       */
      const choose = (color) => {
        setColor(kind, id, color)
        onPicked()
      }

      return h(
        'div',
        { className: 'dshsc_swatches', role: 'group' },
        PRESETS.map((color) =>
          h('button', {
            key: color,
            type: 'button',
            className: 'dshsc_swatch',
            role: 'menuitem',
            'data-on': current === color ? 'true' : 'false',
            style: { backgroundColor: color },
            title: color,
            'aria-label': color,
            onClick: (event) => {
              event.stopPropagation()
              choose(color)
            },
          }),
        ),
        // 浮层里直接放一个系统取色器；菜单里则用「自定义…」按钮打开浮层
        onCustom
          ? h(
              'button',
              {
                type: 'button',
                className: 'dshsc_link',
                onClick: (event) => {
                  event.stopPropagation()
                  onCustom()
                },
              },
              t('custom'),
            )
          : h(
              'label',
              { className: 'dshsc_custom', title: t('custom') },
              h('input', {
                type: 'color',
                value: current || '#3e63dd',
                onClick: (event) => event.stopPropagation(),
                onChange: (event) => choose(event.target.value),
              }),
            ),
        current
          ? h(
              'button',
              {
                type: 'button',
                className: 'dshsc_link',
                onClick: (event) => {
                  event.stopPropagation()
                  choose(null)
                },
              },
              t('clear'),
            )
          : null,
      )
    }

    //----------------------------- 会话菜单项 -----------------------------

    /**
     * 在会话行上取一个适合放浮层的坐标（贴着该行右下方）。
     * @param {string} sessionId - 会话 id。
     * @returns {{x:number, y:number}} 视口内坐标。
     */
    function anchorForSession(sessionId) {
      const row = document.querySelector(`[data-row-key="session:${cssAttr(sessionId)}"]`)
      const rect = row ? row.getBoundingClientRect() : null
      const width = 260
      const x = rect ? Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8) : window.innerWidth / 2
      const y = rect ? Math.min(rect.bottom + 6, window.innerHeight - 120) : window.innerHeight / 2
      return { x, y }
    }

    /**
     * 会话 "…" 菜单里的「文字颜色」一行：预设色 + 自定义 + 默认。
     * @param {Object} props - 插槽属性。
     * @param {string} props.sessionId - 该会话 id。
     * @param {string} props.displayTitle - 该会话标题（用于浮层标题）。
     * @param {() => [boolean, (next:boolean)=>void]} props.useMenuOpenState - 菜单开关的 React Hook。
     * @param {(key:string)=>string} props.t - 本地化函数。
     * @returns {any} React 元素。
     */
    function SessionColorMenuItem({ sessionId, displayTitle, useMenuOpenState, t }) {
      const setMenuOpen = useMenuOpenState ? useMenuOpenState()[1] : () => {}
      return h(
        'div',
        { className: 'dshsc_menuRow' },
        h(
          'div',
          { className: 'dshsc_menuHead' },
          h('span', { className: 'dshsc_menuLabel' }, t('textColor')),
        ),
        h(Swatches, {
          kind: 'sessions',
          id: sessionId,
          t,
          onPicked: () => setMenuOpen(false),
          onCustom: () => {
            setMenuOpen(false)
            // 等菜单收起后再开浮层，避免两套弹层同时抢焦点
            const { x, y } = anchorForSession(sessionId)
            setTimeout(() => {
              openPopover({ kind: 'sessions', id: sessionId, label: displayTitle || '', x, y })
            }, 0)
          },
        }),
      )
    }

    //----------------------------- 浮层（样式 + 色板） -----------------------------

    /**
     * 常驻浮层：始终注入颜色 CSS；右键工作区标题、或点会话菜单的「自定义…」时弹出色板。
     * @param {Object} props - 插槽属性。
     * @param {(key:string)=>string} props.t - 本地化函数。
     * @returns {any} React 元素。
     */
    function ColorLayer({ t }) {
      const colors = useColors()
      const [popover, setPopover] = React.useState(null)

      // 让菜单项可以打开浮层
      React.useEffect(() => {
        openPopover = setPopover
        return () => {
          openPopover = () => {}
        }
      }, [])

      // 监听右键：只拦截工作区标题行，其余位置保持浏览器默认行为
      React.useEffect(() => {
        /** 右键处理器：找到所在的工作区行并把色板弹在鼠标位置。 */
        const onContextMenu = (event) => {
          const target = event.target
          if (!(target instanceof Element)) return
          const row = target.closest('[data-row-key^="workspace:"]')
          if (!row) return
          const rowKey = String(row.getAttribute('data-row-key') || '')
          const key = rowKey.slice('workspace:'.length)
          // "ungrouped" 是"未分组"虚拟分组，不是真实工作区，不处理
          if (!key || key === 'ungrouped') return
          event.preventDefault()
          event.stopPropagation()
          const label = String(row.textContent || '').trim().slice(0, 60) || key
          const width = 260
          const height = 130
          const x = Math.min(Math.max(8, event.clientX), Math.max(8, window.innerWidth - width - 8))
          const y = Math.min(Math.max(8, event.clientY), Math.max(8, window.innerHeight - height - 8))
          setPopover({ kind: 'workspaces', id: key, label, x, y })
        }
        document.addEventListener('contextmenu', onContextMenu, true)
        return () => document.removeEventListener('contextmenu', onContextMenu, true)
      }, [])

      // 打开色板时支持 Esc 关闭
      React.useEffect(() => {
        if (!popover) return undefined
        /** Esc 关闭。 */
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setPopover(null)
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, [popover])

      return h(
        React.Fragment,
        null,
        h('style', { 'data-dsh-sidebar-colors': '' }, CSS + '\n' + buildCss(colors)),
        popover
          ? h(
              'div',
              { className: 'dshsc_backdrop', onPointerDown: () => setPopover(null) },
              h(
                'div',
                {
                  className: 'dshsc_panel',
                  style: { left: popover.x, top: popover.y },
                  onPointerDown: (event) => event.stopPropagation(),
                  role: 'dialog',
                  'aria-label': t(popover.kind === 'sessions' ? 'textColor' : 'workspaceBackground'),
                },
                h(
                  'div',
                  { className: 'dshsc_panelTitle' },
                  t(popover.kind === 'sessions' ? 'textColor' : 'workspaceBackground'),
                ),
                popover.label ? h('div', { className: 'dshsc_panelName' }, popover.label) : null,
                h(Swatches, {
                  kind: popover.kind,
                  id: popover.id,
                  t,
                  onPicked: () => setPopover(null),
                }),
              ),
            )
          : null,
      )
    }

    //----------------------------- 插件入口 -----------------------------

    return {
      inject: ['slots', 'locale'],
      /**
       * 注册语言包、会话菜单项和常驻浮层。
       * @param {any} ctx - Cordis Client 上下文。
       */
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'sidebar-colors: dictionaries')

        // 会话行 "…" 菜单：新增「文字颜色」一行
        ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
          ctx.slots.register(
            {
              name: 'sidebar.workspaces.session.menu.item',
              id: 'text-color',
              order: 250,
              locale: NS,
            },
            SessionColorMenuItem,
          ),
        )

        // 常驻浮层：注入颜色 CSS，并负责右键色板 / 自定义色板
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'sidebar-row-colors',
              order: 900,
              locale: NS,
            },
            ColorLayer,
          ),
        )
      },
    }
  },
})
