#!/usr/bin/env python3
"""One-time, assertion-checked integration for issue #238.

The notebook is intentionally large; this codemod changes only verified anchors.
"""
from pathlib import Path

notebook = Path("app/notebook.tsx")
source = notebook.read_text()
if 'from "@/components/timeline-gestures"' in source:
    print("Issue #238 integration has already been applied")
    raise SystemExit(0)


def replace(before: str, after: str, expected: int = 1):
    global source
    actual = source.count(before)
    if actual != expected:
        raise AssertionError(f"Expected {expected} instances of {before[:90]!r}, got {actual}")
    source = source.replace(before, after)


replace(
    'import { InlineComposer } from "@/components/design-system/patterns/InlineComposer";',
    'import { InlineComposer } from "@/components/design-system/patterns/InlineComposer";\nimport { scrollTimelineToTop, useTimelineGestures } from "@/components/timeline-gestures";',
)
replace(
    '  const inFlight = useRef(false);',
    '  const inFlight = useRef(false);\n  const refreshFlight = useRef<Promise<boolean> | null>(null);\n  const federationRequest = useRef(0);',
)
replace(
    '  const [login, setLogin] = useState(false),',
    '  const [refreshBusy, setRefreshBusy] = useState(false);\n  const [login, setLogin] = useState(false),',
)
replace(
    '  const loadFederationTimeline = async (\n    cursor: string | null = null,\n    append = false,\n  ) => {\n    setFederationTimelineBusy(true);',
    '  const loadFederationTimeline = async (\n    cursor: string | null = null,\n    append = false,\n  ): Promise<boolean> => {\n    const request = ++federationRequest.current;\n    setFederationTimelineBusy(true);',
)
replace(
    '      setFederationTimeline((current) =>\n        append ? [...current, ...result.items] : result.items,\n      );\n      setFederationTimelineCursor(result.nextCursor);\n    } catch (error) {\n      setFederationTimelineError(\n        error instanceof Error\n          ? error.message\n          : "Fediverseを読み込めませんでした。",\n      );\n    } finally {\n      setFederationTimelineBusy(false);\n    }\n  };',
    '      if (request !== federationRequest.current) return false;\n      setFederationTimeline((current) =>\n        append ? [...current, ...result.items] : result.items,\n      );\n      setFederationTimelineCursor(result.nextCursor);\n      return true;\n    } catch (error) {\n      if (request === federationRequest.current) {\n        setFederationTimelineError(\n          error instanceof Error\n            ? error.message\n            : "Fediverseを読み込めませんでした。",\n        );\n      }\n      return false;\n    } finally {\n      if (request === federationRequest.current) setFederationTimelineBusy(false);\n    }\n  };',
)
replace(
    '  const federationRepost = async (timelineItem: FederationTimelineItem) => {',
    '''  const refreshVisibleTimeline = (): Promise<boolean> => {
    if (refreshFlight.current) return refreshFlight.current;
    setRefreshBusy(true);
    const task = (async () => {
      if (timelineMode === "fediverse") {
        const refreshed = await loadFederationTimeline();
        if (!refreshed) toast.error("Fediverseを更新できませんでした。");
        return refreshed;
      }
      try {
        await refresh();
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "タイムラインを更新できませんでした。",
        );
        return false;
      }
    })();
    refreshFlight.current = task;
    void task.finally(() => {
      if (refreshFlight.current === task) {
        refreshFlight.current = null;
        setRefreshBusy(false);
      }
    });
    return task;
  };
  const federationRepost = async (timelineItem: FederationTimelineItem) => {''',
)
replace(
    '  const openPost = (id: string) => {',
    '''  const handleTimelineNavigation = () => {
    // Re-tapping the active timeline must preserve search, tags, tabs, and sort.
    if (view !== "timeline" || selected) nav("timeline");
    requestAnimationFrame(scrollTimelineToTop);
    void refreshVisibleTimeline();
  };
  const timelineGestures = useTimelineGestures({
    active: view === "timeline" && !selected && !editor && !closeAsk && !draftList && !remove,
    mode: timelineMode,
    filter,
    onFilterChange: setFilter,
    onRefresh: refreshVisibleTimeline,
    refreshing: refreshBusy,
  });
  const openPost = (id: string) => {''',
)
replace(
    'onSelect={(id) => nav(id as View)}',
    'onSelect={(id) =>\n              id === "timeline" ? handleTimelineNavigation() : nav(id as View)\n            }',
    expected=2,
)
replace(
    '            <main data-ds="main-content" className="main-content">',
    '''            <main
              data-ds="main-content"
              className="main-content"
              aria-busy={refreshBusy}
              onTouchStartCapture={timelineGestures.onTouchStartCapture}
              onTouchMoveCapture={timelineGestures.onTouchMoveCapture}
              onTouchEndCapture={timelineGestures.onTouchEndCapture}
              onTouchCancelCapture={timelineGestures.onTouchCancelCapture}
              onClickCapture={timelineGestures.onClickCapture}
            >''',
)
replace(
    '                  <PageHeader className="page-heading" title="タイムライン" />',
    '''                  <PageHeader className="page-heading" title="タイムライン" />
                  {timelineGestures.pullDistance > 0 && (
                    <div className="timeline-pull-indicator" role="status">
                      {timelineGestures.pullDistance >= 44 ? "離して更新" : "下に引いて更新"}
                    </div>
                  )}
                  {refreshBusy && (
                    <p data-ds="timeline-refresh-status" className="timeline-refresh-status" role="status">
                      更新中…
                    </p>
                  )}''',
)
replace(
    '                        className="timeline-toolbar"\n                        filter={filter}',
    '                        className="timeline-toolbar"\n                        onRefresh={() => void refreshVisibleTimeline()}\n                        refreshing={refreshBusy}\n                        filter={filter}',
)
replace('                      <div className="feed">', '                      <div className="feed" aria-busy={refreshBusy}>')
replace('                      <div className="fediverse-feed">', '                      <div className="fediverse-feed" aria-busy={refreshBusy || federationTimelineBusy}>')
replace(
    '                          disabled={federationTimelineBusy}\n                          onClick={() => void loadFederationTimeline()}',
    '                          disabled={refreshBusy || federationTimelineBusy}\n                          onClick={() => void refreshVisibleTimeline()}',
)
notebook.write_text(source)

