# tabby-ssh-proxy-selector

## 1. 功能

一个用于 Tabby 的 SSH 代理插件：

- 在 Tabby 设置页中配置一个统一的代理服务器
- 勾选哪些 SSH Profile 需要走代理
- 在 SSH 连接建立前，把代理参数和代理 socket 注入到 Tabby / SSH 运行时
- 让被勾选的连接走 SOCKS5 或 HTTP CONNECT
- 未勾选的连接保持原样直连

---

## 2. 项目架构

项目可以分为 4 层：

1. **配置默认值层**  
   由 [`SSHProxySelectorConfigProvider`](src/config.ts:5) 提供默认配置。

2. **设置 UI 层**  
   由 [`ProxyManagerSettingsProvider`](src/settings.provider.ts:6) 和 [`ProxyManagerSettingsComponent`](src/settings-tab.component.ts:61) 提供 Tabby 设置页面。

3. **代理连接层**  
   由 [`createProxySocket()`](src/proxy-socket.ts:7) 负责创建 SOCKS5 或 HTTP CONNECT socket。

4. **SSH 注入层**  
   由 [`SSHProxyService`](src/ssh-proxy.service.ts:8) 完成运行时 patch、profile 识别、socket 注入、代理字段注入。

---

## 3. 目录与文件职责

### 3.1 根目录文件

- [`package.json`](package.json)  
  定义插件名称、版本号、依赖、构建脚本、打包脚本。

- [`package-lock.json`](package-lock.json)  
  npm 依赖锁文件，确保安装结果稳定。

- [`tsconfig.json`](tsconfig.json)  
  TypeScript 编译配置。

- [`README.md`](README.md)  
  当前说明文档。

### 3.2 `src` 目录文件

- [`src/index.ts`](src/index.ts)  
  Angular 模块入口。负责注册设置页、配置提供器，并实例化 [`SSHProxyService`](src/ssh-proxy.service.ts:8)。

- [`src/config.ts`](src/config.ts)  
  定义插件默认配置，例如默认代理协议、默认地址、默认端口、已选 Profile 列表。

- [`src/settings.provider.ts`](src/settings.provider.ts)  
  把设置页面挂到 Tabby 设置系统中，左侧菜单标题为“SSH 代理管理”。

- [`src/settings-tab.component.ts`](src/settings-tab.component.ts)  
  设置页面本体。负责读取配置、展示 SSH Profiles、保存用户选择。

- [`src/ssh-proxy.service.ts`](src/ssh-proxy.service.ts)  
  核心逻辑文件。负责：
  - 查找可 patch 的 SSH 连接方法
  - 识别当前连接对应的 Profile
  - 判断该 Profile 是否需要走代理
  - 注入代理字段
  - 必要时注入 socket
  - 清理运行时 `proxyCommand`

- [`src/proxy-socket.ts`](src/proxy-socket.ts)  
  创建代理 socket：
  - SOCKS5 走 `socks` 包
  - HTTP CONNECT 走 Node `net` 直连代理后发 CONNECT 请求

- [`src/types.ts`](src/types.ts)  
  定义代理协议和配置结构类型。

- [`src/logger.ts`](src/logger.ts)  
  插件日志封装。当前已保留必要日志，去掉了大部分无用调试输出。

- [`src/shims.d.ts`](src/shims.d.ts)  
  类型声明辅助文件，用于兼容构建时缺失的声明。

---

## 4. 配置结构说明

当前插件主要使用下面这段配置：

```json
{
  "proxyManager": {
    "protocol": "socks5",
    "host": "127.0.0.1",
    "port": "1080",
    "selectedProfileIds": [
      "你的-ssh-profile-id"
    ]
  }
}
```

字段说明：

- `protocol`：代理协议
  - `socks5`
  - `http-connect`
- `host`：代理地址
- `port`：代理端口
- `selectedProfileIds`：需要走代理的 SSH Profile ID 列表

默认值定义在 [`src/config.ts`](src/config.ts) 中。

---

## 5. 快速开始

下面按最简单的方式说明。

### 5.1 你需要提前准备

在开始前，请确认电脑上已经有：

- Node.js 18 或更高版本
- npm
- Tabby
- 一个可用的代理地址，例如：
  - SOCKS5：`127.0.0.1:1080`
  - HTTP CONNECT：`127.0.0.1:7890`

### 5.2 安装依赖

在项目根目录执行：

```bat
npm install --legacy-peer-deps
```

### 5.3 构建插件

执行：

```bat
npm run build
```

如果构建成功，会生成 `dist` 目录。

