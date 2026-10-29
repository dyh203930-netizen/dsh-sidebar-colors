# dsh-sidebar-colors · 侧边栏行颜色

给 DeepSeek Harness 的侧边栏加一点颜色：

- **会话**：给单个会话的标题文字上色（会话行“…”菜单 → 「文字颜色」）；
- **工作区**：给单个工作区标题行加背景色（在**工作区标题行上点右键**）。

每个会话、每个工作区各自独立；颜色保存在浏览器本地，刷新和重启后仍然生效。

> 这是一个纯前端插件（Harness Client 半），Host 侧只有一个空壳，不联网、不写文件、不采集任何数据。

---

## 安装

前提：已安装 DeepSeek Harness（开发版 Web GUI 测试于 `0.2.1-rc.3`）。

### 方式一：直接在插件页面安装（推荐）

在 Harness 的 **Plugins** 页面点 **Add**，填入：

```
github:dyh203930-netizen/dsh-sidebar-colors
```

### 方式二：本地目录安装

```bash
git clone https://github.com/dyh203930-netizen/dsh-sidebar-colors.git
```

然后在 Harness 里让智能体执行 `plugin_manager install_bundle`，目标填本仓库的绝对路径。

安装完成后 **刷新页面**（`Ctrl+Shift+R`），颜色功能才会加载。

## 使用

### 给会话标题上色

1. 把鼠标移到左侧任意会话行；
2. 点该行右侧的 **“…”**；
3. 菜单里找到 **「文字颜色」**：点任意色块立即生效；点「默认」清除；
4. 想用任意颜色：点「**自定义…**」，会弹出常驻色板，里面有系统取色器。

### 给工作区加背景色

1. 在左侧的**工作区标题行**（文件夹图标 + 工作区名称那一行）上**点右键**；
2. 弹出色板 → 点色块立即生效；点「默认」清除。

> “未分组”那一行不是真实工作区，右键保持浏览器默认行为。

## 实现方式

- 只往官方提供的插槽里注册内容：会话菜单项用 `sidebar.workspaces.session.menu.item`，浮层用 `shell.overlay`；
- 上色通过注入一段 CSS 实现，用侧边栏行自带的 `data-row-key="session:<id>"` / `"workspace:<key>"` 精确命中，
  不替换、不改写官方组件；
- 颜色存在 `localStorage` 的 `dsh.sidebar-colors.v1`，格式：

```json
{ "sessions": { "<session-id>": "#3e63dd" }, "workspaces": { "<workspace-id>": "#30a46c" } }
```

## 自定义

| 想改什么 | 改哪里 |
| --- | --- |
| 预设色板 | `client.js` 顶部的 `PRESETS` 数组 |
| 工作区背景深浅 | `buildCss()` 里 `color-mix(... 34%, transparent)` 的百分比 |
| 存储键 / 清空所有颜色 | `client.js` 顶部的 `STORAGE_KEY` |

改完客户端代码后刷新页面即可（Host 侧没有代码，不需要重启 Harness）。

## 限制

- 依赖官方行上的 `data-row-key` 属性（Harness 内部约定）。将来 Harness 升级若改名，颜色会失效，需要同步修改 `buildCss()` 里的选择器；
- 颜色只保存在**当前浏览器**，换浏览器或换设备不会跟随；
- 工作区背景用的是半透明叠色（默认 34%），不是纯色块，这样深浅主题下文字都还看得清；想要更实可以按上表调整。

## 许可

[MIT](./LICENSE)

---

## English

Colors for the DeepSeek Harness sidebar.

- **Sessions** — set the title text color from a session row's “…” menu → **Text color**.
- **Workspaces** — right-click a workspace title row to set its background color.

Each session and workspace keeps its own color. Colors persist in `localStorage`; no Host service, no network, no data collection.

**Install** — in the Harness **Plugins** page, click **Add** and enter
`github:dyh203930-netizen/dsh-sidebar-colors`, then reload the page. Or clone the repo and install the
bundle from its absolute path with `plugin_manager install_bundle`.

**How it works** — the plugin only registers into shipped slots (`sidebar.workspaces.session.menu.item`
and `shell.overlay`) and injects CSS that targets the rows' own `data-row-key` attributes. It does not
replace or patch any harness component.

**Limitations** — relies on the `data-row-key` attributes and `localStorage`; a future harness release
that renames the attributes will need a matching selector update.
