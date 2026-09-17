import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import styles from "./NotFoundState.module.css";

export function NotFoundState() {
  return (
    <main data-ds="not-found-state" className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.brand} href="/">
          kamelog
        </Link>
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
          <nav className={styles.actions} aria-label="ほかのページへ移動">
            <Link className={styles.primaryLink} href="/">
              {" "}
              <ArrowLeft size={16} aria-hidden="true" />
              ホームへ戻る
            </Link>
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
