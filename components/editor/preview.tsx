import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import rehypeSanitize from "rehype-sanitize";
import type { Root } from "hast";

const readableBlocks = new Set(["p", "pre", "li", "blockquote", "table", "hr", "h1", "h2", "h3", "h4", "h5", "h6"]);
function rehypeReadPositions() {
  return (tree: Root) => {
    function visit(node: Root | Root["children"][number]) {
      if (node.type === "element" && readableBlocks.has(node.tagName)) {
        const start = node.position?.start.offset, end = node.position?.end.offset;
        if (start !== undefined && end !== undefined) {
          node.properties ??= {};
          node.properties["data-source-start"] = start;
          node.properties["data-source-end"] = end;
        }
      }
      if ("children" in node) for (const child of node.children) visit(child);
    }
    visit(tree);
  };
}

export function MarkdownPreview({ content, label = "ノートのプレビュー", trackSourcePosition = false }: { content: string; label?: string; trackSourcePosition?: boolean }) {
  return <article className="markdown-preview" aria-label={label}><Markdown remarkPlugins={[remarkGfm, remarkFrontmatter]} rehypePlugins={trackSourcePosition ? [rehypeSanitize, rehypeReadPositions] : [rehypeSanitize]} skipHtml components={{ img: ({ alt }) => <span>[画像: {alt}]</span>, a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{content}</Markdown></article>;
}
