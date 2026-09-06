# 车质网 live probe

适配器只通过 OpenCLI 的只读命令访问车质网，不绕过验证码、登录或限流。运行：

```bash
sourceport doctor 12365auto --json
```

如果结果为 `degraded`，先确认 OpenCLI daemon 和浏览器扩展：

```bash
opencli doctor
opencli list | grep -E '12365|车质|complaint'
```

适配器需要以下只读命令映射：

- `12365auto complaints <query> --limit <n>`
- `12365auto complaint <id>`
- `12365auto ranking --limit <n>`
- `12365auto complaint-sales-ratio [query] --limit <n>`

命令未注册、页面要求验证码/登录、请求被限流或页面结构变化时，doctor 和执行结果必须保留 `degraded`/`blocked`、failure 和 recoveryActions；不得把空结果当作成功。
