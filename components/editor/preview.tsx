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
          if (node.tagName !== "pre") {
            const segments: number[][] = [];
            let textOffset = 0, image = false;
            function collect(child: Root["children"][number]) {
              if (child.type === "text") {
                const from = child.position?.start.offset, to = child.position?.end.offset;
                if (from !== undefined && to !== undefined) segments.push([from, to, textOffset, textOffset + child.value.length]);
                textOffset += child.value.length;
              } else if (child.type === "element") {
                if (child.tagName === "img") image = true;
                else for (const nested of child.children) collect(nested);
              }
            }
            for (const child of node.children) collect(child);
            // The custom image placeholder has different text from the HAST img.
            if (!image && segments.length) node.properties["data-source-text-map"] = JSON.stringify(segments);
          }
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
