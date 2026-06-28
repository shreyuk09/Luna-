import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check, Play } from '../ui/Icons.jsx'

// Pull the raw code string out of (possibly highlighted) React children.
function toText(children) {
  if (children == null) return ''
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(toText).join('')
  if (typeof children === 'object' && children.props) return toText(children.props.children)
  return String(children)
}

// Run JavaScript in a sandboxed iframe, capturing console output + the result.
function runJs(code) {
  return new Promise((resolve) => {
    const logs = []
    const sandbox = { console: { log: (...a) => logs.push(a.map(fmt).join(' ')), error: (...a) => logs.push('⚠ ' + a.map(fmt).join(' ')), warn: (...a) => logs.push(a.map(fmt).join(' ')), info: (...a) => logs.push(a.map(fmt).join(' ')) } }
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('console', `"use strict";\n${code}`)
      const ret = fn(sandbox.console)
      if (ret !== undefined) logs.push('⇒ ' + fmt(ret))
    } catch (e) { logs.push('⚠ ' + e) }
    resolve(logs.join('\n') || '(no output)')
  })
}
function fmt(v) {
  if (typeof v === 'string') return v
  try { return JSON.stringify(v) } catch { return String(v) }
}

function CodeBlock({ className, children, lang }) {
  const [copied, setCopied] = useState(false)
  const [output, setOutput] = useState(null)
  const isJs = /^(js|javascript)$/i.test(lang || '')
  const copy = () => {
    navigator.clipboard?.writeText(toText(children).replace(/\n$/, ''))
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }
  const run = async () => setOutput(await runJs(toText(children)))
  return (
    <div className="relative my-3 rounded-2xl overflow-hidden shadow-lagoon-sm">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#0f2c28] text-[#9FDDD2] text-xs">
        <span className="font-mono">{lang || 'code'}</span>
        <div className="flex items-center gap-3">
          {isJs && (
            <button onClick={run} className="flex items-center gap-1 opacity-80 hover:opacity-100 transition" title="Run this JavaScript">
              <Play size={12} /> Run
            </button>
          )}
          <button onClick={copy} className="flex items-center gap-1 opacity-80 hover:opacity-100 transition">
            {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <pre className="!my-0 !rounded-none bg-[#0c2521]"><code className={className}>{children}</code></pre>
      {output != null && (
        <div className="bg-[#08201c] text-[#bfe9df] text-[12px] font-mono px-3.5 py-2 border-t border-white/10 whitespace-pre-wrap">
          <div className="text-[10px] uppercase tracking-wider text-[#5fa394] mb-1">Output</div>{output}
        </div>
      )}
    </div>
  )
}

export default function Markdown({ children }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ node, ...p }) => <a {...p} target="_blank" rel="noreferrer" />,
          img: ({ node, ...p }) => (
            <a href={p.src} target="_blank" rel="noreferrer" className="block my-2">
              <img {...p} loading="lazy" className="rounded-2xl ring-1 ring-line max-h-[28rem] w-auto shadow-lagoon-sm" />
            </a>
          ),
          // react-markdown v9 removed `inline` — detect block code by language class or newlines.
          pre: ({ children }) => <>{children}</>,
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const isBlock = !!match || toText(children).includes('\n')
            if (!isBlock) return <code className={className} {...props}>{children}</code>
            return <CodeBlock className={className} lang={match?.[1]}>{children}</CodeBlock>
          },
        }}>
        {children || ''}
      </ReactMarkdown>
    </div>
  )
}
