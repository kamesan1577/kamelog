import { notFound } from "next/navigation";
import Notebook from "./notebook";
import TweetThreadBridge from "./tweet-thread-bridge";
import { FederationTimelineLink } from "@/components/federation-timeline-link";
import { getStore } from "@/server/runtime.mjs";
import { blogStructuredData, websiteStructuredData } from "@/server/seo.mjs";
import { publicFederationReposts } from "@/server/federation-reposts.mjs";

function StructuredData({ value }: { value: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(value).replace(/</g, "\\u003c"),
      }}
    />
  );
}

function SourceFooter() {
  return (
    <footer
      aria-label="kamelogの開発情報"
      className="site-source-footer border-t border-[#eceae5] px-5 pt-5 pb-24 text-xs text-[#858078] md:ml-[222px] md:px-10 md:pb-6"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-medium text-[#625e56]">kamelog の開発情報</span>
        <a
          className="underline underline-offset-4"
          href="https://github.com/kamesan1577/kamelog"
          target="_blank"
          rel="noreferrer"
        >
          ソースコード
        </a>
        <span aria-hidden="true">·</span>
        <a
          className="underline underline-offset-4"
          href="https://github.com/kamesan1577/kamelog/issues/new"
          target="_blank"
          rel="noreferrer"
        >
          不具合・要望をIssueで報告
        </a>
        <span aria-hidden="true">·</span>
        <a className="underline underline-offset-4" href="/federation">
          ActivityPub対応
        </a>
      </div>
      <div className="mx-auto mt-5 max-w-5xl border-t border-[#eceae5] pt-4">
        <p className="mb-2 font-medium text-[#625e56]">相互リンク</p>
        <a
          href="https://shiryu.win/"
          target="_blank"
          rel="noreferrer"
          aria-label="Shiryu のホームページを開く"
        >
          <span
            aria-hidden="true"
            style={{
              display: "block",
              width: "200px",
              height: "40px",
              backgroundImage: 'url("https://shiryu.win/banner.png")',
              backgroundRepeat: "no-repeat",
              backgroundSize: "200px 40px",
            }}
          />
        </a>
      </div>
    </footer>
  );
}

export default async function SitePage({
  selectedPostId = null,
}: {
  selectedPostId?: string | null;
}) {
  const store = getStore();
  const posts = store.list("posts");
  const reposts = publicFederationReposts(store);
  const selectedPost = selectedPostId
    ? posts.find(({ id }: { id: string }) => id === selectedPostId)
    : undefined;
  if (selectedPostId && !selectedPost) notFound();

  const profile = store.get("settings", "profile");
  const structuredData = websiteStructuredData(profile) as Record<
    string,
    unknown
  >[];
  const blogData = blogStructuredData(selectedPost || null, profile) as Record<
    string,
    unknown
  > | null;
  if (blogData) structuredData.push(blogData);

  return (
    <>
      {structuredData.map((value, index) => (
        <StructuredData key={index} value={value} />
      ))}
      <Notebook
        initialPosts={posts}
        initialReposts={reposts}
        initialProfile={profile}
        initialSelected={selectedPostId}
      />
      <FederationTimelineLink />
      <TweetThreadBridge initialPosts={posts} />
      <SourceFooter />
    </>
  );
}
