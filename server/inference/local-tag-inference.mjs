import { classifyPosts } from "../auto-tagging.mjs";
import { abstainedTags, classified } from "./ports.mjs";

/** Existing local classifier, presented through the same domain port as Jev. */
export class LocalTagInference {
  async inferTags({ post, candidates }) {
    const posts = [
      post,
      ...candidates.flatMap(({ tag, examples }) =>
        examples.map((body, index) => ({
          id: `candidate-${tag}-${index}`,
          title: "",
          body,
          tags: [tag],
        })),
      ),
    ];
    const { result } = classifyPosts(posts);
    const tags = result.get(post.id) || [];
    return tags.length
      ? classified(tags.map(({ tag }) => ({ tag })))
      : abstainedTags();
  }
}
