# SourcePort 车质网 OpenCLI adapter

安装到本机 OpenCLI：

```bash
mkdir -p ~/.opencli/clis/12365auto
cp *.js ~/.opencli/clis/12365auto/
opencli validate 12365auto
```

命令通过车质网公开只读页面获取投诉列表；页面要求验证码、登录或结构变化时应返回失败，由 SourcePort 保留 degraded/blocked 状态。
