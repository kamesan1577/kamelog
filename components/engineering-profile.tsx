import { contact, experience, projects, skills } from "@/lib/public-profile";

export function ContactLinks() {
  return (
    <nav className="engineering-links" aria-label="連絡先と外部プロフィール">
      <a href={contact.github} target="_blank" rel="noreferrer">GitHub</a>
      <a href={contact.x} target="_blank" rel="noreferrer">X</a>
      <a href={contact.qiita} target="_blank" rel="noreferrer">Qiita</a>
      <a href={`mailto:${contact.email}`}>Contact</a>
    </nav>
  );
}

export function EngineeringProfile() {
  return (
    <div className="engineering-profile">
      <section aria-labelledby="interests-title">
        <h2 id="interests-title">Engineering interests</h2>
        <p>
          知識や設計判断を仕組みに落とし込み、誰が作業しても品質が崩れにくい開発環境を作ることに関心があります。AI Agentの開発ハーネス、テスト、設計制約の自動化を試しています。
        </p>
      </section>
      <section aria-labelledby="works-title">
        <h2 id="works-title">Selected Works</h2>
        <div className="engineering-works">
          {projects.map((project) => {
            const card = (
              <>
                <strong>{project.title}</strong>
                <span>{project.summary}</span>
                <small>{project.links.source ? "GitHubで見る ↗" : "詳細はこのページに掲載"}</small>
              </>
            );
            return project.links.source ? (
              <a
                key={project.slug}
                href={project.links.source}
                target="_blank"
                rel="noreferrer"
              >
                {card}
              </a>
            ) : (
              <div className="engineering-work-static" key={project.slug}>
                {card}
              </div>
            );
          })}
        </div>
        <a className="engineering-more" href="/projects">
          すべてのプロジェクトを見る →
        </a>
      </section>
      <section aria-labelledby="experience-title">
        <h2 id="experience-title">Experience</h2>
        <p>
          <strong>{experience.period} · {experience.role}</strong><br />
          {experience.workplace}
        </p>
        <ul>
          {experience.responsibilities.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <h3>主な取り組み</h3>
        <div className="engineering-outcomes">
          {experience.outcomes.map((item) => (
            <div key={item.title}><strong>{item.title}</strong><p>{item.detail}</p></div>
          ))}
        </div>
      </section>
      <section aria-labelledby="career-title">
        <h2 id="career-title">これまで</h2>
        <ol className="engineering-career">
          <li>
            <time dateTime="2021">2021</time>
            <div>
              <strong>東洋大学 情報連携学部（INIAD）エンジニアリングコースに入学</strong>
              <p>情報工学を中心に、ソフトウェア、OS、データベース、ネットワーク、分散処理を学びました。</p>
            </div>
          </li>
          <li>
            <time dateTime="2025">2025</time>
            <div>
              <strong>大学を卒業し、エンタメ系企業へ入社</strong>
              <p>自社Webサービスのバックエンド開発を始めました。</p>
            </div>
          </li>
          <li>
            <time dateTime="2025">現在</time>
            <div>
              <strong>Backend Engineer</strong>
              <p>Goを中心に、APIやデータベース、複数システムにまたがる機能設計をしています。</p>
            </div>
          </li>
        </ol>
      </section>
      <section aria-labelledby="skills-title">
        <h2 id="skills-title">Skills</h2>
        <dl className="engineering-skills">
          {skills.map((group) => (
            <div key={group.label}>
              <dt>{group.label}</dt>
              <dd><strong>{group.items}</strong><span>{group.note}</span></dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="education-title">
        <h2 id="education-title">Qualifications</h2>
        <p>基本情報技術者試験 — 2024<br />TOEIC IP 790 — 2024</p>
      </section>
      <section aria-labelledby="contact-title">
        <h2 id="contact-title">Contact</h2>
        <ContactLinks />
        <a className="engineering-email" href={`mailto:${contact.email}`}>{contact.email}</a>
      </section>
    </div>
  );
}
