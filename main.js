(() => {
    'use strict';

    /* =====================================================================
       Flags — cached media queries gate every enhancement
       ===================================================================== */
    const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let REDUCED = rmq.matches;
    (rmq.addEventListener ? rmq.addEventListener('change', e => { REDUCED = e.matches; })
                          : rmq.addListener && rmq.addListener(e => { REDUCED = e.matches; }));
    const FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const root = document.documentElement;

    /* =====================================================================
       Single rAF scheduler — on-demand (scroll/pointer) + continuous (canvas)
       ===================================================================== */
    const continuous = new Set();
    let scrollDirty = true, pointerDirty = false, frameQueued = false;

    function frame(t) {
        frameQueued = false;
        if (scrollDirty) { scrollDirty = false; applyScroll(); }
        if (pointerDirty) { pointerDirty = false; applyPointer(); }
        continuous.forEach(fn => fn(t));
        if (continuous.size && !document.hidden) requestFrame();
    }
    function requestFrame() {
        if (frameQueued || document.hidden) return;
        frameQueued = true;
        requestAnimationFrame(frame);
    }
    function addContinuous(fn) { continuous.add(fn); requestFrame(); }
    function removeContinuous(fn) { continuous.delete(fn); }
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) { scrollDirty = true; requestFrame(); }
    });

    /* =====================================================================
       Pointer state (one global listener, fine pointers only)
       ===================================================================== */
    let pX = -9999, pY = -9999, lastTarget = null, pointerSeen = false;
    // cached layout geometry (recomputed on scroll/resize, never per-frame)
    let geomDirty = true, heroRect = null;
    let tiltCard = null, tiltRect = null;
    if (FINE) {
        window.addEventListener('pointermove', e => {
            pX = e.clientX; pY = e.clientY; lastTarget = e.target;
            pointerDirty = true; pointerSeen = true;
            requestFrame();
        }, { passive: true });
        // When the cursor leaves the window or the page blurs, reset pointer-driven
        // transforms so cards/buttons don't stay frozen in a skewed/offset state.
        const resetPointer = () => { pX = -9999; pY = -9999; lastTarget = null; pointerDirty = true; requestFrame(); };
        document.addEventListener('pointerleave', resetPointer);
        window.addEventListener('blur', resetPointer);
    }

    function recalcGeom() {
        heroRect = hero ? hero.getBoundingClientRect() : null;
        geomDirty = false;
    }

    function applyPointer() {
        if (!FINE) return;
        if (geomDirty) recalcGeom();
        cardStackParallax();
        tilt();
        cursorGlowTick();
    }

    /* =====================================================================
       Footer year
       ===================================================================== */
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    /* =====================================================================
       Mobile nav
       ===================================================================== */
    const toggle = document.querySelector('.nav-toggle');
    const navMain = document.querySelector('.nav-main');
    if (toggle && navMain) {
        toggle.addEventListener('click', () => {
            const open = navMain.classList.toggle('open');
            toggle.classList.toggle('open', open);
            toggle.setAttribute('aria-expanded', String(open));
        });
        navMain.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', () => {
                navMain.classList.remove('open');
                toggle.classList.remove('open');
                toggle.setAttribute('aria-expanded', 'false');
            });
        });
    }

    /* =====================================================================
       Hero word rotator
       ===================================================================== */
    const words = document.querySelectorAll('.hero-rotator .word');
    if (words.length && !REDUCED) {
        let i = 0;
        setInterval(() => {
            words[i].classList.remove('active');
            i = (i + 1) % words.length;
            words[i].classList.add('active');
        }, 2400);
    }

    /* =====================================================================
       Scroll progress + aurora variable
       ===================================================================== */
    let docH = 0;
    function measure() { docH = document.documentElement.scrollHeight - window.innerHeight; }
    measure();
    const invalidateGeom = () => { geomDirty = true; tiltRect = null; };
    window.addEventListener('resize', () => { measure(); invalidateGeom(); scrollDirty = true; requestFrame(); }, { passive: true });
    window.addEventListener('load', () => { measure(); invalidateGeom(); scrollDirty = true; requestFrame(); });
    window.addEventListener('scroll', () => { invalidateGeom(); scrollDirty = true; requestFrame(); }, { passive: true });

    let scrollProgress = 0;
    function applyScroll() {
        scrollProgress = docH > 0 ? Math.min(1, Math.max(0, window.scrollY / docH)) : 0;
        root.style.setProperty('--scroll-progress', scrollProgress.toFixed(4));
        const toTop = document.querySelector('.to-top');
        if (toTop) toTop.classList.toggle('visible', window.scrollY > 600);
    }

    /* =====================================================================
       Active section nav highlight
       ===================================================================== */
    const navLinks = [...document.querySelectorAll('.nav-main a')];
    if ('IntersectionObserver' in window && navLinks.length) {
        const sectionFor = new Map();
        navLinks.forEach(a => {
            const id = a.getAttribute('href');
            if (id && id.length > 1 && id.startsWith('#')) {
                const sec = document.querySelector(id);
                if (sec) sectionFor.set(sec, a);
            }
        });
        const navIO = new IntersectionObserver(entries => {
            entries.forEach(en => {
                if (!en.isIntersecting) return;
                const link = sectionFor.get(en.target);
                if (!link) return;
                navLinks.forEach(a => { a.classList.remove('active'); a.removeAttribute('aria-current'); });
                link.classList.add('active');
                link.setAttribute('aria-current', 'true');
            });
        }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
        sectionFor.forEach((a, sec) => navIO.observe(sec));
    }

    /* =====================================================================
       Reveal on scroll + count-ups + rating fill + heading sweep
       ===================================================================== */
    const revealTargets = document.querySelectorAll(
        '.section-head, .featured-card, .game-card, .commission-card, .jam-card, .jam-stat, .proto-card, .link-card, .about-text, .about-side, .filter-bar, .featured-shots'
    );
    revealTargets.forEach(el => el.classList.add('reveal'));

    function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }

    function countUp(el, target, suffix, dur) {
        if (REDUCED) { el.textContent = target + (suffix || ''); return; }
        const start = performance.now();
        (function step(now) {
            const p = Math.min(1, (now - start) / dur);
            el.textContent = Math.round(easeOutCubic(p) * target) + (suffix || '');
            if (p < 1) requestAnimationFrame(step);
        })(start);
    }

    function countUpEl(el) {
        const raw = (el.textContent || '').trim();
        const target = parseInt(raw.replace(/\D/g, ''), 10) || 0;
        const suffix = raw.replace(/[\d\s]/g, '');
        countUp(el, target, suffix, 1000);
    }

    // ----- Live Steam review score (pulled via a CORS proxy; static HTML = fallback) -----
    let steamData = null;
    const REVIEW_RU = {
        'Overwhelmingly Positive': 'Крайне положительные', 'Very Positive': 'Очень положительные',
        'Positive': 'Положительные', 'Mostly Positive': 'В основном положительные',
        'Mixed': 'Смешанные', 'Mostly Negative': 'В основном отрицательные',
        'Negative': 'Отрицательные', 'Very Negative': 'Очень отрицательные',
        'Overwhelmingly Negative': 'Крайне отрицательные'
    };

    function applyPips(rating, percent) {
        const pips = rating.querySelectorAll('.pip');
        const filled = Math.round(percent / 100 * pips.length);
        pips.forEach((p, i) => { p.style.background = i < filled ? 'var(--success)' : 'rgba(255, 255, 255, 0.12)'; });
    }

    function fillRating() {
        const rating = document.querySelector('.featured-rating');
        if (!rating || rating.dataset.done) return;
        rating.dataset.done = '1';
        rating.classList.add('filled');
        const num = rating.querySelector('.rs-num');
        const target = (steamData && steamData.percent != null) ? steamData.percent
            : (num ? parseInt(num.textContent, 10) || 100 : 100);
        rating.style.setProperty('--rating', (target / 100).toFixed(3));
        applyPips(rating, target);
        if (num) countUp(num, target, '', 1000);
    }

    (function fetchSteamReviews() {
        const steam = 'https://store.steampowered.com/appreviews/4373690?json=1&language=all&purchase_type=all&num_per_page=0&l=russian';
        fetch('https://corsproxy.io/?url=' + encodeURIComponent(steam))
            .then(r => r.json())
            .then(j => {
                const q = j && j.query_summary;
                if (!q || !q.total_reviews) return;
                steamData = {
                    positive: q.total_positive,
                    total: q.total_reviews,
                    percent: Math.round(q.total_positive / q.total_reviews * 100),
                    label: REVIEW_RU[q.review_score_desc] || q.review_score_desc || null
                };
                const rating = document.querySelector('.featured-rating');
                if (!rating) return;
                const label = rating.querySelector('.rating-label');
                const count = rating.querySelector('.rating-count');
                if (label && steamData.label) label.textContent = steamData.label;
                if (count) count.textContent = steamData.positive + ' из ' + steamData.total + ' обзоров — положительные';
                if (rating.dataset.done) {
                    rating.style.setProperty('--rating', (steamData.percent / 100).toFixed(3));
                    applyPips(rating, steamData.percent);
                    const num = rating.querySelector('.rs-num');
                    if (num) num.textContent = steamData.percent;
                }
            })
            .catch(() => { /* offline / proxy down → keep the static HTML values */ });
    })();

    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                el.classList.add('in');
                if (el.classList.contains('jam-stat')) {
                    const n = el.querySelector('.jam-stat-num');
                    if (n) countUpEl(n);
                }
                if (el.classList.contains('featured-card')) fillRating();
                io.unobserve(el);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });
        revealTargets.forEach(el => io.observe(el));
    } else {
        revealTargets.forEach(el => el.classList.add('in'));
        fillRating();
    }

    /* =====================================================================
       Hero entrance choreography (word-by-word title) + stat count-up
       ===================================================================== */
    (function heroEntrance() {
        const h1 = document.querySelector('.hero-title');
        if (h1) {
            let idx = 0;
            [...h1.childNodes].forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const parts = node.textContent.split(/(\s+)/);
                    const frag = document.createDocumentFragment();
                    parts.forEach(part => {
                        if (part === '') return;
                        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
                        const outer = document.createElement('span');
                        outer.className = 'rw';
                        const inner = document.createElement('span');
                        inner.className = 'rw-i';
                        inner.textContent = part;
                        inner.style.setProperty('--i', idx++);
                        outer.appendChild(inner);
                        frag.appendChild(outer);
                    });
                    h1.replaceChild(frag, node);
                } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'BR') {
                    node.classList.add('rw-solo');
                    node.style.setProperty('--i', idx++);
                }
            });
        }
        let started = false;
        const go = () => {
            if (started) return;
            started = true;
            document.body.classList.add('hero-in');
            const delay = REDUCED ? 0 : 850;
            setTimeout(() => {
                document.querySelectorAll('.hero-stats .stat-num[data-count]').forEach(el => {
                    countUp(el, +el.dataset.count, el.dataset.suffix || '', 1000);
                });
            }, delay);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(go));
        } else {
            requestAnimationFrame(() => requestAnimationFrame(go));
        }
        // Guaranteed fallbacks: timers fire even when the tab is hidden / rAF is paused,
        // so the hero never gets stuck invisible.
        window.addEventListener('load', go);
        setTimeout(go, 700);
    })();

    /* =====================================================================
       Living card stack — cursor parallax + click/Enter to deal
       ===================================================================== */
    const hero = document.querySelector('.hero');
    const cardStack = document.querySelector('.card-stack');

    function cardStackParallax() {
        if (!hero || !cardStack || REDUCED) return;
        const r = heroRect || (heroRect = hero.getBoundingClientRect());
        if (pY < r.top - 120 || pY > r.bottom + 120) {
            cardStack.style.setProperty('--px', '0');
            cardStack.style.setProperty('--py', '0');
            return;
        }
        const nx = Math.max(-1, Math.min(1, ((pX - r.left) / r.width - 0.5) * 2));
        const ny = Math.max(-1, Math.min(1, ((pY - r.top) / r.height - 0.5) * 2));
        cardStack.style.setProperty('--px', nx.toFixed(3));
        cardStack.style.setProperty('--py', ny.toFixed(3));
    }

    if (cardStack) {
        const deal = () => {
            if (cardStack.classList.contains('deal')) return;
            cardStack.classList.add('deal');
        };
        cardStack.addEventListener('click', deal);
        cardStack.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault(); deal();
            }
        });
        cardStack.addEventListener('animationend', e => {
            if (e.target.classList && e.target.classList.contains('cw1')) {
                cardStack.classList.remove('deal');
            }
        });
    }

    /* =====================================================================
       Delegated 3D tilt + cursor glare (one resolver for all cards)
       ===================================================================== */
    const TILT_SEL = '.game-card, .jam-card, .proto-card, .link-card, .commission-card';

    function tilt() {
        if (REDUCED) return;
        const card = lastTarget ? lastTarget.closest(TILT_SEL) : null;
        if (card !== tiltCard) {
            if (tiltCard) {
                tiltCard.classList.remove('tilt');
                tiltCard.style.removeProperty('--rx');
                tiltCard.style.removeProperty('--ry');
                tiltCard.style.removeProperty('--mx');
                tiltCard.style.removeProperty('--my');
            }
            tiltCard = card;
            tiltRect = card ? card.getBoundingClientRect() : null;
            if (card) card.classList.add('tilt');
        }
        // re-read rect if invalidated by scroll while hovering the same card
        if (tiltCard && !tiltRect) tiltRect = tiltCard.getBoundingClientRect();
        if (!tiltCard || !tiltRect) return;
        const x = (pX - tiltRect.left) / tiltRect.width;
        const y = (pY - tiltRect.top) / tiltRect.height;
        tiltCard.style.setProperty('--rx', ((0.5 - y) * 4.5).toFixed(2) + 'deg');
        tiltCard.style.setProperty('--ry', ((x - 0.5) * 4.5).toFixed(2) + 'deg');
        tiltCard.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        tiltCard.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    }

    /* =====================================================================
       Cursor glow companion
       ===================================================================== */
    const cursorGlowEl = document.querySelector('.cursor-glow');
    function cursorGlowTick() {
        if (!cursorGlowEl || REDUCED) return;
        if (pointerSeen) cursorGlowEl.classList.add('on');
        cursorGlowEl.style.setProperty('--cgx', pX + 'px');
        cursorGlowEl.style.setProperty('--cgy', pY + 'px');
        const over = lastTarget && lastTarget.closest('a, button, .card-stack');
        cursorGlowEl.classList.toggle('big', !!over);
    }

    /* =====================================================================
       Games filter — FLIP reorder + result counter + a11y
       ===================================================================== */
    (function setupFilter() {
        const chips = [...document.querySelectorAll('.chip')];
        const grid = document.querySelector('.games-grid');
        if (!chips.length || !grid) return;
        const cards = [...grid.querySelectorAll('.game-card')];

        const counter = document.createElement('p');
        counter.className = 'games-count';
        counter.setAttribute('aria-live', 'polite');
        grid.parentNode.insertBefore(counter, grid);

        function plural(n) {
            const n10 = n % 10, n100 = n % 100;
            if (n10 === 1 && n100 !== 11) return 'игра';
            if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return 'игры';
            return 'игр';
        }
        function setCount(n) { counter.textContent = n + ' ' + plural(n); }

        function setHidden(card, hidden) {
            card.classList.toggle('hidden', hidden);
            card.setAttribute('aria-hidden', String(hidden));
            const link = card.querySelector('a');
            if (link) link.tabIndex = hidden ? -1 : 0;
        }

        function apply(filter) {
            const first = new Map();
            cards.forEach(c => { if (!c.classList.contains('hidden')) first.set(c, c.getBoundingClientRect()); });

            let n = 0;
            cards.forEach(c => {
                const match = filter === 'all' || c.dataset.cat === filter;
                setHidden(c, !match);
                if (match) n++;
            });
            setCount(n);

            if (REDUCED) return;

            cards.forEach(c => {
                if (c.classList.contains('hidden')) return;
                const last = c.getBoundingClientRect();
                const f = first.get(c);
                const cleanup = () => { c.style.transition = ''; c.style.transform = ''; c.style.opacity = ''; };
                if (f) {
                    const dx = f.left - last.left, dy = f.top - last.top;
                    if (dx || dy) {
                        c.style.transition = 'none';
                        c.style.transform = `translate(${dx}px, ${dy}px)`;
                        requestAnimationFrame(() => {
                            c.style.transition = 'transform .42s cubic-bezier(.16,1,.3,1)';
                            c.style.transform = '';
                            c.addEventListener('transitionend', cleanup, { once: true });
                        });
                    }
                } else {
                    c.style.transition = 'none';
                    c.style.opacity = '0';
                    c.style.transform = 'scale(.94)';
                    requestAnimationFrame(() => {
                        c.style.transition = 'opacity .35s ease, transform .35s ease';
                        c.style.opacity = '';
                        c.style.transform = '';
                        c.addEventListener('transitionend', cleanup, { once: true });
                    });
                }
            });
        }

        chips.forEach(chip => {
            chip.setAttribute('aria-pressed', chip.classList.contains('active') ? 'true' : 'false');
            chip.addEventListener('click', () => {
                chips.forEach(c => { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); });
                chip.classList.add('active');
                chip.setAttribute('aria-pressed', 'true');
                apply(chip.dataset.filter);
            });
        });
        setCount(cards.length);
    })();

    /* =====================================================================
       Media lightbox (screenshots + trailer) — browsable, no library
       ===================================================================== */
    (function setupLightbox() {
        const lb = document.querySelector('.lightbox');
        if (!lb) return;
        const img = lb.querySelector('.lightbox-img');
        const videoWrap = lb.querySelector('.lightbox-video');
        const videoEl = lb.querySelector('.lightbox-video-el');
        const steamLink = lb.querySelector('.lightbox-steam');
        const closeBtn = lb.querySelector('.lightbox-close');
        const prevBtn = lb.querySelector('.lightbox-prev');
        const nextBtn = lb.querySelector('.lightbox-next');
        const counter = lb.querySelector('.lightbox-counter');
        const bg = [...document.querySelectorAll('.site-header, main, .site-footer')];

        const shots = [...document.querySelectorAll('.featured-shots .shot')];
        if (!shots.length) return;
        const media = shots.map(btn => btn.dataset.type === 'video'
            ? { type: 'video', poster: (btn.querySelector('img') || {}).src || '', hls: btn.dataset.hls, steam: btn.dataset.steam }
            : { type: 'image', src: btn.dataset.full, alt: (btn.querySelector('img') || {}).alt || '' });

        const canHls = !!videoEl && !!(videoEl.canPlayType('application/vnd.apple.mpegurl') || videoEl.canPlayType('application/x-mpegURL'));
        let index = 0, lastFocus = null;

        function stopVideo() {
            if (!videoEl) return;
            try { videoEl.pause(); } catch (e) {}
            videoEl.removeAttribute('src');
            try { videoEl.load(); } catch (e) {}
        }

        function render() {
            const m = media[index];
            if (counter) counter.textContent = (index + 1) + ' / ' + media.length;
            if (m.type === 'video' && videoWrap) {
                img.hidden = true;
                videoWrap.hidden = false;
                videoWrap.style.backgroundImage = m.poster ? 'url("' + m.poster + '")' : '';
                if (steamLink && m.steam) steamLink.href = m.steam;
                if (canHls && m.hls) {
                    if (steamLink) steamLink.hidden = true;
                    videoEl.hidden = false;
                    videoEl.src = m.hls;
                    if (videoEl.play) videoEl.play().catch(() => {});
                } else {
                    videoEl.hidden = true;
                    stopVideo();
                    if (steamLink) steamLink.hidden = false;
                }
            } else {
                stopVideo();
                if (videoWrap) videoWrap.hidden = true;
                img.hidden = false;
                img.src = m.src;
                img.alt = m.alt;
            }
        }

        function go(delta) {
            stopVideo();
            index = (index + delta + media.length) % media.length;
            render();
        }

        function trapList() {
            const list = [prevBtn, nextBtn, closeBtn];
            if (videoWrap && !videoWrap.hidden) {
                if (videoEl && !videoEl.hidden) list.push(videoEl);
                if (steamLink && !steamLink.hidden) list.push(steamLink);
            }
            return list.filter(Boolean);
        }

        function onKey(e) {
            if (e.key === 'Escape') { close(); return; }
            if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); return; }
            if (e.key === 'ArrowRight') { e.preventDefault(); go(1); return; }
            if (e.key === 'Tab') {
                const f = trapList();
                if (!f.length) return;
                e.preventDefault();
                const i = f.indexOf(document.activeElement);
                f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
            }
        }

        function open(i) {
            index = i;
            render();
            lb.classList.add('open');
            bg.forEach(el => el.setAttribute('inert', ''));
            lastFocus = document.activeElement;
            closeBtn.focus();
            document.addEventListener('keydown', onKey);
        }
        function close() {
            lb.classList.remove('open');
            bg.forEach(el => el.removeAttribute('inert'));
            document.removeEventListener('keydown', onKey);
            stopVideo();
            setTimeout(() => { img.src = ''; if (videoWrap) videoWrap.style.backgroundImage = ''; }, 300);
            if (lastFocus && lastFocus.focus) lastFocus.focus();
        }

        lb.addEventListener('click', e => { if (e.target === lb) close(); });
        closeBtn.addEventListener('click', close);
        if (prevBtn) prevBtn.addEventListener('click', () => go(-1));
        if (nextBtn) nextBtn.addEventListener('click', () => go(1));
        shots.forEach((btn, i) => btn.addEventListener('click', () => open(i)));
    })();

    /* =====================================================================
       Media strip — scroll arrows + edge state
       ===================================================================== */
    (function setupMediaStrip() {
        const track = document.querySelector('.featured-shots');
        const prev = document.querySelector('.media-prev');
        const next = document.querySelector('.media-next');
        if (!track || !prev || !next) return;

        // scroll-snap rests the first item at scrollLeft ≈ padding-left, never 0,
        // so the "at start" threshold tracks the actual padding (re-measured on resize).
        let floor = 0;
        function measure() { floor = (parseFloat(getComputedStyle(track).paddingLeft) || 0) + 4; }
        function update() {
            const max = track.scrollWidth - track.clientWidth - 2;
            prev.hidden = track.scrollLeft <= floor;
            next.hidden = track.scrollLeft >= max || max <= 0;
        }
        function nudge(dir) {
            track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: REDUCED ? 'auto' : 'smooth' });
        }
        prev.addEventListener('click', () => nudge(-1));
        next.addEventListener('click', () => nudge(1));
        track.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', () => { measure(); update(); }, { passive: true });
        window.addEventListener('load', () => { measure(); update(); });
        measure();
        update();
        setTimeout(() => { measure(); update(); }, 250);
    })();

    /* =====================================================================
       Constellation / particle background field
       ===================================================================== */
    (function setupField() {
        if (REDUCED || window.innerWidth < 480) return;
        const cv = document.querySelector('.bg-field');
        if (!cv) return;
        const ctx = cv.getContext('2d');
        if (!ctx) return;

        let w, h, dpr, parts;
        function resize() {
            dpr = Math.min(1.5, window.devicePixelRatio || 1);
            const cw = document.documentElement.clientWidth, ch = document.documentElement.clientHeight;
            w = cv.width = Math.floor(cw * dpr);
            h = cv.height = Math.floor(ch * dpr);
            cv.style.width = cw + 'px';
            cv.style.height = ch + 'px';
            const count = cw < 900 ? 34 : 56;
            parts = Array.from({ length: count }, () => ({
                x: Math.random() * w, y: Math.random() * h,
                vx: (Math.random() - 0.5) * 0.16 * dpr,
                vy: (Math.random() - 0.5) * 0.16 * dpr,
                r: (Math.random() * 1.6 + 0.6) * dpr
            }));
        }
        resize();
        window.addEventListener('resize', resize, { passive: true });

        function tick() {
            ctx.clearRect(0, 0, w, h);
            const mix = scrollProgress;
            const r = Math.round(124 + (255 - 124) * mix);
            const g = Math.round(92 + (138 - 92) * mix);
            const b = Math.round(255 + (61 - 255) * mix);
            const cgx = pX * dpr, cgy = pY * dpr;
            for (let i = 0; i < parts.length; i++) {
                const p = parts[i];
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0) p.x += w; else if (p.x > w) p.x -= w;
                if (p.y < 0) p.y += h; else if (p.y > h) p.y -= h;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
                ctx.fill();
            }
            if (FINE && pointerSeen) {
                const R = 150 * dpr;
                for (let i = 0; i < parts.length; i++) {
                    const p = parts[i];
                    if (Math.abs(p.x - cgx) > R || Math.abs(p.y - cgy) > R) continue;
                    for (let j = i + 1; j < parts.length; j++) {
                        const q = parts[j];
                        const dx = p.x - q.x, dy = p.y - q.y;
                        const d2 = dx * dx + dy * dy;
                        if (d2 < (110 * dpr) * (110 * dpr)) {
                            const a = (1 - Math.sqrt(d2) / (110 * dpr)) * 0.16;
                            ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
                            ctx.lineWidth = dpr * 0.6;
                            ctx.beginPath();
                            ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
                            ctx.stroke();
                        }
                    }
                }
            }
        }
        addContinuous(tick);
    })();

    /* =====================================================================
       Ember particles over the Hearth & Shadow key art
       ===================================================================== */
    (function setupEmber() {
        if (REDUCED) return;
        const cv = document.querySelector('.ember-canvas');
        if (!cv) return;
        const cover = cv.closest('.featured-cover');
        const ctx = cv.getContext('2d');
        if (!ctx || !cover) return;

        let w, h, dpr, embers, running = false;
        function resize() {
            const rect = cover.getBoundingClientRect();
            dpr = Math.min(2, window.devicePixelRatio || 1);
            w = cv.width = Math.max(1, Math.floor(rect.width * dpr));
            h = cv.height = Math.max(1, Math.floor(rect.height * dpr));
            cv.style.width = rect.width + 'px';
            cv.style.height = rect.height + 'px';
        }
        function spawn() {
            return {
                x: Math.random() * w,
                y: h + Math.random() * 20 * (dpr || 1),
                vy: -(Math.random() * 0.4 + 0.25) * (dpr || 1),
                sway: Math.random() * Math.PI * 2,
                swayS: Math.random() * 0.03 + 0.01,
                r: (Math.random() * 1.6 + 0.8) * (dpr || 1),
                life: Math.random() * 0.5 + 0.5
            };
        }
        function tick() {
            ctx.clearRect(0, 0, w, h);
            for (let i = 0; i < embers.length; i++) {
                const e = embers[i];
                e.y += e.vy;
                e.sway += e.swayS;
                const x = e.x + Math.sin(e.sway) * 8 * (dpr || 1);
                e.life -= 0.004;
                if (e.y < -10 || e.life <= 0) { embers[i] = spawn(); continue; }
                const alpha = Math.max(0, Math.min(0.85, e.life)) * 0.8;
                ctx.beginPath();
                ctx.arc(x, e.y, e.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, ${Math.round(150 + Math.random() * 40)}, 70, ${alpha})`;
                ctx.shadowBlur = 6 * (dpr || 1);
                ctx.shadowColor = 'rgba(255,140,60,0.8)';
                ctx.fill();
            }
            ctx.shadowBlur = 0;
        }

        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver(es => {
                es.forEach(en => {
                    if (en.isIntersecting) {
                        resize();
                        embers = Array.from({ length: window.innerWidth < 720 ? 12 : 18 }, spawn);
                        if (!running) { running = true; addContinuous(tick); }
                    } else if (running) {
                        running = false; removeContinuous(tick);
                    }
                });
            }, { threshold: 0.05 });
            io.observe(cover);
        }
        window.addEventListener('resize', () => { if (running) resize(); }, { passive: true });
    })();

    /* =====================================================================
       Smooth scroll offset for sticky header
       ===================================================================== */
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', (e) => {
            const id = link.getAttribute('href');
            if (id.length < 2) return;
            const target = document.querySelector(id);
            if (!target) return;
            e.preventDefault();
            const headerH = document.querySelector('.site-header')?.offsetHeight || 0;
            const top = target.getBoundingClientRect().top + window.scrollY - headerH + 1;
            window.scrollTo({ top, behavior: REDUCED ? 'auto' : 'smooth' });
        });
    });

    /* =====================================================================
       Image fallback (broken itch/gamin images)
       ===================================================================== */
    document.querySelectorAll('.game-cover img, .jam-cover img, .commission-cover img').forEach(img => {
        img.addEventListener('error', () => {
            const parent = img.parentElement;
            if (!parent) return;
            const isJam = parent.classList.contains('jam-cover');
            const title = parent.nextElementSibling?.querySelector('h3')?.textContent || 'Game';
            parent.classList.add(isJam ? 'jam-cover-fallback' : 'game-cover-fallback');
            img.remove();
            const text = document.createElement('div');
            text.className = 'cover-text';
            text.textContent = title;
            parent.appendChild(text);
        });
    });

    /* =====================================================================
       Easter egg — Shadow Mode (Konami code or type "shadow")
       ===================================================================== */
    (function shadowMode() {
        const toastEl = document.querySelector('.sr-toast');
        let toastTimer;
        function toast(msg) {
            if (!toastEl) return;
            toastEl.textContent = msg;
            toastEl.classList.add('show');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
        }
        function toggle() {
            const on = document.body.classList.toggle('shadow-mode');
            toast(on ? '🌑 Shadow Mode включён' : '☀️ Shadow Mode выключен');
        }
        const konami = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
        let kIdx = 0, typed = '';
        window.addEventListener('keydown', e => {
            kIdx = (e.keyCode === konami[kIdx]) ? kIdx + 1 : (e.keyCode === konami[0] ? 1 : 0);
            if (kIdx === konami.length) { kIdx = 0; toggle(); }
            if (/^[a-zA-Z]$/.test(e.key)) {
                typed = (typed + e.key.toLowerCase()).slice(-6);
                if (typed === 'shadow') { typed = ''; toggle(); }
            }
        });
    })();

})();
