/**
 * 书签小工具（bookmarklet）：
 * 在任意网页点击书签，把当前页面的正文/选中文字复制到剪贴板，并打开「留白」的导入页。
 * 导入页里点「从剪贴板读取」即可粘贴。
 *
 * 注意：bookmarklet 里要写死 app 的 origin（生成时从 location.origin 注入），
 * 否则在别的站点上会打开那个站点自己的地址。
 */

export function bookmarkletJs(appOrigin: string): string {
  const code = `(()=>{const t=document.title;const sel=(document.getSelection()||'').toString();const el=document.querySelector('article,main,#content,.content')||document.body;const text=(sel||el.innerText||'').trim();try{navigator.clipboard.writeText(text).catch(()=>{});}catch(e){};window.open(${JSON.stringify(appOrigin)}+'/#/import?clip=1','_blank');})()`
  return `javascript:${code}`
}

/** 从当前页面 URL 判断是否刚被书签工具跳转过来（#/import?clip=1）。 */
export function wantsClipboard(): boolean {
  try {
    return new URLSearchParams(location.hash.split('?')[1] ?? '').get('clip') === '1'
  } catch {
    return false
  }
}
