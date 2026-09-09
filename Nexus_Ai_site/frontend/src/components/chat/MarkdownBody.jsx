import { Component } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function PlainFallback({ content }) {
  return (
    <div className="whitespace-pre-wrap break-words">
      {content.split('\n').map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line}
        </span>
      ))}
    </div>
  );
}

class MarkdownErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <PlainFallback content={this.props.content} />;
    }
    return this.props.children;
  }
}

export default function MarkdownBody({ content, className = '' }) {
  if (!content?.trim()) return null;

  return (
    <MarkdownErrorBoundary content={content}>
      <div className={`nx-markdown ${className}`.trim()}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ children }) => (
              <div className="nx-markdown-table-wrap">
                <table>{children}</table>
              </div>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-teal-400 hover:text-teal-300 underline underline-offset-2"
              >
                {children}
              </a>
            ),
            pre: ({ children }) => (
              <pre className="nx-markdown-pre overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 my-3 text-sm">
                {children}
              </pre>
            ),
            code: ({ className: codeClass, children, ...props }) => {
              const isInline = !codeClass;
              if (isInline) {
                return (
                  <code
                    className="rounded px-1.5 py-0.5 text-[0.9em] bg-white/10 font-mono text-teal-200/90"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <code className={`font-mono text-sm ${codeClass || ''}`} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </MarkdownErrorBoundary>
  );
}
