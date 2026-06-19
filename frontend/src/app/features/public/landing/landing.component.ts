import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Public landing page — design language inspired by the "Compute" demo:
 * near-black monochrome canvas, elegant serif display headline, a mono eyebrow
 * with a short rule, a rotating word that blurs in with an animated gradient,
 * and a nav that condenses into a floating blurred pill on scroll.
 *
 * The demo's rotating 3D ASCII torus ("tree") is replaced by an animated
 * EspritConnect logo: the ESPRIT triangle draws itself over pulsing signal
 * rings, with an orbiting alumni-network ring.
 *
 * Full-bleed: the front-office layout hides its white header and drops the page
 * container on the home route so this owns the whole viewport.
 */
@Component({
  selector: 'ec-landing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="lp" [class.anim-paused]="heroPaused()">
      <!-- floating nav -->
      <header class="nav" [class.scrolled]="scrolled()">
        <nav class="nav-inner">
          <a routerLink="/" class="wm">esprit<span class="tri"></span><span class="wm-c">CONNECT</span></a>
          <div style="flex:1"></div>
          <a class="nav-link" routerLink="/directory">Directory</a>
          <a class="nav-link" routerLink="/jobs">Jobs</a>
          <a class="nav-link" routerLink="/mentorship">Mentorship</a>
          <a class="nav-link" routerLink="/events">Events</a>
          <ng-container *ngIf="!auth.isAuthenticated(); else loggedNav">
            <a routerLink="/login" class="nav-signin">Sign in</a>
            <a routerLink="/signup" class="pill pill-red">Join the network</a>
          </ng-container>
          <ng-template #loggedNav>
            <a routerLink="/feed" class="pill pill-red">Open the app</a>
          </ng-template>
        </nav>
      </header>

      <!-- ============================= HERO ============================= -->
      <section class="hero">
        <div class="grid-lines abs" aria-hidden="true">
          <span *ngFor="let h of [1,2,3,4,5,6,7]" class="hl" [style.top.%]="h * 12.5"></span>
          <span *ngFor="let v of [1,2,3,4,5,6,7,8,9,10,11]" class="vl" [style.left.%]="v * 8.33"></span>
        </div>
        <div class="abs glow" aria-hidden="true"></div>

        <div class="hero-inner">
          <!-- left: copy -->
          <div class="hero-copy">
            <span class="eyebrow mono"><span class="eyebrow-rule"></span> The ESPRIT alumni network</span>

            <h1 class="dsp hero-title">
              <span class="block">The network</span>
              <span class="block">built to <span class="gword-wrap"><span *ngFor="let w of [word()]; trackBy: trackWord" class="gword">{{ w }}</span></span>.</span>
            </h1>

            <p class="hero-sub">
              The network that connects ESPRIT engineers — alumni, mentors, jobs, and events — a single place for every ESPRIT engineer, wherever they are.
            </p>

            <div class="hero-cta">
              <ng-container *ngIf="!auth.isAuthenticated(); else loggedCta">
                <a routerLink="/signup" class="pill pill-red lg">Join the network →</a>
                <a routerLink="/login" class="pill pill-ghost lg">Sign in</a>
              </ng-container>
              <ng-template #loggedCta>
                <a routerLink="/feed" class="pill pill-red lg">Go to your feed →</a>
                <a routerLink="/directory" class="pill pill-ghost lg">Browse directory</a>
              </ng-template>
            </div>

            <!-- honest, non-numeric feature strip (no fabricated stats) -->
            <div class="strip mono">
              <span>DIRECTORY</span><i>·</i><span>MENTORSHIP</span><i>·</i><span>JOBS</span><i>·</i>
              <span>EVENTS</span><i>·</i><span>GROUPS</span><i>·</i><span>MESSAGING</span>
            </div>
          </div>

          <!-- right: animated EspritConnect logo (replaces the ASCII torus) -->
          <div class="hero-visual">
            <div class="logo-anim">
              <span class="ring r1"></span><span class="ring r2"></span><span class="ring r3"></span>
              <svg class="logo-svg" viewBox="0 0 200 200" aria-hidden="true">
                <g class="orbit">
                  <circle cx="100" cy="100" r="74" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="1"/>
                  <line *ngFor="let n of orbitNodes" x1="100" y1="100" [attr.x2]="n.x" [attr.y2]="n.y"
                        stroke="rgba(255,45,61,.16)" stroke-width="1"/>
                  <circle *ngFor="let n of orbitNodes" [attr.cx]="n.x" [attr.cy]="n.y" [attr.r]="n.hot ? 3.4 : 2"
                          [attr.fill]="n.hot ? '#FF2D3D' : 'rgba(255,255,255,.85)'"/>
                </g>
                <path class="tri-fill" d="M84 58 L150 100 L84 142 Z"/>
                <path class="tri-draw" d="M84 58 L150 100 L84 142 Z"/>
              </svg>
            </div>
          </div>
        </div>
      </section>

      <!-- ========================= VALUE PILLARS ======================= -->
      <section class="band">
        <div class="wrap">
          <div class="sec-eyebrow mono"><span class="eyebrow-rule"></span> Why EspritConnect</div>
          <div class="pillars">
            <div *ngFor="let p of pillars" class="pillar">
              <div class="mono pillar-k">{{ p.k }}</div>
              <h3 class="dsp pillar-t">{{ p.t }}</h3>
              <p class="pillar-d">{{ p.d }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ============================ CTA BAND ========================= -->
      <section class="cta-band">
        <div class="abs glow soft" aria-hidden="true"></div>
        <div class="wrap cta-wrap">
          <h2 class="dsp cta-title">Claim your spot in the network.</h2>
          <p class="cta-sub">Free for every ESPRIT alumnus. Verify your promo in under two minutes.</p>
          <div class="hero-cta center">
            <a [routerLink]="auth.isAuthenticated() ? '/feed' : '/signup'" class="pill pill-red lg">
              {{ auth.isAuthenticated() ? 'Open EspritConnect →' : 'Join EspritConnect →' }}
            </a>
            <a *ngIf="!auth.isAuthenticated()" routerLink="/login" class="pill pill-ghost lg">
              I already have an account
            </a>
          </div>
        </div>
      </section>

      <!-- ============================= FOOTER ========================== -->
      <footer class="footer">
        <div class="wrap fgrid">
          <div>
            <a routerLink="/" class="wm" style="font-size:22px">esprit<span class="tri"></span><span class="wm-c">CONNECT</span></a>
            <p class="fdesc">The official alumni network of École Supérieure Privée d'Ingénierie et de Technologie.</p>
            <div class="mono fhonoris">PART OF HONORIS UNITED UNIVERSITIES</div>
          </div>
          <div *ngFor="let col of footer">
            <div class="fcol-t mono">{{ col.t }}</div>
            <div *ngFor="let it of col.items" class="fcol-i">{{ it }}</div>
          </div>
        </div>
        <div class="wrap fbottom mono">
          <span>© {{ year }} ESPRIT · Tunis, Tunisia</span>
          <div style="flex:1"></div>
          <span>EN · FR · العربية</span>
        </div>
      </footer>
    </div>
  `,
  styles: [`
    :host { display:block; }
    .lp { background:#070709; color:#ECECEA; font-family:"Instrument Sans", Inter, system-ui, sans-serif; overflow-x:hidden; }
    .abs { position:absolute; inset:0; }
    /* The demo's headline renders in Instrument Sans (its --font-display var is
       never emitted, so font-display falls back to the body sans). Match that. */
    .dsp { font-family:"Instrument Sans", Inter, system-ui, sans-serif; font-weight:400; }
    .mono { font-family:"JetBrains Mono", ui-monospace, monospace; }
    .wrap { position:relative; max-width:1200px; margin:0 auto; }

    /* ---- nav ---- */
    .nav { position:fixed; top:0; left:0; right:0; z-index:50; transition:all .45s ease; padding:0; }
    .nav.scrolled { top:14px; left:14px; right:14px; }
    .nav-inner { max-width:1400px; margin:0 auto; height:80px; display:flex; align-items:center; gap:26px;
      padding:0 clamp(18px,4vw,40px); transition:all .45s ease; }
    .nav.scrolled .nav-inner { height:56px; max-width:1160px; border-radius:16px;
      background:rgba(12,12,15,.85); backdrop-filter:saturate(140%) blur(10px);
      border:1px solid rgba(255,255,255,.1); box-shadow:0 16px 40px -20px rgba(0,0,0,.7); }
    .nav-link { font-size:13.5px; color:rgba(255,255,255,.62); text-decoration:none; transition:color .2s; }
    .nav-link:hover { color:#fff; }
    @media (max-width:900px){ .nav-link { display:none; } }
    .nav-signin { font-size:13.5px; color:rgba(255,255,255,.7); text-decoration:none; }
    .nav-signin:hover { color:#fff; }

    .wm { display:inline-flex; align-items:baseline; gap:2px; font-family:"Space Grotesk",sans-serif;
      font-weight:700; letter-spacing:-.02em; font-size:22px; color:#fff; text-decoration:none; }
    .wm .tri { width:0; height:0; border-left:8px solid #E30613; border-top:6px solid transparent;
      border-bottom:6px solid transparent; margin:0 4px 1px 2px; align-self:center; }
    .wm-c { color:#E30613; font-weight:700; letter-spacing:.02em; text-transform:uppercase; font-size:.82em; }

    /* ---- pills ---- */
    .pill { display:inline-flex; align-items:center; justify-content:center; gap:8px; height:38px; padding:0 18px;
      border-radius:999px; font-size:13.5px; font-weight:600; text-decoration:none; white-space:nowrap;
      border:1px solid transparent; cursor:pointer; transition:all .18s ease; }
    .pill.lg { height:50px; padding:0 26px; font-size:15px; }
    .pill-red { background:#E30613; color:#fff; box-shadow:0 8px 24px -10px rgba(227,6,19,.7); }
    .pill-red:hover { background:#FF2D3D; transform:translateY(-1px); }
    .pill-ghost { background:transparent; color:#fff; border-color:rgba(255,255,255,.2); }
    .pill-ghost:hover { background:rgba(255,255,255,.06); }

    /* ---- hero ---- */
    .hero { position:relative; min-height:100vh; display:flex; align-items:center; overflow:hidden;
      padding:120px clamp(18px,4vw,40px) 60px; }
    .grid-lines { opacity:.16; pointer-events:none; }
    .grid-lines .hl { position:absolute; left:0; right:0; height:1px; background:rgba(255,255,255,.1); }
    .grid-lines .vl { position:absolute; top:0; bottom:0; width:1px; background:rgba(255,255,255,.1); }
    .glow { background:
      radial-gradient(680px 480px at 78% 42%, rgba(227,6,19,.22), transparent 60%),
      radial-gradient(700px 520px at 12% 110%, rgba(122,0,9,.28), transparent 70%); }
    .glow.soft { background:radial-gradient(700px 360px at 50% 0%, rgba(227,6,19,.16), transparent 65%); }

    .hero-inner { position:relative; z-index:2; width:100%; max-width:1340px; margin:0 auto;
      display:grid; grid-template-columns:1.3fr .7fr; align-items:center; gap:40px; }
    @media (max-width:920px){ .hero-inner { grid-template-columns:1fr; } .hero-visual { order:-1; } }

    .eyebrow { display:inline-flex; align-items:center; gap:12px; font-size:14px; color:rgba(255,255,255,.6); }
    .eyebrow-rule { width:32px; height:1px; background:rgba(255,255,255,.3); }
    /* matches the demo hero: clamp(2rem,6vw,7rem) · leading .92 · tracking-tight */
    .hero-title { font-size:clamp(2rem,6vw,6rem); line-height:.92; letter-spacing:-.025em; margin:32px 0 0; color:#fff; }
    /* keep each line on one row so the longest rotating word ("connect")
       never breaks onto a new line */
    .hero-title .block { display:block; white-space:nowrap; }
    .hero-sub { margin:26px 0 0; max-width:520px; font-size:clamp(15px,1.6vw,17px); line-height:1.6; color:rgba(255,255,255,.6); }
    .hero-cta { display:flex; gap:12px; flex-wrap:wrap; margin-top:32px; }
    .hero-cta.center { justify-content:center; }
    .strip { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:40px;
      font-size:11px; letter-spacing:.12em; color:rgba(255,255,255,.38); }
    .strip i { color:rgba(255,255,255,.2); font-style:normal; }

    /* rotating gradient word */
    .gword-wrap { display:inline-block; }
    /* matches the demo's animated word gradient (pink → purple → cyan → amber) */
    .gword { display:inline-block;
      background:linear-gradient(45deg,#eca8d6 0%,#a78bfa 25%,#67e8f9 50%,#fbbf24 75%,#eca8d6 100%);
      background-size:300% 300%; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
      animation: wordIn .55s cubic-bezier(.22,1,.36,1) both, gradShift 1.5s ease infinite; }
    @keyframes wordIn { from { opacity:0; filter:blur(16px); } to { opacity:1; filter:blur(0); } }
    @keyframes gradShift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }

    /* ---- animated logo ---- */
    .hero-visual { display:flex; justify-content:center; }
    .logo-anim { position:relative; width:clamp(240px,32vw,400px); height:clamp(240px,32vw,400px);
      display:grid; place-items:center; }
    .ring { position:absolute; inset:10%; border:1.5px solid rgba(255,45,61,.4); border-radius:50%;
      transform-origin:center; animation:ringPulse 3.6s ease-out infinite; will-change:transform,opacity; }
    .r2{animation-delay:1.2s} .r3{animation-delay:2.4s}
    .logo-svg { position:relative; width:100%; height:100%; overflow:visible; }
    .orbit { transform-box:fill-box; transform-origin:center; animation:lp-spin 26s linear infinite; will-change:transform; }
    .tri-fill { fill:#E30613; opacity:.16; animation:glowPulse 2.8s ease-in-out infinite;
      filter:drop-shadow(0 0 22px rgba(227,6,19,.5)); }
    .tri-draw { fill:none; stroke:#FF2D3D; stroke-width:2.4; stroke-linejoin:round;
      stroke-dasharray:380; stroke-dashoffset:380; animation:triDraw 3.8s ease-in-out infinite;
      filter:drop-shadow(0 0 6px rgba(255,45,61,.75)); }

    /* ---- bands ---- */
    .band { position:relative; padding:clamp(64px,10vw,120px) clamp(18px,4vw,40px); }
    .sec-eyebrow { display:inline-flex; align-items:center; gap:12px; font-size:12px;
      color:rgba(255,255,255,.55); margin-bottom:36px; }
    .pillars { display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:rgba(255,255,255,.08);
      border:1px solid rgba(255,255,255,.08); border-radius:8px; overflow:hidden; }
    @media (max-width:820px){ .pillars { grid-template-columns:1fr; } }
    .pillar { background:#0A0A0C; padding:34px 30px; transition:background .3s; }
    .pillar:hover { background:#0E0E12; }
    .pillar-k { font-size:11px; color:#FF2D3D; letter-spacing:.14em; }
    .pillar-t { font-size:30px; margin:18px 0 12px; color:#fff; }
    .pillar-d { margin:0; font-size:14px; line-height:1.65; color:rgba(255,255,255,.58); }

    /* ---- cta ---- */
    .cta-band { position:relative; padding:clamp(80px,12vw,150px) clamp(18px,4vw,40px); overflow:hidden;
      border-top:1px solid rgba(255,255,255,.06); }
    .cta-wrap { text-align:center; max-width:760px; }
    .cta-title { font-size:clamp(2.2rem,5vw,4rem); margin:0; color:#fff; line-height:1.02; }
    .cta-sub { margin:20px auto 36px; max-width:520px; font-size:16px; color:rgba(255,255,255,.6); }

    /* ---- footer ---- */
    .footer { padding:56px clamp(18px,4vw,40px) 34px; border-top:1px solid rgba(255,255,255,.06); background:#060608; }
    .fgrid { display:grid; grid-template-columns:1.5fr 1fr 1fr 1fr; gap:40px; }
    @media (max-width:820px){ .fgrid { grid-template-columns:1fr 1fr; } }
    .fdesc { font-size:13px; color:rgba(255,255,255,.5); margin:16px 0 18px; max-width:320px; line-height:1.6; }
    .fhonoris { font-size:10px; color:rgba(255,255,255,.32); letter-spacing:.1em; }
    .fcol-t { font-size:11px; font-weight:500; letter-spacing:.12em; color:rgba(255,255,255,.5); margin-bottom:16px; }
    .fcol-i { font-size:13.5px; color:rgba(255,255,255,.62); margin-bottom:11px; cursor:pointer; }
    .fcol-i:hover { color:#fff; }
    .fbottom { display:flex; align-items:center; margin-top:44px; padding-top:22px;
      border-top:1px solid rgba(255,255,255,.06); font-size:11px; color:rgba(255,255,255,.4); }

    @keyframes ringPulse { 0%{transform:scale(.55);opacity:.55} 80%{opacity:0} 100%{transform:scale(1.6);opacity:0} }
    @keyframes glowPulse { 0%,100%{opacity:.12} 50%{opacity:.34} }
    @keyframes triDraw { 0%{stroke-dashoffset:380} 45%{stroke-dashoffset:0} 72%{stroke-dashoffset:0} 100%{stroke-dashoffset:-380} }
    @keyframes lp-spin { to { transform: rotate(360deg); } }
    /* stop all hero animation work once it's scrolled out of view */
    .lp.anim-paused .ring, .lp.anim-paused .orbit,
    .lp.anim-paused .tri-draw, .lp.anim-paused .tri-fill { animation-play-state: paused; }
    @media (prefers-reduced-motion: reduce){ .ring,.tri-draw,.tri-fill,.orbit,.gword{ animation:none !important; } .tri-draw{stroke-dashoffset:0} }
  `]
})
export class LandingComponent implements OnInit, AfterViewInit, OnDestroy {
  protected auth = inject(AuthService);
  private zone = inject(NgZone);
  private host = inject(ElementRef<HTMLElement>);
  protected year = new Date().getFullYear();

  protected scrolled = signal(false);
  protected heroPaused = signal(false);
  private io: IntersectionObserver | null = null;
  private rafPending = false;
  protected wordIndex = signal(0);
  protected word = computed(() => this.words[this.wordIndex()]);
  private readonly words = ['connect', 'mentor', 'hire', 'grow', 'build'];
  private timer: ReturnType<typeof setInterval> | null = null;

  trackWord = (_: number, w: string) => w;

  /** 8 nodes evenly placed on the orbit ring (r=74, centre 100,100). */
  orbitNodes = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return { x: +(100 + 74 * Math.cos(a)).toFixed(1), y: +(100 + 74 * Math.sin(a)).toFixed(1), hot: i % 3 === 0 };
  });

  pillars = [
    { k: '01 / CONNECT', t: 'Find your people',
      d: 'Search alumni and engineers in any company worldwide by specialty, promotion year, skills, country and city — on a grid or a live map.' },
    { k: '02 / GIVE BACK', t: 'Mentor & hire',
      d: 'Offer mentorship, post a job for your team, or speak at an event. Your network compounds when you contribute.' },
    { k: '03 / GROW', t: 'Jobs, events, groups',
      d: 'A job board with AI matching, events to show up to, and private groups from AI to Civil Engineering.' },
  ];

  footer = [
    { t: 'NETWORK', items: ['Directory', 'Mentorship', 'Groups', 'Events'] },
    { t: 'CAREERS', items: ['Jobs', 'Internships', 'Hire alumni', 'Recruiter tools'] },
    { t: 'COMPANY', items: ['About', 'Privacy', 'Terms', 'Contact'] },
  ];

  ngOnInit(): void {
    this.timer = setInterval(() => this.wordIndex.update((i: number) => (i + 1) % this.words.length), 2600);
  }

  ngAfterViewInit(): void {
    // Keep scrolling cheap: listen OUTSIDE Angular (no change detection on
    // every scroll event), throttle with rAF, and only re-enter Angular when
    // the condensed-nav state actually flips.
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.onScroll, { passive: true });
    });

    // Pause the hero animation once it scrolls out of view so it stops using
    // CPU/GPU while the visitor reads the rest of the page.
    const hero = this.host.nativeElement.querySelector('.hero');
    if (hero && 'IntersectionObserver' in window) {
      this.io = new IntersectionObserver(([e]) => {
        const paused = !e.isIntersecting;
        if (paused !== this.heroPaused()) this.zone.run(() => this.heroPaused.set(paused));
      });
      this.io.observe(hero);
    }
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    window.removeEventListener('scroll', this.onScroll);
    this.io?.disconnect();
  }

  private onScroll = (): void => {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      const next = window.scrollY > 20;
      if (next !== this.scrolled()) this.zone.run(() => this.scrolled.set(next));
    });
  };
}
