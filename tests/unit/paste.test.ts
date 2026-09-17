import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { pasteAction } from "../../modules/editor/paste-policy";
import { quoteInput, quoteMarkdown } from "../../shared/quote";
function state(doc: string, anchor: number, head = anchor) { return EditorState.create({ doc, selection: { anchor, head }, extensions: [markdown()] }); }
describe("paste policy", () => {
  it("routes prose to quotes and only a standalone HTTP URL to resources", () => {
    expect(pasteAction(state("text", 2), "copied prose")).toBe("quote");
    expect(pasteAction(state("", 0), " https://example.com/a ")).toBe("resource");
    expect(pasteAction(state("", 0), "https://example.com with words")).toBe("quote");
    expect(pasteAction(state("", 0), "file:///etc/passwd")).toBe("quote");
  });
  it("allows fenced and indented code content but excludes delimiters and spanning selections", () => {
    const doc = "intro\n\n```ts\nhello\n\n```\nend";
    expect(pasteAction(state(doc, doc.indexOf("hello")), "text")).toBe("allow");
    expect(pasteAction(state(doc, doc.indexOf("hello")), "https://example.com")).toBe("allow");
    expect(pasteAction(state(doc, doc.indexOf("```")), "text")).toBe("quote");
    expect(pasteAction(state(doc, doc.lastIndexOf("```")), "text")).toBe("quote");
    expect(pasteAction(state(doc, 0, doc.indexOf("hello") + 2), "text")).toBe("quote");
    expect(pasteAction(state("```\n\n```", 4), "text")).toBe("allow");
    expect(pasteAction(state("```\nhello", 9), "text")).toBe("allow");
    expect(pasteAction(state("    code", 6), "text")).toBe("allow");
    expect(pasteAction(state("`inline`", 3), "text")).toBe("quote");
  });
  it("rejects a multi-cursor paste if any cursor is outside code", () => {
    const doc = "text\n\n```\ncode\n```";
    const s = EditorState.create({ doc, selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(12)]), extensions: [markdown(), EditorState.allowMultipleSelections.of(true)] });
    expect(pasteAction(s, "text")).toBe("quote");
  });
  it("requires a safe source URL and keeps every copied line in a quote", () => {
    const input = { text: "quote", sourceUrl: "", title: "Note", content: "", baseHash: "a".repeat(64), from: 0, to: 0 };
    expect(quoteInput.safeParse(input).success).toBe(false);
    expect(quoteInput.safeParse({ ...input, sourceUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(quoteInput.safeParse({ ...input, sourceUrl: "https://example.com" }).success).toBe(true);
    expect(quoteMarkdown("one\n\ntwo", "https://example.com/", "Source")).toContain("> one\n> \n> two\n>\n> Source: [Source](<https://example.com/>)");
  });
});
