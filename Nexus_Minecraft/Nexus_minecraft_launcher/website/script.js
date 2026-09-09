;(() => {
  'use strict';

  /* ── Constants ── */
  const REPO = 'DabstebPlay2-jpg/Nexus_mincraft_laucher';
  const API = `https://api.github.com/repos/${REPO}/releases/latest`;

  /* ── DOM refs ── */
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];

  const versionEl = $('#versionStat');
  const versionFooter = $('#footerVersion');
  const verDate = $('.version-date');
  const dlSetup = $('#dlSetup');
  const dlPortable = $('#dlPortable');
  const toast = $('#toast');
  const curGlow = $('.cursor-glow');
  const burger = $('.burger-menu');
  const mobileMenu = $('.mobile-menu');
  const body = document.body;

  /* ── Theme ── */
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('nexus-theme', t);
  }
  const saved = localStorage.getItem('nexus-theme');
  if (saved === 'light' || saved === 'dark') setTheme(saved);
  $('#themeToggle')?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    setTheme(cur === 'light' ? 'dark' : 'light');
  });

  /* ── Mobile menu ── */
  burger?.addEventListener('click', () => {
    mobileMenu?.classList.toggle('open');
  });

  /* ── Version loader ── */
  async function loadRelease() {
    try {
      const r = await (await fetch(API)).json();
      const ver = r.tag_name || r.name || '';
      versionEl && (versionEl.textContent = ver);
      versionFooter && (versionFooter.textContent = ver);
      if (verDate) {
        const d = new Date(r.published_at);
        verDate.textContent = d.toLocaleDateString('ru-RU', {
          year: 'numeric', month: 'long', day: 'numeric',
        });
      }
      const assets = r.assets || [];
      const setupAsset = assets.find((a) =>
        a.name.endsWith('.exe') && !a.name.includes('Portable')
      );
      const portableAsset = assets.find((a) =>
        a.name.endsWith('.zip') && a.name.toLowerCase().includes('portable')
      );
      if (setupAsset && dlSetup) dlSetup.href = setupAsset.browser_download_url;
      if (portableAsset && dlPortable) dlPortable.href = portableAsset.browser_download_url;

      const sizeEl = $('.file-size');
      if (sizeEl && assets[0]) {
        const mb = (assets[0].size / 1048576).toFixed(1);
        sizeEl.textContent = `${mb} MB`;
      }
      const sumEl = $('.file-sha256');
      if (sumEl && assets[0]) {
        const url = assets[0].browser_download_url;
        if (url) {
          fetch(url + '.sha256')
            .then((d) => d.text())
            .then((s) => { sumEl.textContent = s.slice(0, 16) + '…'; })
            .catch(() => { sumEl.textContent = '—'; });
        }
      }
    } catch {
      /* fail silently */
    }
  }
  loadRelease();

  /* ── Smart Builder ── */
  const PRESETS = {
    fps: {
      title: 'FPS MAX',
      desc: 'Полная оптимизация для слабых ПК. Убирает всё лишнее, максимизирует производительность.',
      icon: '⚡',
      mods: [
        'Sodium', 'Lithium', 'Phosphor', 'EntityCulling',
        'FerriteCore', 'Krypton', 'LazyDFU', 'SmoothBoot',
        'DynamicFPS', 'MemoryLeakFix', 'C2ME', 'ModernFix',
      ],
      ram: '2 GB',
      fps: '+120%',
    },
    beauty: {
      title: 'Beauty+',
      desc: 'Фотореалистичная графика. Шейдеры, тени, PBR-текстуры и полный ремастер картинки.',
      icon: '🎨',
      mods: [
        'Iris', 'Complementary Shaders', 'Continuity',
        'MakeUp Shaders', 'BSL Shaders', 'Sodium',
        'EntityCulling', 'CIT Resewn', 'Fabrishot',
      ],
      ram: '8 GB',
      fps: '-30%',
    },
    vanilla: {
      title: 'Vanilla+',
      desc: 'Классическое ощущение ванильного Minecraft с небольшими улучшениями качества жизни.',
      icon: '🌿',
      mods: [
        'Sodium', 'Lithium', 'Mod Menu', 'Roughly Enough Items',
        'AppleSkin', 'BetterF3', 'MiniHUD', 'WaveyCapes',
        'No Chat Reports', 'JEI',
      ],
      ram: '3 GB',
      fps: '+15%',
    },
    survival: {
      title: 'Survival Pro',
      desc: 'Набор для хардкорного выживания: карты, мини-карты, улучшенный инвентарь и информация.',
      icon: '⛏️',
      mods: [
        'JourneyMap', 'Xaeros Minimap', 'Roughly Enough Items',
        'AppleSkin', 'BetterF3', 'MiniHUD', 'LightOverlay',
        'Sodium', 'Lithium', 'WaveyCapes', 'No Chat Reports',
      ],
      ram: '4 GB',
      fps: '+5%',
    },
  };

  const tabContainer = $('.builder-tabs');
  const output = $('.builder-output');

  function renderPreset(key) {
    const p = PRESETS[key];
    if (!p) return;
    output.innerHTML = `
      <div class="preset-header">
        <div class="preset-title">${p.icon} ${p.title}</div>
        <div class="preset-metrics">
          <div class="metric">RAM <span>${p.ram}</span></div>
          <div class="metric">FPS <span>${p.fps}</span></div>
        </div>
      </div>
      <div class="preset-desc">${p.desc}</div>
      <div class="preset-mods-title">Рекомендуемые моды</div>
      <div class="mod-list">${p.mods.map((m) => `<span class="mod-tag">${m}</span>`).join('')}</div>
    `;
  }

  function buildTabs() {
    if (!tabContainer || !output) return;
    const keys = Object.keys(PRESETS);
    tabContainer.innerHTML = keys
      .map((k, i) => {
        const p = PRESETS[k];
        return `<button class="tab-btn${i === 0 ? ' active' : ''}" data-key="${k}">
          <span class="tab-icon">${p.icon}</span> ${p.title}
        </button>`;
      })
      .join('');
    renderPreset(keys[0]);
    tabContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      $$('.tab-btn', tabContainer).forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderPreset(btn.dataset.key);
    });
  }
  buildTabs();

  /* ── Card tilt ── */
  const tiltWrap = $('.mockup-3d-wrap');
  if (tiltWrap) {
    const parent = tiltWrap.closest('.hero-visual');
    parent?.addEventListener('pointermove', (e) => {
      const rect = parent.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * -2;
      tiltWrap.style.transform =
        `rotateY(${x * 6}deg) rotateX(${y * 4}deg)`;
    });
    parent?.addEventListener('pointerleave', () => {
      tiltWrap.style.transform = 'rotateY(-6deg) rotateX(4deg)';
    });
  }

  /* ── Scroll reveal ── */
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('visible');
        });
      },
      { threshold: 0.1 }
    );
    $$('.reveal').forEach((el) => observer.observe(el));
  } else {
    $$('.reveal').forEach((el) => el.classList.add('visible'));
  }

  /* ── Cursor glow ── */
  if (curGlow) {
    body.addEventListener('pointermove', (e) => {
      curGlow.style.left = e.clientX + 'px';
      curGlow.style.top = e.clientY + 'px';
    });
  }

  /* ── Copy link to clipboard ── */
  $('#copyLink')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      if (!toast) return;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    });
  });

  /* ── FAQ accordion ── */
  $$('.faq-question').forEach((q) => {
    q.addEventListener('click', () => {
      const item = q.parentElement;
      const was = item.classList.contains('active');
      $$('.faq-item.active').forEach((i) => i.classList.remove('active'));
      if (!was) item.classList.add('active');
    });
  });
})();
