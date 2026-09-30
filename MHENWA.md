# Mhenwa 定制版

本 fork 基于 [CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground) 的 v0.7.14，保留原项目与 MIT 许可。本次同步日期为 2026-09-30，对应定制部署补丁 `20260930-12`；这是源码同步，不是新的上游版本，应用版本仍为 0.7.14。

## 当前定制功能

- API 总配置分为「全局配置 / 画廊配置 / Agent 配置」。服务地址、Key、代理和超时只配置一次，各用途的模型与调用方式独立。
- 模型选择器使用当前服务的 `/models` 获取模型，支持搜索、刷新与手动填写未列出的模型 ID；开启同源代理时也可获取模型列表。
- 画廊默认使用 Images API，生成和编辑分别请求 `/images/generations`、`/images/edits`。实际请求与任务记录使用输入栏所选图片模型，不被另一用途的模型覆盖。
- Agent 使用独立的对话模型和生图模型。默认混合模式：对话通过 `/responses`，由模型自动选择是否调用生图函数；执行生图函数时使用 Images API。普通聊天不强制生成图片。
- Agent 也可选择原生 Responses 模式，通过 `image_generation` 工具生图，或者关闭 Agent。是否计入工具调用费用由 API 服务的计费规则决定。
- Agent 使用 ChatGPT 风格左侧栏，支持新对话、搜索标题及消息、时间分组、重命名和确认删除；桌面可折叠，手机使用抽屉。
- Enter 发送、Shift+Enter 换行，兼容 Ctrl / ⌘ + Enter；输入法候选确认、`@` 图片选择和长按 Enter 不会误发送。
- 画廊和 Agent 不显示审核选项，后续请求使用 `auto`。Agent 不显示或显式指定输出压缩率，使用接口默认值；画廊原有 JPEG 压缩设置保留。
- 修复旧配置迁移、预置更新合并、任务快照和历史恢复的模型隔离。保留已有 Key、会话、草稿与图片，旧任务参数记录不重写。

## 配置方式

设置 → API 配置中选择一个 OpenAI 兼容服务，在全局配置中填写地址与 Key，然后分别配置画廊、Agent 用途即可。Agent 对话模型必须支持 Responses API 和函数调用，不能使用 GPT Image 模型充当对话模型。

预置也可以使用一个服务 profile 的 `usage` 字段，例如：

```json
{
  "profiles": [
    {
      "id": "my-service",
      "name": "我的 API 服务",
      "provider": "openai",
      "baseUrl": "https://api.example.com/v1",
      "model": "gpt-image-2",
      "apiMode": "images",
      "isDefault": true,
      "usage": {
        "gallery": {
          "apiMode": "images",
          "model": "gpt-image-2"
        },
        "agent": {
          "mode": "hybrid",
          "textModel": "your-responses-model",
          "imageModel": "gpt-image-2"
        }
      }
    }
  ]
}
```

替换示例地址及模型为实际服务提供的值。预置中的这些值只是默认值；是否锁定仍由部署环境变量决定。不要把真实 API Key 写入公开预置、仓库或分享 URL，让使用者在浏览器中自行填写。

旧版独立 Agent profile 保留兼容；如果它使用不同地址或 Key，不会静默合并到当前服务。界面会说明如何切换为共用服务。

## 开发、验证与部署

```sh
npm ci
npm run build
npm test
npm run dev
```

完整 Docker 部署使用原项目的多阶段构建文件：

```sh
docker build -f deploy/Dockerfile -t gpt-image-playground:mhenwa .
docker run -d --name gpt-image-playground -p 8080:80 gpt-image-playground:mhenwa
```

需要同源 API 代理时，按 README 中的 Docker 环境变量配置 `ENABLE_API_PROXY` 和 `API_PROXY_URL`。代理地址只配置服务基址，认证使用用户填写的 Key；不应把服务器上的生产凭证写入镜像。

`deploy/Dockerfile` 会设置运行时 Vite 占位符，容器启动时再注入代理与预置配置。不要用缺少占位符的普通静态构建直接替换现有 Docker 部署的资源。

`deploy/Dockerfile.mhenwa` 保留了实际部署的静态补丁配方，依赖已核验的基础镜像、预构建的 `dist` 和只包含 `dist` / `deploy` 的专用构建上下文；它不是完整构建入口。自行部署优先使用上述 `deploy/Dockerfile`。

运行时仍是静态前端和 Nginx，不新增 Node 或数据库服务。每个浏览器保存自己的设置、图片和历史，不提供共享账号、团队共享画廊或计费后台。

本次源码已通过 45 个测试文件、710 项测试及 TypeScript / Vite 生产构建。测试使用 mock / fixture，不依赖真实密钥或付费生图请求。
