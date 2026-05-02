# Apollo Map Studio License Generator

`tools/license-gen` 是 Apollo Map Studio 的离线授权签发工具目录。桌面应用只内置 Ed25519 公钥，私钥只应存在于签发环境中，不能随应用发布。

## 目录结构

```text
tools/license-gen/
  gen-keys.mjs        # 生成或轮换 Ed25519 keypair
  issue.mjs           # 按机器码签发 activation code
  verify.mjs          # 用公钥校验 activation code
  package.json        # npm scripts
  keys/
    .gitkeep
    private.pem       # 生成后出现，必须保密，0600
    public.pem        # 生成后出现，可用于人工核对
```

应用侧相关文件：

```text
electron/license/public-key.cts   # 内置公钥、APP_PEPPER、TOKEN_PREFIX
electron/license/manager.cts      # 主进程授权状态机和 IPC
electron/license/crypto.cts       # Ed25519 / AES-GCM / HMAC / HKDF
electron/license/machine-id.cts   # 机器码生成
electron/license/storage.cts      # license 三文件镜像存储
electron/license/time-guard.cts   # 时间回拨和篡改检测
electron/license/types.cts        # token payload 和 renderer state 类型
```

## Token 格式

activation code 是可打印字符串：

```text
APMS1.<base64url(payload)>.<base64url(ed25519-signature)>
```

payload：

```ts
interface LicensePayload {
  v: 1;
  lic: string;
  machine: string;
  issued: number;
  expires: number; // epoch ms, 0 = perpetual
  features?: string[];
  name?: string;
  nonce: string;
}
```

签名内容是 `bodyB64` 字符串本身。桌面应用用 `electron/license/public-key.cts` 中的 `LICENSE_PUBLIC_KEY_PEM` 校验签名。

## 首次生成 keypair

在受控签发机器上运行：

```sh
node tools/license-gen/gen-keys.mjs
```

效果：

- 写入 `tools/license-gen/keys/private.pem`，权限 `0600`。
- 写入 `tools/license-gen/keys/public.pem`。
- 原子替换 `electron/license/public-key.cts` 中的 `LICENSE_PUBLIC_KEY_PEM`。

必须提交并发布被改写的 `electron/license/public-key.cts`，否则应用仍使用旧公钥，无法识别新私钥签出的 activation code。

如果 `private.pem` 已存在，脚本默认拒绝覆盖。

## 轮换 keypair

```sh
node tools/license-gen/gen-keys.mjs --rotate
```

轮换是发布级事件：

- 需要提交新的 `electron/license/public-key.cts`。
- 需要构建并分发新安装包。
- 新构建会拒绝旧私钥签发的 activation code。
- 已安装旧版本应用仍持有旧公钥，会继续识别旧 code，直到升级。
- 需要为客户重新签发 code。

不要轮换 `APP_PEPPER`，除非同时设计迁移。`APP_PEPPER` 参与本机存储加密和 HMAC key 派生，改变它会导致现有本地 license / clock state 无法读取。

## 获取客户机器码

客户在 Apollo Map Studio 的授权弹窗中复制机器码：

```text
XXXX-XXXX-XXXX-XXXX
```

机器码生成逻辑在 `electron/license/machine-id.cts`：

1. 收集平台、架构、OS release major、hostname。
2. 收集 CPU model、CPU count、内存 GiB 桶。
3. 选择稳定的非虚拟 MAC，失败时回退到可复现 MAC 或 `no-mac`。
4. Linux 读取 `/etc/machine-id`，macOS 读取 `IOPlatformUUID`，Windows 读取 `wmic csproduct UUID`，失败时为 `no-disk`。
5. 使用 `APP_PEPPER` 做 HMAC-SHA256。
6. 取 80 bits 编成 16 字符 base32，并分组为 `XXXX-XXXX-XXXX-XXXX`。
7. 首次结果写入 `userData/.lic-machine.dat`，用于后续检测机器指纹漂移。

风险点：主机名、MAC、磁盘/系统 UUID 改变可能导致机器码漂移；虚拟机克隆或磁盘镜像复制可能复制部分硬件信号，这是离线授权的固有限制。

## 签发 activation code

基础命令：

```sh
node tools/license-gen/issue.mjs \
  --machine ABCD-EFGH-JKLM-NPQR \
  --days 365 \
  --name "Customer Inc."
```

参数：

