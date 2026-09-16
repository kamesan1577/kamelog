import { ArrowLeft, ArrowRight } from "lucide-react";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <a className={styles.brand} href="/">
          kamelog
        </a>

        <section className={styles.content} aria-labelledby="not-found-title">
          <div className={styles.errorCode} aria-hidden="true">
            <span>4</span>
            <span className={styles.misplacedZero}>0</span>
            <span>4</span>
          </div>
          <h1 id="not-found-title">ページが見つかりません</h1>
          <p className={styles.description}>
            URLが間違っているか、ページが移動・削除された可能性があります。
          </p>
          {/* Recover with a full navigation so a missing post's client history cannot override the destination. */}
          <nav className={styles.actions} aria-label="ほかのページへ移動">
            <a className={styles.primaryLink} href="/">
              <ArrowLeft size={16} aria-hidden="true" />
              ホームへ戻る
            </a>
            <a className={styles.secondaryLink} href="/timeline">
              タイムラインを見る
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </nav>
        </section>
      </div>
    </main>
  );
}
