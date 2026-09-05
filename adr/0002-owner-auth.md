# ADR-0002: 単一オーナーのパスキー認証

状態: 採用

WebAuthn登録と認証にSimpleWebAuthnを使用する。署名検証を自作しない。
最初のパスキー登録のみ環境のランダムbootstrap tokenを使う。登録後は追加パスキー登録に有効sessionを要求する。
challengeは5分・cookieに紐付け・一回消費。sessionはランダム値のhashをSQLiteへ保存、12時間、Secure/HttpOnly/SameSite=Strict。
Origin/RP ID/UVの検証を必須とする。token・cookie・署名レスポンスはログに出さない。
開発用の固定ログインAPIは作らない。自動試験も署名を実際に検証する。
復旧はホスト管理権限によるoffline操作とし、旧session/credentialを失効させる。