| 参数                | 默认值                               | 说明                                         |
| ------------------- | ------------------------------------ | -------------------------------------------- |
| `--machine` / `--m` | 必填                                 | 客户机器码，格式必须是 `ABCD-EFGH-JKLM-NPQR` |
| `--days`            | `365`                                | 从当前时间起多少天后过期，范围 `(0, 36525]`  |
| `--expires`         | 无                                   | ISO-8601 绝对过期时间；提供后覆盖 `--days`   |
| `--name`            | 空                                   | 客户名，显示在授权弹窗                       |
| `--lic`             | 自动生成                             | 授权 ID，默认形如 `LIC-YYYY-MM-DD-XXXXXX`    |
| `--features`        | 无                                   | 逗号分隔 feature flags，当前预留             |
| `--key`             | `tools/license-gen/keys/private.pem` | 签名私钥路径                                 |
| `--quiet`           | false                                | 只向 stdout 输出 code                        |

`issue.mjs` 把 activation code 输出到 stdout，把签发摘要输出到 stderr，因此可直接重定向：

```sh
node tools/license-gen/issue.mjs \
  --machine ABCD-EFGH-JKLM-NPQR \
  --days 365 \
  --name "Customer Inc." \
  --quiet > code.txt
```

不建议日常签发 `expires=0` 的永久授权。应用支持永久授权，但过期时间为 0 会让后续续约和风险控制更困难。

## 本地校验 code

用应用内置公钥校验：

```sh
node tools/license-gen/verify.mjs --code "$(cat code.txt)"
```

或指定公钥：

```sh
node tools/license-gen/verify.mjs \
  --code "$(cat code.txt)" \
  --key tools/license-gen/keys/public.pem
```

输出包含 `valid` 和解析后的 payload。退出码：

- `0`：签名有效。
- `1`：缺少 `--code`。
- `2`：token 格式错误。
- `3`：无法从 `electron/license/public-key.cts` 提取内置公钥。
- `4`：签名无效。

## 桌面端激活链路

1. Renderer 调用 `licenseBridge.getState()`，`useLicenseSync()` 把状态写入 `licenseStore`。
2. 用户打开 `ActivationDialog`，复制 `state.machineCode` 给签发方。
3. 签发方使用 `issue.mjs` 生成 `APMS1...` code。
4. 用户粘贴 code，renderer 调用 `licenseBridge.activate(trimmed)`。
5. Electron 主进程 `LicenseManager.activate()` 检查格式、解析 token、验签、检查机器绑定、检查过期、拒绝同 license ID 的降级 replay，然后保存 license。
6. `LicenseManager` 重新 `computeState()` 并广播到所有窗口。
7. Renderer 收到 `LicenseState`，banner、dialog、`assertEditable()` 都使用同一状态。

## LicenseState

主进程向 renderer 暴露 sanitised state：

```ts
interface LicenseState {
  status:
    | 'trial'
    | 'activated'
    | 'expired_trial'
    | 'expired_license'
    | 'tampered'
    | 'machine_mismatch'
    | 'invalid'
    | 'not_started';
  canEdit: boolean;
  machineCode: string;
  trialStart: number;
  trialEnd: number;
  daysRemaining: number | null;
  hoursRemaining: number | null;
  license: {
    id: string;
    name: string;
    issued: number;
    expires: number;
  } | null;
  checkedAt: number;
  reason: string;
}
```

编辑权限只看 `canEdit`。`trial` 未过期和 `activated` 未过期可编辑，其它状态只读。

## 试用期和时间防篡改

`LicenseManager` 当前试用期为 7 天。首次运行由 `TimeGuard` 写入 `firstSeen`。无有效 license 时：

- `now < firstSeen` -> `not_started`，只读。
- `now >= firstSeen + 7 days` -> `expired_trial`，只读。
- 其它 -> `trial`，可编辑。

`TimeGuard` 维护 `userData/.lic-clock.dat`，AES-GCM 加密并 HMAC 封装。检测手段包括：

- 高水位时间戳 `lastSeen`。
- 5 分钟 grace 之外的系统时间回拨检测。
- Electron app path、package.json、process.execPath 的 mtime 锚点。
- session / tick 计数。
- `Date.now()` 与 `performance.now()` 漂移检测。

tampered 是 sticky flag。生产 IPC 没有暴露 reset。恢复通常需要支持流程指导清理用户数据目录下授权/clock 文件并重新激活。

## 本地存储

