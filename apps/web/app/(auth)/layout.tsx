export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="brand light"><span className="brand-mark">知</span><span><strong>知闲</strong><small>ZHIXIAN</small></span></div>
        <div className="story-copy">
          <span className="eyebrow">LEARN IN THE QUIET MOMENTS</span>
          <h1>在一词一句之间，<br />慢慢看见更大的世界。</h1>
          <p>不追赶，不堆砌。让每一次阅读都留下痕迹，让每一个生词在恰当的时候再次与你相遇。</p>
        </div>
        <div className="story-quote"><span>“</span><p>Language is not a subject to finish,<br />but a place to keep visiting.</p></div>
      </section>
      <section className="auth-panel">{children}</section>
    </main>
  );
}

