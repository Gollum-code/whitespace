// Cloudflare Pages Functions 入口：把 /api/* 路由转发给共享的 Worker 逻辑。
// 部署时 Pages 会自动打包本目录，无需额外配置。
import { handle } from '../../worker/handler.js'

export async function onRequest(context) {
  return handle(context.request, context.env)
}
