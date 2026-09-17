import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import rehypeSanitize from "rehype-sanitize";
export function MarkdownPreview({ content }: { content: string }) {
  return <article className="markdown-preview" aria-label="Markdown Preview"><Markdown remarkPlugins={[remarkGfm, remarkFrontmatter]} rehypePlugins={[rehypeSanitize]} skipHtml components={{ img: ({ alt }) => <span>[画像: {alt}]</span>, a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{content}</Markdown></article>;
}
