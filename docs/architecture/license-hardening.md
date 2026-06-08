# 授权加固

Apollo Map Studio 使用离线激活模型。它可以提高常见激活攻击的成本，但只要攻击者能够修改发布包或运行时，纯本地桌面校验就不可能做到不可破解。

## 覆盖的攻击面

| 攻击方式             | 防护措施                                                | 回归用例                                      |
| -------------------- | ------------------------------------------------------- | --------------------------------------------- |
| 伪造激活码           | Ed25519 签名校验，应用内只发布公钥                      | `electron/license/__tests__/crypto.test.cts`  |
| 使用其他机器的 token | 签名载荷绑定规范化 machine code                         | `crypto.test.cts`                             |
| 过期或畸形 token     | 严格校验 epoch 窗口、nonce、features 和字段长度         | `crypto.test.cts`                             |
| 降级重放             | 同一 license id 不接受更短有效期                        | `electron/license/manager.cts`                |
| 修改本地授权文件     | AES-GCM 主/影子文件，加 HMAC 密封状态文件               | `electron/license/__tests__/storage.test.cts` |
| 删除或破坏镜像文件   | 三文件镜像交叉检查，异常时标记为 tampered               | `storage.test.cts`                            |
| 跨机器复制授权 blob  | 每台机器派生 HKDF 密钥，复制后的加密 blob 无法读取      | `storage.test.cts`                            |
| 回拨系统时间         | `TimeGuard` 高水位时间戳、anchor mtime 检查和粘性篡改位 | `electron/license/time-guard.cts`             |

## 运行要求

- 不要把 `tools/license-gen/keys/private.pem` 放进发布包或源码仓库。应用中只能包含 `electron/license/public-key.cts`。
- 发布产物必须使用 `pnpm build:desktop` 或 `pnpm package*` 脚本生成。流程会先编译可读源码，再密封 access guard 和选定的 `dist-electron/license/*.cjs` 文件，最后写入发布文件完整性清单。
- `electron:dev` 保持使用普通 TypeScript 构建。产物加固是发布构建步骤，不是源码混淆步骤。
- `build:electron` 会清理 `dist-electron` 后重新编译；`build:electron:hardened` 只密封这份新输出，避免复用陈旧产物。
- 续期 token 应使用同一个 `lic` id，并提供更晚的 `expires`。同一 id 的旧有效期 token 会被拒绝。
- 渲染进程遇到 `tampered`、`machine_mismatch`、`invalid`、`expired_trial` 或 `expired_license` 状态时必须按只读处理。
- 高价值部署应把离线激活与服务端权益校验或签名更新渠道结合使用。单靠本地校验可以被二进制补丁绕过。

## 验证

运行源码级授权加固检查：

```bash
rm -rf .tmp/electron-license-tests
pnpm exec tsc -p tsconfig.electron.test.json
node --test .tmp/electron-license-tests/electron/license/__tests__/*.test.cjs
```

运行发布产物加固检查：

```bash
pnpm build:desktop
pnpm verify:electron-hardening
```

产物检查会拒绝 sourcemap，要求受保护的 Electron access guard 和授权模块已经被 AES-GCM 密封，并使用 `dist-electron/ams-integrity.cjs` 校验生成的 `dist/` 与 `dist-electron/` 文件。Electron 测试文件会被 TypeScript 发布构建排除；如果陈旧测试产物重新出现，验证脚本也会拒绝通过。
