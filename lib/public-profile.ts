export const contact = {
  github: "https://github.com/kamesan1577",
  x: "https://x.com/kamesaniniad",
  qiita: "https://qiita.com/kamesan1577",
  email: "kamesan1577@gmail.com",
} as const;

export type Project = {
  slug: string;
  title: string;
  summary: string;
  period?: string;
  status?: string;
  role: string;
  stack: string[];
  highlights: string[];
  decisions: string[];
  links: { source?: string; website?: string };
  thumbnail: string;
};

export const projects: Project[] = [
  {
    slug: "kamelog",
    title: "kamelog",
    period: "2026 — 現在",
    status: "運用中",
    summary:
      "ブログ・つぶやき・vlogを一つのタイムラインにまとめる個人サイト。企画から設計、実装、テスト、デプロイ、運用まで一人で継続しています。",
    role: "企画・設計・実装・運用",
    stack: ["Next.js", "TypeScript", "SQLite", "Docker", "Playwright"],
    highlights: [
      "Passkey / WebAuthnによる投稿者認証",
      "自宅サーバー上でのDocker Compose運用とバックアップ・復元",
      "CIとE2E、ADR・Runbook・開発ハーネスで変更を検証",
    ],
    decisions: [
      "単一オーナー・単一ホストの規模に合わせてSQLiteを採用。",
      "投稿・媒体の復元を検証できるよう、バックアップと運用手順を整備。",
    ],
    links: {
      source: "https://github.com/kamesan1577/kamelog",
      website: "https://kamesan.org/",
    },
    thumbnail: "/project-api.svg",
  },
  {
    slug: "home-lab",
    title: "Home Lab",
    status: "運用中",
    summary:
      "自宅のLinuxサーバーで個人サービスを動かす環境。アプリの配布から起動、更新、バックアップまで扱っています。",
    role: "設計・構築・運用",
    stack: ["Linux", "Docker Compose", "systemd", "Cloudflare Tunnel"],
    highlights: [
      "systemdでサービスと更新処理を管理",
      "Tunnel経由で公開サービスへ接続",
      "更新前バックアップとヘルスチェックを運用に組み込む",
    ],
    decisions: [
      "自分で復旧まで扱える環境を維持するため、自宅運用を選択。",
      "論理構成: Internet → Cloudflare → Tunnel → アプリ → ストレージ。",
    ],
    links: {},
    thumbnail: "/project-tools.svg",
  },
  {
    slug: "heitan",
    title: "へいたん",
    status: "学生時代の制作物",
    summary:
      "当時のTwitterタイムラインで悪意のある表現を検知し、自動で非表示にするChrome拡張機能。現在のAPI環境での動作は保証していません。",
    role: "技術面を主導",
    stack: ["Chrome Extension", "AWS Lambda", "OpenAI API"],
    highlights: [
      "全体アーキテクチャと拡張機能・バックエンド間の通信を設計",
      "Lambdaを使ったバックエンドAPIを実装",
      "API呼び出しを抑えるキャッシュを導入",
    ],
    decisions: ["投稿内容をAPIで判定し、対象のDOM要素を非表示にする構成。"],
    links: {},
    thumbnail: "/project-tools.svg",
  },
];

export const experience = {
  period: "2025 — 現在",
  role: "Backend Engineer",
  workplace: "エンタメ系自社Webサービス",
  responsibilities: [
    "Go / Gin / gRPC / OpenAPIによるAPI実装と仕様設計",
    "SQLによるデータ処理、MySQLのテーブル追加・変更と改善方針の検討",
    "管理画面とユーザー向けサイトにまたがる機能設計、ビジネスサイド・フロントエンドとの仕様調整",
    "性能改善、障害時の一次調査とEMへの連携",
  ],
  outcomes: [
    {
      title: "月次イベント運用の改善",
      detail:
        "運用をよりスムーズにするための仕組みづくりに取り組みました。管理画面、バックエンド、API・データ構造、操作設計、仕様調整まで担当しています。",
    },
    {
      title: "管理画面リプレイスの開発ハーネス",
      detail:
        "AI Agentを使った開発を安全に続けるためのハーネスを提案・設計し、設計書と実行計画を作成しました。",
    },
    {
      title: "テスト仕様書からのE2E自動化",
      detail:
        "既存のテスト仕様書を画面操作へ変換し、アドホックにE2Eを実行するClaude Code Skillを作成しました。",
    },
  ],
} as const;

export const skills = [
  {
    label: "Production",
    items: "Go · SQL · MySQL · Linux",
    note: "Gin / gRPC / OpenAPI / DDD。",
  },
  {
    label: "Development / Tools",
    items: "GitHub · E2E Testing · Claude Code",
    note: "Dockerは利用・調査と個人サービスの運用に使用。",
  },
  {
    label: "Other experience",
    items: "TypeScript · Python",
    note: "大学・個人開発を中心に使用。AWSは基本構成の理解とハンズオン経験。",
  },
] as const;