`LicenseStorage` 使用三文件镜像：

```text
userData/license.dat      # 主文件，AES-GCM 加密 token + meta，外层 HMAC
userData/.lic-state.json  # 明文 JSON envelope：tokenHash、machine、activatedAt、nonce、mac
userData/.lic-shadow.dat  # 加密 shadow copy，外层 HMAC
```

读取时会交叉检查三文件是否存在、hash 是否一致、shadow 是否匹配 state、HMAC 是否正确、token body 是否可解析。任一失败返回 tampered，主进程进入只读状态。

## 只读保护链路

授权保护有多层：

- `LicenseManager.computeState()` 生成 `canEdit`。
- `useLicenseSync()` 将主进程状态同步到 `licenseStore`。
- `useActionDispatcher.execute()` 对 edit/tool/selection 类 action 和 `connectLanes` 调用 `assertEditable()`。
- `mapStore.addEntity/updateEntity/removeEntity/reparentEntity` 也调用 `assertEditable()`。
- `LicenseBanner` 和 `ActivationDialog` 负责提示和激活入口。

风险点：导入替换类 API 当前不经过 `assertEditable()`，调用方应避免把它暴露成只读状态下的编辑后门。

## package scripts

在 `tools/license-gen` 目录：

```sh
npm run gen-keys
npm run issue -- --machine ABCD-EFGH-JKLM-NPQR --days 365
npm run verify -- --code "$(cat code.txt)"
```

在仓库根目录也可以直接调用：

```sh
node tools/license-gen/gen-keys.mjs
node tools/license-gen/issue.mjs --machine ABCD-EFGH-JKLM-NPQR --days 365
node tools/license-gen/verify.mjs --code "$(cat code.txt)"
```

这些脚本只使用 Node 内置模块，不需要第三方依赖。

## 运维建议

- 私钥只放在受限签发环境，不放进构建机镜像、客户机器、演示包或问题复现附件。
- `tools/license-gen/keys/private.pem` 应保持 gitignored；提交前检查 `git status` 和 staged diff。
- 为每次签发记录 `lic`、machine、name、issued、expires、签发人和工单号。
- 续期应复用同一 `lic` 并给更晚的 `expires`；当前 manager 接受升级但拒绝同 license 的过期时间降级。
- 签错机器码时重新签发新 code；旧 code 无法在其它机器使用。
- 私钥泄漏时执行 key rotation，发布新构建，并重签客户 code。
- 机器不匹配时先确认换机、换主板、换系统盘、克隆 VM、修改主机名/MAC 等因素。
- tampered 时先确认系统时钟、休眠唤醒、用户数据目录同步/还原、杀毒隔离文件等因素。

## 故障排查

### private key not found

先运行：

```sh
node tools/license-gen/gen-keys.mjs
```

如果私钥在外部安全目录，用 `--key /path/to/private.pem`。

### invalid signature

常见原因：

- code 由另一套私钥签发。
- `electron/license/public-key.cts` 没有随 release 提交或构建。
- 用户复制 code 时丢字符。空白会被移除，但缺失字符无法修复。

先用 `verify.mjs` 对同一 code 做本地校验。

### machine mismatch

code 的 `payload.machine` 与当前机器码不一致。重新向客户索取授权弹窗里的机器码并签发。

### expired

`payload.expires > 0 && trustedNow > expires`。签发新的更晚过期时间。

### replay

同一 `lic` 已安装更晚过期时间的 license。不要用旧 code 覆盖新 code；当前产品逻辑不支持通过 activation code 降级。

### tampered

可能原因包括系统时间回拨、授权文件被删改或从备份恢复、用户数据目录被同步工具部分回滚、机器指纹首次记录与当前结果不一致。处理方式应由支持流程决定，通常需要修正系统时间、清理损坏授权状态并重新激活。

## 安全边界

可以防：

- 没有私钥时伪造 activation code。
- 把一台机器的 code 直接发给另一台机器使用。
- 简单修改本地 license 文件。
- 简单回拨系统时间延长试用或授权。
- 同一 license ID 用旧短期 code 覆盖已安装的长期 code。

不能完全防：

- 攻击者完全控制客户机器、反编译并 patch Electron/renderer/main 代码。
- 攻击者复制完整虚拟机或高度相同的磁盘镜像导致机器信号一致。
- 私钥泄漏后被第三方无限签发，除非发布新公钥构建并重签。
