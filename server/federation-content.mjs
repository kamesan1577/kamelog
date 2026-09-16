import sanitizeHtml from "sanitize-html";

export function sanitizeRemoteHtml(value) {
  return sanitizeHtml(String(value || ""), {
    allowedTags: [
      "p",
      "br",
      "a",
      "span",
      "strong",
      "em",
      "code",
      "pre",
      "blockquote",
      "ul",
      "ol",
      "li",
    ],
    allowedAttributes: { a: ["href", "rel"] },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: {
          href: attributes.href || "",
          rel: "nofollow noopener noreferrer",
        },
      }),
    },
    disallowedTagsMode: "discard",
  });
}
