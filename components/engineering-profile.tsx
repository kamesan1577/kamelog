import { contact, experience, skills } from "@/lib/public-profile";

export function ContactLinks() {
  return (
    <nav className="engineering-links" aria-label="連絡先と外部プロフィール">
      <a href={contact.github} target="_blank" rel="noreferrer">
        GitHub
      </a>
      <a href={contact.x} target="_blank" rel="noreferrer">
        X
      </a>
      <a href={contact.qiita} target="_blank" rel="noreferrer">
        Qiita
      </a>
      <a href={`mailto:${contact.email}`}>Contact</a>
    </nav>
  );
}

export function EngineeringProfile() {
  return (
    <div className="engineering-profile">
      <section aria-labelledby="experience-title">
        <h2 id="experience-title">Experience</h2>
        <div>
          <p className="engineering-position">
            <strong>{experience.role}</strong>
            <span>
              {experience.period} · {experience.workplace}
            </span>
          </p>
          <ul>
            {experience.responsibilities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <details className="engineering-details">
            <summary>主な取り組み</summary>
            <div className="engineering-outcomes">
              {experience.outcomes.map((item) => (
                <div key={item.title}>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
          </details>
        </div>
      </section>
      <section aria-labelledby="skills-title">
        <h2 id="skills-title">Skills</h2>
        <dl className="engineering-skills">
          {skills.map((group) => (
            <div key={group.label}>
              <dt>{group.label}</dt>
              <dd>
                <strong>{group.items}</strong>
                <span>{group.note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="career-title">
        <h2 id="career-title">これまで</h2>
        <div>
          <ol className="engineering-career">
            <li>
              <time dateTime="2021">2021</time>
              <div>
                <strong>
                  東洋大学 情報連携学部（INIAD）エンジニアリングコースに入学
                </strong>
                <p>
                  情報工学を中心に、ソフトウェア、OS、データベース、ネットワーク、分散処理を学びました。
                </p>
              </div>
            </li>
            <li>
              <time dateTime="2025">2025</time>
              <div>
                <strong>大学を卒業し、エンタメ系企業へ入社</strong>
                <p>自社Webサービスのバックエンド開発を始めました。</p>
              </div>
            </li>
          </ol>
          <p className="engineering-qualifications">
            基本情報技術者試験 · TOEIC IP 790（2024）
          </p>
        </div>
      </section>
      <section aria-labelledby="contact-title">
        <h2 id="contact-title">Contact</h2>
        <div>
          <ContactLinks />
          <a className="engineering-email" href={`mailto:${contact.email}`}>
            {contact.email}
          </a>
        </div>
      </section>
    </div>
  );
}
