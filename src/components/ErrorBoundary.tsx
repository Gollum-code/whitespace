import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** 应用级错误边界：任何页面抛错都不会白屏，给出恢复入口。 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('Whitespace crashed:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page narrow">
          <div className="empty">
            <h2>出错了</h2>
            <p className="muted">页面遇到问题，但你的数据都在本地 IndexedDB 里，不会丢。</p>
            <p className="muted small">{this.state.error.message}</p>
            <div className="row center">
              <button className="btn primary" onClick={() => this.setState({ error: null })}>
                重试
              </button>
              <button className="btn" onClick={() => location.reload()}>
                刷新页面
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