### 5.4 打包插件

执行：

```bat
npm run pack
```

或者：

```bat
npm pack
```

成功后，项目根目录会生成类似文件：

- `tabby-ssh-proxy-selector-0.0.1.tgz`

这个 `.tgz` 文件就是可以安装到 Tabby 的插件包。

### 5.5 GitHub 自动构建并发布

如果项目已经托管到 GitHub，可以直接用 [`release-package`](.github/workflows/release.yml) 工作流在 GitHub 页面上手动构建和发布。

触发方式：

1. 先修改 [`package.json`](package.json) 里的 `version` 并推送到 GitHub
2. 打开仓库的 **Actions** 页面
3. 选择 [`release-package`](.github/workflows/release.yml)
4. 点击 **Run workflow**
5. 在输入框里填写版本 tag，例如 `v0.0.2`
6. 点击运行

触发后，GitHub Actions 会自动执行：

1. 安装依赖
2. 执行 `npm run build`
3. 执行 `npm pack`
4. 在 GitHub Releases 上传生成的 `.tgz` 包

发布完成后，你可以在仓库的 **Releases** 页面看到对应版本，例如：

- `v0.0.2`

工作流会自动创建对应 tag、构建 `.tgz` 包，并在 GitHub Releases 中生成对应版本发布页。

---

## 6. 版本号该怎么改

每次你准备重新发布一个版本，都建议先改 [`package.json`](package.json) 里的 `version`。

当前版本示例：

```json
"version": "0.0.1"
```

发布步骤：

1. 修改 [`package.json`](package.json) 的 `version`
2. 提交并推送代码
3. 打开 GitHub 仓库的 **Actions** 页面
4. 手动运行 [`release-package`](.github/workflows/release.yml)
5. 输入版本 tag，例如 `v0.0.2`
6. 等待 GitHub Actions 自动创建 Release 并上传 `.tgz`
7. 复制 GitHub Release 附件直链
8. 在 Tabby 中使用该直链重新安装新包

---

## 7. 一步一步安装到 Tabby

下面是 Windows 下最容易成功的安装方式。

### 7.1 获取 GitHub Release 附件直链

进入仓库的 **Releases** 页面后，右键复制对应 `.tgz` 附件链接。

链接格式通常类似：

- `https://github.com/<owner>/<repo>/releases/download/v0.0.2/tabby-ssh-proxy-selector-0.0.2.tgz`

### 7.2 找到 Tabby 插件目录

进入插件目录：

- `C:/Users/你的用户名/AppData/Roaming/tabby/plugins`

### 7.3 安装插件

打开终端，执行：

```bat
& "C:/Program Files/nodejs/npm.cmd" install "https://github.com/<owner>/<repo>/releases/download/v0.0.2/tabby-ssh-proxy-selector-0.0.2.tgz" --legacy-peer-deps
```

把 `<owner>` 和 `<repo>` 替换成你 GitHub 仓库的实际值即可。这里使用的是 GitHub Release 附件直链，不需要先把包下载到本地目录。

### 7.4 重启 Tabby

安装完成后：

1. 完全退出 Tabby
2. 再重新打开 Tabby

注意：只是关闭窗口有时不够，最好确认 Tabby 进程已经退出。

---

## 8. 在 Tabby 里如何使用

### 8.1 打开设置页

重启 Tabby 后，进入设置页面。

左侧应该能看到：

- `SSH 代理管理`

如果看不到，说明插件没有正确加载，先看“常见问题”。

### 8.2 填写代理信息

在页面中：

1. 选择代理协议：
   - `SOCKS5`
   - `HTTP CONNECT`
2. 填写代理 IP
3. 填写代理端口
4. 勾选需要走代理的 SSH 连接
5. 点击“保存并应用”

---

## 9. 卸载插件

### 9.1 用 npm 卸载

进入 Tabby 插件目录后执行：

```bat
& "C:/Program Files/nodejs/npm.cmd" uninstall tabby-ssh-proxy-selector
```

### 9.2 手动删除（兜底方式）

如果 npm 卸载失败：

1. 完全退出 Tabby
2. 进入插件目录
3. 删除和 `tabby-ssh-proxy-selector` 相关的目录或文件
4. 重新打开 Tabby

---

## 10. 升级插件

如果你已经装过旧版本，升级时建议按下面流程：

1. 修改 [`package.json`](package.json) 版本号
2. 重新打包生成新的 `.tgz`，或者从 GitHub Releases 下载新版 `.tgz`
3. 完全退出 Tabby
4. 在插件目录重新执行安装命令
5. 重新打开 Tabby
6. 检查设置页是否正常出现

