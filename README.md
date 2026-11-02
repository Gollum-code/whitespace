# 留白 · Whitespace

把不熟的词**留白**，等它在新的语境里长回来。

用真实素材学英语的最小闭环：**导入 → 点词 → 出题 → 复习**。

- 纯前端 SPA，数据只存在你自己的浏览器（IndexedDB）
- 没有账号、没有数据库、没有服务器要运维
- AI 出题走一个几十行的边缘函数代理，API key 不进浏览器
- 复习调度用 [FSRS](https://github.com/open-spaced-repetition/ts-fsrs)（Anki 同款算法）

名字：**留白** = 挖空就是留白，复习是把留白填回去。

---

## 快速开始

```bash
# 1. 装依赖（Windows 上如果 npm 被 PowerShell 拦了，用 npm.cmd）
npm install

# 2. 配置 key
copy .env.example .env.local    # macOS/Linux: cp .env.example .env.local
# 编辑 .env.local，填 AI_API_KEY（DeepSeek / OpenAI / 任何 OpenAI 兼容接口都行）

# 3. 开发
npm run dev
```

打开 http://localhost:5173，点「导入素材」。

> `.env.local` 已在 `.gitignore` 里，不会被提交。

---

## 支持哪些素材

### YouTube（需要一步命令行）

浏览器拿不到 YouTube 的字幕接口（CORS + 风控），所以字幕在本地抓：

```bash
# 需要先装 yt-dlp：https://github.com/yt-dlp/yt-dlp
yt-dlp --write-auto-subs --sub-langs "en.*" --skip-download \
       --write-subs --convert-subs srt "https://www.youtube.com/watch?v=xxxx"
```

标题可以在导入页点「自动填标题」，走 oEmbed 代理获取。字幕也可以直接填一个 `.srt/.vtt` 链接让代理抓取，省去下载再上传。

把生成的 `.srt` 拖进导入页（或打开复制全文粘贴），保存后会自动用 YouTube 播放器播放，
点句子跳转、点单词标记。

> 有官方字幕的视频质量更好；自动字幕是滚动碎片，程序会自动去重、合并、补时间码，
> 但仍可能有个别断句不理想 —— 这是所有同类产品的通病，不影响使用。

### 网页文章

粘贴链接 → 点「抓取正文」→ Readability 抽正文 → 自动断句。
抓取失败（付费墙、反爬）时可以直接把英文粘到文本框里。

### 本地视频 + 字幕

选视频/音频文件 + 粘 SRT。文件**只存在当前标签页内存里**，不上传、不落盘；
刷新后需要重新选同一个文件（这是刻意的隐私取舍）。

### 任意字幕链接

YouTube 和本地两种导入方式都支持直接填一个 `.srt/.vtt` 的 URL，
抓取代理会取回内容并自动解析，省去下载再上传。

---

## 复习是怎么工作的

1. 你在素材里点一个词 → 生成一张 FSRS 卡片，`due = 现在`
2. 到「今日复习」→ 系统出题：**挖空填空 / 连词成句 / 选词填空** 自动轮换（新词第一题固定挖空）
3. 你作答 → 自评（忘了/勉强/记得/太简单）→ FSRS 算下次时间
4. 同一个词在不同素材里的出现，会通过词形还原 + IndexedDB 索引聚合（`#/word/develop`）

**三种题型：**

- **挖空填空**：AI 造一个**新语境**的句子把词挖空，配中文释义和提示。AI 挂了会自动退化到"原句挖空"，不会卡住复习。
- **连词成句**：把原句词块打乱，按顺序点回。纯前端，零 AI 成本。
- **选词填空**：挖空句 + 4 个近形干扰项，干扰项从你所有素材里挑，同样不额外消耗 AI。

**听力 / 语音（全部走浏览器原生 TTS，免费、无 key）：**

- 每个词、每句都有 🔊；复习卡片可朗读整句
- **听写模式**：隐藏句子只听音频，把空格处的词写下来
- 挖空句朗读时会把 `____` 当停顿，让你听到语境但听不到答案

**键盘快捷键：** 回车检查；答完后 `1/2/3/4` = 忘了/勉强/记得/太简单；空格重听。

**每日新词上限：** 默认 20 个/天（设置里可改），新词过了上限顺延到明天，避免一次堆 200 个。

**目标记忆率：** 设置里可选 80%–95%，默认 90%。调高会更频繁复习、记得更牢；调低则间隔更长。这是 FSRS 的核心参数。

**标记与笔记：**

- 点单个词标记单词；**选中 2–6 个词**会标记为短语（高亮它的组成词）。
- 每个标记都能写笔记（搭配、易错点、个人例句），复习看答案时会显示。
- 素材页可以重命名标题，素材库支持关键词搜索和按类型筛选。

AI 生成的题目会缓存在本地（key = 词 + 原句 + prompt 版本），第二次打开秒开。

---

## 查词、单词本与统计

- **查词模式**（素材页右上角）：点词浮出释义气泡，可一键标记生词。释义走 AI 词典，按"词 + 语境"缓存，AI 不可用时静默降级。
- **单词本**（`#/words`）：按词形归并所有标记，显示出现次数、来源素材数、掌握度、遗忘次数；可按待复习/已掌握/难词筛选，按到期/遗忘/最近标记排序。
- **统计**（`#/stats`）：过去 16 周复习热力图、连续打卡、记住率、评分分布。
- **难词提示**：一个词遗忘 ≥4 次会在复习卡上标出来，建议换个记法。

---

## 备份与迁移

数据全在 IndexedDB（数据库名 `whitespace`），清浏览器数据 = 全丢。**设置 → 备份** 里可以：

- **导出备份**：下载一个 JSON（素材、标记、复习记录、题目缓存、查词缓存）
- **导入备份**：合并或覆盖导入；覆盖前会二次确认
- **导出 CSV**：把所有标记导出成 CSV（Excel / Anki 都能导入），带 BOM 避免中文乱码

换设备或定期清理前导出一次即可。

---

## 安装为应用（PWA）

「留白」是纯前端 + 本地数据，装成应用后可以离线打开（首次在线访问后，外壳和资源会被缓存，AI 出题走兜底）。

浏览器地址栏右侧点「安装」，或 Chrome 菜单 → 安装 留白。之后从桌面/开始菜单打开就是一个独立窗口。

---

## 部署到 Cloudflare Pages（朋友也能用）

```bash
npm i -D wrangler
npx wrangler login
npm run build
npx wrangler pages deploy dist --project-name whitespace
```

然后在 Cloudflare 控制台 → Pages 项目 → Settings → Environment variables 里加：

| 变量 | 说明 |
|---|---|
| `AI_API_KEY` | 必填，你的模型 key |
| `AI_BASE_URL` | 可选，默认 `https://api.deepseek.com` |
| `AI_MODEL` | 可选，默认 `deepseek-chat` |
| `APP_KEY` | 可选，共享口令；设置后前端需要在「设置」里填一样的值 |

`functions/api/[[path]].js` 会被 Pages 自动识别，`/api/llm` 和 `/api/fetch` 直接可用。

**不想用 Cloudflare？** 任何支持 Node/边缘函数的平台都行，只要把 `worker/handler.js` 的
`handle(request, env)` 接上即可（Vercel、Deno Deploy、Netlify Functions 都是几行胶水）。

---

## 数据与隐私

- 素材、标记、复习进度、复习流水全部在 **IndexedDB**（数据库名 `whitespace`）
- 清除浏览器数据 = 全部丢失。**设置 → 备份 → 导出备份** 可下载完整 JSON，导入即可迁移
- 只有两样东西会离开浏览器：你粘贴的**文章/字幕 URL**（给抓取代理）和**你要出题/查词的词 + 原句**（给模型）
- 本地视频文件永远不离开当前标签页

---

## 已知限制 / 下一步

- [ ] 字幕目前要手动抓（可加一个本地 `yt-dlp` 小工具或浏览器扩展）
- [ ] 没有云同步，换设备要重新导入（先靠「导出/导入备份」过渡）
- [ ] 只支持文本类素材，PDF / EPUB / 播客还没接
- [ ] 长文章断句对缩写、引号的处理是启发式的
- [ ] 词形还原是规则表，个别不规则词可能归并不准
- [ ] 还没有自动化测试和 CI

---

## 目录结构

```
src/
  db.ts              IndexedDB 封装（materials / marks / drills / meta / reviews / lookups）
  types.ts           数据模型（三种题型 + 复习流水 + 笔记）
  lib/
    text.ts          字幕解析、断句、分词、词形还原
    srs.ts           ts-fsrs 封装（评分、间隔预览、目标记忆率）
    ai.ts            AI 出题 + 查词缓存 + 兜底 + 并发池 + 去重
    drills.ts        题型轮换、连词成句、选词干扰项
    speech.ts        浏览器原生 TTS（朗读 / 挖空停顿）
    article.ts       Readability 抽正文、URL / YouTube ID 解析
    exporter.ts      标记导出 CSV
    media.ts         本地视频的临时 Blob 管理
    nav.ts           hash 路由
    sample.ts        内置示例素材
  components/        句子渲染、播放器、🔊、查词气泡、笔记、三种题型卡片
  pages/             素材库、导入、素材详情、复习、按词复习、单词本、统计
public/              PWA（manifest / sw / 图标）
worker/handler.js    共享的代理逻辑（/api/llm、/api/fetch）
functions/api/       Cloudflare Pages Functions 入口
```
