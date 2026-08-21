# dsh-tanqi（探奇）

DSH Web GUI 的「探奇」插件：AI 动态生成冷知识与奇妙事实，支持逐层深入。
侧边栏出现「探奇」入口，点击打开面板 —— **开始探奇** 现生成一批意想不到的主题，
每条可 **深入** → **再深入一层** → **类似知识点** 逐步展开；**探奇清单** 全量保留历史。

- 模型通道（方案B）：**优先复用 DSH 本机已配置的模型**（`ctx.llm`，免配置、免 key）；
  本机没有可用模型时，可在面板填入 DeepSeek API Key 兜底（key 仅存于该浏览器
  localStorage，请求经本机 DSH 服务端代调，不接触第三方 CORS）。
- 不重复：每次生成都会把「已展示过的主题」列表带给模型，要求排除；本地还会按标题去重。
- 历史：批次、条目、每一层深入、每一条类似知识点全部存于浏览器 localStorage
  （键 `dsh.tanqi.v1`，上限 30 批；已展示主题参与排除时取最近 200 条）。
- 主公的私人探奇清单（134+ 条）**不进插件、不公开** —— 插件对所有人现生成。

## 特性

- 每批默认 6 条，主题横跨科技/历史/生物/物理/数学/心理学/医学/语言/文化/商业等，
  每批至少 1-2 条「大公司病 / 产品决策困局 / 行业潜规则」商业洞察。
- 内容由大模型生成，提示词强约束「真实准确、严禁编造」，但仍可能出错 ——
  产品定位是「好奇心入口」，重要决策请勿依赖。
- 生成消耗模型额度：走 DSH 通道即消耗本机 API 余额；面板顶部实时显示所用通道。

## 开发

```bash
pnpm install          # 联网装 devDeps（tsdown/typescript/react/…）
pnpm build            # tsc 声明 + tsdown 打包 + 包装 client bundle
node scripts/smoke-client.mjs   # 客户端 bundle 冒烟（jsdom 模拟加载器+挂载+类似知识点渲染）
node --experimental-strip-types scripts/smoke-store.mjs  # store 逻辑冒烟（迁移/根级类似/排除清单，无需构建）
node --experimental-strip-types scripts/smoke-llm.mjs  # 宿主管线冒烟（真实 DeepSeek 调用）
```

- 宿主端 `src/index.ts`：路由注册（`/api/dsh-tanqi/status`、`/api/dsh-tanqi/generate`）+
  系统提示词声明。LLM 通道见 `src/llm.ts`（`ctx.llm.stream` 复用 / DeepSeek key 兜底）。
- 浏览器端 `src/client/`：侧边栏 DOM 注入 + 中央列面板（React）+ localStorage 存储。
- 构建产物：`lib/index.js`（宿主 ESM）、`lib/client.js`（浏览器端，已被
  `scripts/wrap-client.mjs` 包装成 `window.__ModuleLoader__.load({id, factory})`
  工厂格式 —— DSH 客户端加载器只服务 `/plugins/<id>/client.js`，样式表以内嵌
  `<style>` 注入（`src/client/panel/styles.ts`），不依赖独立 CSS 资源。

### 本地 link 安装（本机自测）

```bash
# profiles/web/package.json：
#   dependencies 增加 "@lastplayer82/dsh-tanqi": "link:../../plugins/dsh-tanqi"
#   dsh.profile.bundles 增加 "@lastplayer82/dsh-tanqi"（其 cordis.patch.yml 自动注册插件行）
cd profiles/web && pnpm install
```

**注意（本地 link 开发时）**：本包自带的 `node_modules`（devDeps，rc.7 的
`@deepseek-ai/*`）会遮蔽宿主运行时（rc.5 全家桶），导致同进程双版本。本机做法：
把本包 `node_modules` 下的 `@deepseek-ai` 与 `schemastery` 换成指向宿主依赖闭包的
**junction**（`D:\Dsh\profiles\node_modules\@deepseek-ai`、
`D:\Dsh\profiles\web\node_modules\schemastery`）—— 与 dsh-ssh 等全家桶解析到
完全相同的 rc.5 副本。任何一次 `pnpm install` 都会重建 rc.7 副本，需重新打 junction。
npm 发布后的安装版不带 node_modules，天然无此问题。

## 安装

```bash
dsh plugin --profile <name> add @lastplayer82/dsh-tanqi
```

或从 DSH 设置 → 插件市场一键安装。刷新页面后侧边栏出现「探奇」入口。

## 发布

```bash
npm login           # lastplayer82 账号（或 .npmrc 写 granular token，勾 Bypass 2FA）
pnpm publish        # 包名 @lastplayer82/dsh-tanqi
```

- 已发布版本：0.1.0（2026-08-20）、0.1.1（2026-08-21，含零层类似知识点渲染修复 + 标题纳入排除清单）。
- 市场收录：经 awesome-dsh-plugin（github.com/awesome-dsh-plugin/awesome-dsh-plugin）提 PR ——
  在 `data/plugins/lastplayer82__dsh-tanqi.yml` 加条目 + 本地跑 `node scripts/generate-readme.mjs`
  重新生成 README；dsh-market 与站点自动同步。
- 用户安装：`dsh plugin --profile <name> add @lastplayer82/dsh-tanqi`（或插件市场一键安装）。

## 架构与边界

- 侧边栏入口是 DOM 注入（`data-dsh-tanqi-entry` + MutationObserver 自愈），
  DSH 无官方 sidebar slot —— 全家桶统一做法；DSH 大版本升级后可能需微调选择器。
- 中央列单占用协议：打开探奇会移除任务看板/SSH 面板的激活属性，反之亦然
  （事件 `dsh-panel-activate`）。
- `/api/dsh-tanqi/*` 带 loopback-only 围栏：仅本机浏览器可调，局域网暴露的
  DSH 不会被陌生人烧 token。
- 生成超时 180s；客户端可随时关闭面板/断开，服务端会中止调用。

## License

Apache-2.0