如果升级后表现异常，最稳妥的方法是：

1. 先卸载旧版
2. 再安装新版
3. 再重启 Tabby

---

## 11. 开发者二次修改指南

### 11.1 如果你要改默认代理

改 [`defaults`](src/config.ts:6) 和 [`platformDefaults`](src/config.ts:15) 里的内容。

### 11.2 如果你要改设置页标题

改 [`title`](src/settings.provider.ts:9)。

### 11.3 如果你要扩展代理认证

优先改这几个位置：

- [`ProxyManagerConfig`](src/types.ts:3)
- [`ProxyManagerSettingsComponent`](src/settings-tab.component.ts:61)
- [`createProxySocket()`](src/proxy-socket.ts:7)

### 11.4 如果你要增加“每个 Profile 不同代理”

当前代码不是这种结构，需要重新设计配置模型。重点会涉及：

- [`src/types.ts`](src/types.ts)
- [`src/settings-tab.component.ts`](src/settings-tab.component.ts)
- [`getProxyForProfile()`](src/ssh-proxy.service.ts:534)

### 11.5 如果你要适配新的 Tabby 版本

重点检查：

- [`patchSSH()`](src/ssh-proxy.service.ts:24)
- [`patchSSHSessionStart()`](src/ssh-proxy.service.ts:138)
- [`patchRusshTransport()`](src/ssh-proxy.service.ts:345)
- [`getSSHServicePatchTarget()`](src/ssh-proxy.service.ts:308)
- [`injectSock()`](src/ssh-proxy.service.ts:688)

因为 Tabby 升级后，真正的连接入口、对象结构、可写属性都可能变化。

---

## 12. 常见问题与解决办法

### 问题 1：设置页里没有看到“SSH 代理管理”

可能原因：

- 插件没有安装成功
- Tabby 没有完全重启
- `.tgz` 安装的是旧版本
- 版本号没改，旧缓存仍在使用

解决办法：

1. 确认已经执行过安装命令
2. 完全退出并重启 Tabby
3. 确认 [`package.json`](package.json) 的版本号已经变化
4. 重新打包并重新安装
5. 必要时先卸载旧版再安装新版

### 问题 2：能看到设置页，但 SSH 还是直连

可能原因：

- 你没有勾选对应 SSH Profile
- 代理地址或端口填错
- 本机代理程序本身没启动
- 当前 Tabby 版本连接链路变化，patch 没命中

解决办法：

1. 检查目标 SSH 是否被勾选
2. 检查代理协议是否填对
3. 检查代理端口是否真的可用
4. 先用一个确定可用的代理，例如 `127.0.0.1:1080`

### 问题 3：安装命令报错

常见原因：

- Node.js 没安装
- npm 路径不对
- `.tgz` 路径不对
- 没有权限写入 Tabby 插件目录

解决办法：

1. 执行 `node -v` 和 `npm -v` 确认 Node/npm 可用
2. 检查安装命令里的路径是否正确
3. 用管理员权限重新打开终端再试一次
4. 必要时复制 `.tgz` 到一个更短、更简单的路径再安装

### 问题 4：明明重新打包了，Tabby 里还是旧代码

这是最常见的问题之一。

解决办法：

1. 先改 [`package.json`](package.json) 里的版本号
2. 再重新打包
3. 卸载旧版或覆盖安装新版
4. 完全退出 Tabby
5. 再打开 Tabby

---

## 13. 后续可扩展方向

后面如果继续迭代，建议优先考虑：

1. 支持代理认证（用户名 / 密码）
2. 支持每个 Profile 绑定不同代理
3. 支持代理连通性测试按钮
4. 支持导入 / 导出代理配置
5. 支持更明确的错误提示 UI
6. 适配更多 Tabby 版本的连接链路

---

## 14. 最后总结

这个项目现在的定位非常明确：

- 它是一个 Tabby SSH 代理插件
- 核心思路是“运行时注入代理”
- 使用方式是“全局配置一个代理 + 勾选要代理的 SSH Profile”
- 打包方式是标准 npm `.tgz`
- 安装方式是往 Tabby 插件目录执行 `npm install`

如果后续维护人员只想快速接手，优先看：

- [`src/index.ts`](src/index.ts)
- [`src/settings-tab.component.ts`](src/settings-tab.component.ts)
- [`src/ssh-proxy.service.ts`](src/ssh-proxy.service.ts)
- [`src/proxy-socket.ts`](src/proxy-socket.ts)

这四个文件已经覆盖了项目 90% 以上的核心逻辑。
