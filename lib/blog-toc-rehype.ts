import type { Element, ElementContent, Root } from "hast";
import { buildTocEntries } from "./blog-toc.ts";

function textContent(node: ElementContent): string {
  if (node.type === "text") return node.value;
  return node.type === "element" ? node.children.map(textContent).join("") : "";
}

function element(
  tagName: string,
  properties: Element["properties"],
  children: ElementContent[],
): Element {
  return { type: "element", tagName, properties, children };
}

/** Render the TOC with the article so native history restores a stable layout. */
export default function rehypeBlogToc() {
  return (tree: Root) => {
    const headings: Element[] = [];
    const collect = (parent: Root | Element) => {
      for (const child of parent.children) {
        if (child.type !== "element") continue;
        if (/^h[2-6]$/.test(child.tagName) && textContent(child).trim()) {
          headings.push(child);
        }
        collect(child);
      }
    };
    collect(tree);
    const entries = buildTocEntries(
      headings.map((heading) => ({
        id: heading.properties.id,
        label: textContent(heading),
        level: Number(heading.tagName.slice(1)),
      })),
    );
    headings.forEach((heading, index) => {
      heading.properties.id = entries[index].id;
      heading.properties["data-kamelog-toc-generated"] = "true";
    });

    const toc = entries.length
      ? element(
          "nav",
          {
            "data-ds": "blog-table-of-contents",
            "data-kamelog-blog-toc": "react",
            "aria-label": "目次",
          },
          [
            element("p", { "data-ds": "blog-table-of-contents-title" }, [
              { type: "text", value: "目次" },
            ]),
            element(
              "ol",
              {},
              entries.map((entry) =>
                element(
                  "li",
                  { "data-ds": `blog-table-of-contents-level-${entry.level}` },
                  [
                    element(
                      "a",
                      {
                        href: `#${entry.id}`,
                        "data-kamelog-toc-link": "true",
                      },
                      [{ type: "text", value: entry.label }],
                    ),
                  ],
                ),
              ),
            ),
          ],
        )
      : null;
    const title = tree.children[0];
    if (title?.type === "element" && title.tagName === "h1") {
      tree.children[0] = element(
        "header",
        { "data-ds": "reader-article-header" },
        [
          title,
          element("div", { "data-ds": "reader-toc-slot" }, toc ? [toc] : []),
        ],
      );
    } else if (toc) {
      tree.children.unshift(toc);
    }
  };
}
