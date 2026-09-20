import Link from "next/link";
import { AlertCircle, ArrowLeft, RotateCcw } from "lucide-react";
import styles from "./ErrorState.module.css";

export type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  compact?: boolean;
};

export function ErrorState({
  title = "ページを表示できませんでした",
  description = "一時的な問題が発生しました。もう一度お試しください。",
  onRetry,
  compact = false,
}: ErrorStateProps) {
  return (
    <section
      data-ds="error-state"
      className={`${styles.state} ${compact ? styles.compact : ""}`}
      role="alert"
      aria-labelledby="kamelog-error-title"
    >
      <div className={styles.content}>
        <AlertCircle className={styles.icon} size={26} aria-hidden="true" />
        <h1 id="kamelog-error-title" className={styles.title}>
          {title}
        </h1>
        <p className={styles.description}>{description}</p>
        <div className={styles.actions}>
          {onRetry && (
            <button type="button" className={styles.primary} onClick={onRetry}>
              <RotateCcw size={16} aria-hidden="true" />
              もう一度試す
            </button>
          )}
          <Link href="/" className={onRetry ? styles.secondary : styles.primary}>
            <ArrowLeft size={16} aria-hidden="true" />
            ホームへ戻る
          </Link>
        </div>
      </div>
    </section>
  );
}
