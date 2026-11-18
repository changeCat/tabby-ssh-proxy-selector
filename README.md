# Tabby SSH 代理选择器

在 Tabby 中管理多个 SOCKS5 和 HTTP CONNECT 预设。为分组指定默认线路，为单个 SSH 连接设置例外，也可以临时换一条线路打开新的标签页。

## macOS 与 Windows 安装

macOS（Apple Silicon 和 Intel）与 Windows 共用一个 ZIP。安装和升级使用相同步骤，插件运行依赖已随包提供，无需另装 Node.js 或管理员权限。

1. 完全退出 Tabby（Mac 上按 `⌘Q`），下载并完整解压发布附件 `tabby-ssh-proxy-selector-版本号.zip`。[GitHub Releases](https://github.com/changeCat/tabby-ssh-proxy-selector/releases)
2. **macOS** 双击 `install.command`。**Windows** 双击 `install.cmd`。
3. 重新打开 Tabby，进入 **设置 → SSH 代理管理**，即可选择要使用代理的连接。

### 与 Sync Config 等插件共存

ZIP 中的 `tabby-ssh-proxy-selector.tgz` 是安装脚本使用的离线包。安装器会把它缓存到 Tabby 数据目录的 `plugins/.ssh-proxy-packages/`，并在 `plugins/package.json` 中登记本插件，同时保留已有插件。之后在 Tabby 中安装或更新 Sync Config 时，插件管理器可以从缓存恢复代理插件。

如果此前遇到两个插件交替消失，完全退出 Tabby，用本版安装脚本重装一次代理插件。重开后，如果 Sync Config 仍缺失，再从 Tabby 的插件管理器安装它。如果 macOS 无法直接打开脚本，可在终端输入 `sh `，将 `install.command` 拖入终端，然后回车。

### 自定义目录与卸载

默认插件目录在 Windows 上是 `%APPDATA%\tabby\plugins`，macOS 上是 `~/Library/Application Support/tabby/plugins`。便携版或自定义目录用户可将 `.tgz` 放在对应 `plugins` 目录下，在该目录运行 `npm install --save ./tabby-ssh-proxy-selector.tgz`，并保留该文件供后续插件安装使用。

手动卸载时，完全退出 Tabby，在 `plugins/package.json` 的 `dependencies` 中移除 `tabby-ssh-proxy-selector` 这一项，删除 `plugins/node_modules/tabby-ssh-proxy-selector` 和本插件的缓存目录 `plugins/.ssh-proxy-packages`。SSH 连接配置保存在 Tabby 中。[Tabby 数据目录说明](https://github.com/Eugeny/tabby/wiki/Config-file)

## 选择连接线路

1. 打开 **设置 → SSH 代理管理**。在 **代理预设** 中添加网关，例如「公司代理」使用 SOCKS5 的 `127.0.0.1:1080`。
2. 把「公司服务器」的 **分组代理** 设为「公司代理」。选择 **跟随分组** 的现有连接和新加入该组的连接都会采用这条线路。点击组名可折叠或展开连接列表，折叠后仍可更改分组代理。
3. 分组、单机和本次连接共用相同的下拉项：**不使用代理**、**按 SSH 配置连接**，以及全部命名预设。「按 SSH 配置连接」使用该机器在 Tabby 中设置的直连、SOCKS、HTTP 代理、跳板或代理命令。展开机器可查看具体路径。
4. 每个连接默认勾选 **跟随分组**，下拉框显示分组当前的线路，并随分组更新。要为单台机器指定线路，先取消勾选，再选择线路。重新勾选即可恢复跟随。点击 **保存更改** 后对新连接生效，已保存的单机例外会在下次打开时保留。

从单代理版本升级时，旧地址和端口会成为「默认代理」，原先勾选的连接会获得单机规则。其他连接保留原来的 SSH 线路。

插件的命名预设在 **设置 → SSH 代理管理** 中选择。要在 Tabby 自带的 SSH 编辑页手动填写代理，打开 **通用 → 连接** 下的 **Direct ▾**，选择 SOCKS 或 HTTP 代理。「身份验证方法」中的「代理」指用于密钥认证的 SSH Agent。

### 测试与临时连接

勾选 **使用代理认证** 可填写用户名和密码。取消勾选并保存后使用匿名连接，已填写的凭据会保留，重新勾选即可复用。密码框留空会保留原密码，输入新密码即可替换。要删除已保存的信息，点击 **清除凭据** 并保存。SOCKS5 支持用户名/密码认证，HTTP CONNECT 支持 Basic 认证。密码使用系统加密后存入配置，换电脑后可能需要重新输入。

点击连接名称展开详情，可查看将使用的路径、规则来源和最近成功的连接路径。**临时线路** 默认选中 **使用当前配置**。如果只想用另一条线路测试或打开标签页，在这里选择代理，再点右侧的按钮。重新选择 **使用当前配置** 即可恢复当前连接的设置。

- **测试连接** 会检查代理端口、目标隧道和 SSH 协议标识。启用代理认证时会向代理提交凭据。测试在 SSH 登录前结束。Tabby 原生代理命令和跳板请用 **连接一次** 验证。
- **连接一次** 使用页面当前选择打开新标签页。临时选择只用于这次连接及初始化重试，之后重连恢复已保存规则。测试和临时连接也可使用尚未保存的预设。

### 直连仍显示代理提示

展开连接查看路径。如果路径中出现了预期之外的代理地址，检查分组代理和 SSH 配置。希望这台机器始终直连时，将它的单机线路设为 **不使用代理**，保存并重新连接。该选项会在连接时跳过代理命令、跳板和 SOCKS/HTTP 代理。

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
