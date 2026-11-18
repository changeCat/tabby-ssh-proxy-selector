# Tabby SSH 代理选择器

在 Tabby 的「SSH 代理管理」中配置一个 SOCKS5 或 HTTP CONNECT 代理，按 SSH 连接或分组勾选要使用它的配置。其他连接继续使用各自在 Tabby 中的设置。

## Windows 安装与升级

1. 完全退出 Tabby，从 [GitHub Releases](https://github.com/changeCat/tabby-ssh-proxy-selector/releases) 下载版本附件 `tabby-ssh-proxy-selector-版本号.zip`。双击安装从 **0.0.8** 开始提供。
2. 将 ZIP **全部解压**到普通文件夹，双击其中的 **`install.cmd`**。安装器会把插件及其运行依赖复制到当前用户的 Tabby 插件目录。升级也使用同样的步骤。
3. 打开 Tabby，在 **设置 → SSH 代理管理** 中确认插件已加载。

使用发布包只需 Tabby 和 Windows 自带的 PowerShell，无需安装 Node.js、运行 npm 或申请管理员权限。

便携版或自定义配置目录的用户，可以手动将解压出的整个 `tabby-ssh-proxy-selector` 文件夹复制到对应的 `plugins\node_modules` 下。标准 Windows 安装的插件入口位于：

```text
%APPDATA%\tabby\plugins\node_modules\tabby-ssh-proxy-selector\dist\index.js
```

## 配置代理

打开 **设置 → SSH 代理管理**，选择代理协议，填写代理地址和端口（例如 SOCKS5 的 `127.0.0.1:1080`），勾选目标 SSH 配置，点击 **保存并应用**。重新建立 SSH 连接以使用新设置。代理服务需已在所填地址和端口上运行。

如果设置页没有出现，检查上述入口文件是否存在，并完全退出后重开 Tabby。如果设置页已加载但连接失败，先核对代理协议、地址、端口及勾选的 SSH 配置。标准 Windows 安装的插件日志位于 `%APPDATA%\tabby\tabby-ssh-proxy-selector.log`。

## 卸载

完全退出 Tabby，删除插件目录中的 `node_modules\tabby-ssh-proxy-selector` 文件夹，再打开 Tabby。SSH 连接配置保存在 Tabby 中。

## 从源码构建

开发环境需要 Node.js 18 或更高版本及 npm。在项目根目录执行：

```sh
npm ci
npm run build
```

- `npm run pack:release` 在 Windows 上生成与发布流程相同的安装 ZIP，输出到项目根目录。此命令会自动编译。
- `npm pack` 生成带运行依赖的 npm 包，也会自动编译。
- 发布新版本时同步更新 `package.json` 和 `package-lock.json` 的版本号。推送到 `main` 或 `master` 后，工作流会在版本高于已有版本标签时构建并上传 ZIP。也可手动触发。[发布工作流](.github/workflows/release.yml)

设置界面和分组选择逻辑在 [settings-tab.component.ts](src/settings-tab.component.ts)，默认配置在 [config.ts](src/config.ts)。适配 Tabby 的 SSH 连接入口时，参见 [ssh-proxy.service.ts](src/ssh-proxy.service.ts)；SOCKS5 和 HTTP CONNECT 的握手实现在 [proxy-socket.ts](src/proxy-socket.ts)。