hook = Path("components/timeline-gestures.ts")
source_hook = hook.read_text()
old = '    if (!window.getSelection()?.isCollapsed) return;'
assert source_hook.count(old) == 1
hook.write_text(source_hook.replace(old, '    const selection = window.getSelection();\n    if (selection && !selection.isCollapsed) return;'))

css = Path("components/design-system/patterns/TimelineToolbar.css")
css.write_text(css.read_text() + '''
.timeline-pull-indicator,
.timeline-refresh-status {
  margin: 0;
  padding: 8px 0;
  text-align: center;
  color: #7b7970;
  font-size: 12px;
}
''')

Path("adr/issue-238-timeline-gestures.md").write_text('''# Issue #238: タイムラインの操作

- タイムラインのナビボタンだけ、現在のモードを更新しつつ先頭へスクロールする。種別・検索・タグ・並び順は維持する。
- localは投稿＋公開RPを合わせて再取得し、Fediverseは受信済み一覧だけ再取得する。単一flightで連打とpullを統合し、古いFediverseの応答を破棄する。失敗時も既存の一覧は保持する。
- モバイルのpull/swipeはTL表示中だけ。touchの既定動作は抑止せず、端からのスワイプ・入力・メディア・水平スクロールではタブを切り替えない。タップできる更新・タブボタンを常に残す。
- ネイティブのpullや戻るとの衝突は実機で確認が必要。Chrome Android、iOS Safari、iOS PWAで二重更新・ページ再読込・動画操作が衝突する場合、該当環境では独自gestureを無効化して更新ボタンにフォールバックする。
- PCつぶやき入力は既存textareaの高さだけを変更する。スマホ用の共通投稿モーダルは変更しない。
''')
print("Issue #238 notebook integration completed")
