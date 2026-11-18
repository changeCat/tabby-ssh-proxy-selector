# Tabby SSH 代理选择器

在 Tabby 中管理多个 SOCKS5 和 HTTP CONNECT 预设。为分组指定默认线路，为单个 SSH 连接设置例外，也可以临时换一条线路打开新的标签页。

## macOS 与 Windows 安装

macOS（Apple Silicon 和 Intel）与 Windows 共用一个 ZIP。安装和升级使用相同步骤，插件运行依赖已随包提供，无需另装 Node.js 或管理员权限。

1. 完全退出 Tabby（Mac 上按 `⌘Q`），下载并完整解压发布附件 `tabby-ssh-proxy-selector-版本号.zip`。[GitHub Releases](https://github.com/changeCat/tabby-ssh-proxy-selector/releases)
2. **macOS** 双击 `install.command`。**Windows** 双击 `install.cmd`。
3. 重新打开 Tabby，进入 **设置 → SSH 代理管理**，即可选择要使用代理的连接。

### 手动安装或卸载

如果 macOS 提示无法打开安装脚本，也可以直接用 Finder 安装。按 `⌘⇧G` 前往下表中的目录，将解压出的整个 `tabby-ssh-proxy-selector` 文件夹放入其中。首次使用时可自行创建 `plugins/node_modules`。便携版或自定义数据目录使用对应的 `plugins/node_modules`。

| 系统 | 默认插件目录 |
| --- | --- |
| macOS | `~/Library/Application Support/tabby/plugins/node_modules/` |
| Windows | `%APPDATA%\tabby\plugins\node_modules\` |

安装后，插件文件夹内应直接包含 `package.json`、`dist/index.js` 和 `node_modules`。卸载时完全退出 Tabby，仅删除该插件文件夹即可。SSH 连接配置保存在 Tabby 中。[Tabby 数据目录说明](https://github.com/Eugeny/tabby/wiki/Config-file)

## 选择连接线路

1. 打开 **设置 → SSH 代理管理**。在 **代理预设** 中添加网关，例如「公司代理」使用 SOCKS5 的 `127.0.0.1:1080`。
2. 把「公司服务器」的 **分组线路** 设为「公司代理」。选择 **继承分组** 的现有连接和新加入该组的连接都会采用这条线路。
3. 单机可以指定其他预设、选择 **直连**，或选择 **沿用 Tabby** 使用它原有的 SSH 代理命令、跳板或代理设置。点击 **保存更改**，新连接生效。

从单代理版本升级时，旧地址和端口会成为「默认代理」，原先勾选的连接会获得单机规则。未勾选的连接默认沿用 Tabby。

### 测试与临时连接

点击连接名称展开详情，可查看将使用的路径、规则来源和本次运行中最近成功的连接路径。在 **本次线路** 选好线路后：

- **测试连接** 会检查代理端口、目标隧道和 SSH 协议标识。直连时只检查目标；测试不提交用户名、密码或密钥。Tabby 原生代理命令和跳板请用 **连接一次** 验证。
- **连接一次** 使用页面当前选择打开新标签页。临时选择只用于这次连接及初始化重试，之后重连恢复已保存规则。测试和临时连接也可使用尚未保存的预设。

### 直连仍显示代理提示

展开连接查看路径。如果「Tabby 设置」显示代理地址，说明 SSH 配置或其默认值含有代理字段，也可能是旧版插件留下的值。希望这台机器始终直连时，将它的单机线路设为 **直连**，保存并重新连接。此选项只对当前会话覆盖代理命令、跳板和 SOCKS/HTTP 字段，原生配置仍可通过 **沿用 Tabby** 使用。

如果设置页没有出现，检查插件入口文件是否存在，并完全退出后重开 Tabby。如果连接失败，可在 Tabby 数据目录查看 `tabby-ssh-proxy-selector.log`。Mac 默认在 `~/Library/Application Support/tabby/`，Windows 默认在 `%APPDATA%\tabby\`。

## 从源码构建

开发环境需要 Node.js 18 或更高版本及 npm。在项目根目录执行：

```sh
npm ci
npm run build
```

- `npm run pack:release` 可在 macOS 或 Windows 上执行，自动编译并在项目根目录生成同一个双平台安装 ZIP。
- 构建后运行 `npm test` 可验证路由迁移、并发临时连接、直连隔离和 HTTP CONNECT。打包后运行 `node tests/install-release.cjs` 可在临时用户目录验证当前系统的安装、升级和日志路径。
- `npm pack` 生成带运行依赖的 npm 包，也会自动编译。

## 发布版本

本地修改、提交和试打包都无需改版本号。将一个或多个提交一起推送到 `main` 或 `master` 时，GitHub Actions 为这次推送计算一个补丁版本。例如，最高正式标签为 `v0.1.0` 时，下一次推送使用 `v0.1.1`。普通功能分支不触发发布。

版本号只写入 CI 工作目录的 npm 清单。macOS 和 Windows 安装验证都通过后，工作流才给该提交打标签并发布同版本 ZIP。重复运行同一个已打标签的提交会复用原版本。正式版本以 Git 标签和 Release 为准，本地试打包沿用源码中的版本号。

需要升级次版本或主版本时，可手动运行工作流并指定更高的标签，例如 `v0.2.0`。[发布工作流](.github/workflows/release.yml)

设置界面和分组选择逻辑在 [settings-tab.component.ts](src/settings-tab.component.ts)，默认配置在 [config.ts](src/config.ts)。适配 Tabby 的 SSH 连接入口时，参见 [ssh-proxy.service.ts](src/ssh-proxy.service.ts)；SOCKS5 和 HTTP CONNECT 的握手实现在 [proxy-socket.ts](src/proxy-socket.ts)。
