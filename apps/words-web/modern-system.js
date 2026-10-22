(function () {
    const desktopItems = [
        ['home', 'home', '首页', 'goHome()'],
        ['study', 'book-open', '单词学习', 'nwOpenStudy()'],
        ['outline', 'library-big', '词汇大纲', 'enterOutline()'],
        ['favorites', 'star', '我的收藏', 'enterFavorites()'],
        ['wrongbook', 'circle-x', '错题复习', 'nwOpenWrongbook()'],
        ['exam', 'notebook-pen', '备考中心', 'enterExamPage()'],
        ['custom', 'layers-3', '自建词库', 'enterCustomPage()'],
        ['lookup', 'search', '查词', 'openLookupPage()']
    ];

    const mobileItems = [
        ['home', 'home', '首页', 'nwGoHome()'],
        ['study', 'book-open', '背词', 'nwOpenStudy()'],
        ['outline', 'library-big', '大纲', 'enterOutline()'],
        ['me', 'user-round', '我的', 'nwOpenMe()']
    ];

    function itemMarkup(item, mobile) {
        const cls = mobile ? 'nw-mobile-link' : 'nw-global-link';
        return '<button type="button" class="' + cls + '" data-nw-section="' + item[0] + '" onclick="' + item[3] + '">' +
            '<i data-lucide="' + item[1] + '" aria-hidden="true"></i><span>' + item[2] + '</span></button>';
    }

    function mountNavigation() {
        if (document.getElementById('nw-global-nav')) return;
        const desktop = document.createElement('nav');
        desktop.id = 'nw-global-nav';
        desktop.className = 'nw-global-nav';
        desktop.setAttribute('aria-label', '新版主导航');
        desktop.innerHTML =
            '<div class="nw-global-brand"><div class="nw-global-mark">NW</div><div><div class="nw-global-name">NaviWords</div><div class="nw-global-sub">英语专业复习系统</div></div></div>' +
            '<div class="nw-global-label">学习</div><div class="nw-global-links">' + desktopItems.map(function (item) { return itemMarkup(item, false); }).join('') + '</div>' +
            '<div class="nw-global-footer"><a class="nw-global-study" href="https://study.example.test/"><i data-lucide="layout-grid" aria-hidden="true"></i><span>返回 NaviStudy</span></a><button type="button" class="nw-global-version" onclick="switchWordsWebVersion(\'legacy\')"><i data-lucide="repeat-2" aria-hidden="true"></i><span>切换旧版</span></button><div class="nw-global-build">新版完整界面</div></div>';
        document.body.insertBefore(desktop, document.body.firstChild);

        const mobile = document.createElement('nav');
        mobile.id = 'nw-mobile-dock';
        mobile.className = 'nw-mobile-dock';
        mobile.setAttribute('aria-label', '新版移动导航');
        mobile.innerHTML = mobileItems.map(function (item) { return itemMarkup(item, true); }).join('');
        document.body.appendChild(mobile);

        const utility = document.createElement('div');
        utility.className = 'nw-mobile-utility';
        utility.innerHTML = '<span>NaviWords</span><div class="nw-mobile-actions"><a class="nw-mobile-study" href="https://study.example.test/"><i data-lucide="layout-grid" aria-hidden="true"></i><span>NaviStudy</span></a><button type="button" class="nw-mobile-version" title="切换旧版" aria-label="切换旧版" onclick="switchWordsWebVersion(\'legacy\')"><i data-lucide="repeat-2" aria-hidden="true"></i></button></div>';
        document.body.appendChild(utility);
    }

    const unitMap = {
        3: ['all', 1, 4, 5, 9, 13],
        4: ['all', 101, 102, 103, 108, 109, 201, 202, 203],
        5: ['all', 301, 302, 303, 304, 305]
    };
    let selectedBook = Number(localStorage.getItem('nw_last_book') || 5);
    let selectedUnit = 'all';

    function readProgress() {
        try { return JSON.parse(localStorage.getItem('_last_progress') || 'null'); }
        catch (e) { return null; }
    }

    function unitLabel(unit) {
        if (unit === 'all') return '全部';
        if (unit >= 300) return 'U' + (unit - 300);
        if (unit >= 200) return 'Dual U' + (unit - 200);
        if (unit >= 100) return 'U' + (unit - 100);
        return 'U' + unit;
    }

    function renderHomeLaunch() {
        const units = document.getElementById('nw-home-units');
        if (!units) return;
        const progress = readProgress();
        if (!unitMap[selectedBook]) selectedBook = 5;
        if (!unitMap[selectedBook].includes(selectedUnit)) selectedUnit = 'all';

        document.querySelectorAll('#nw-home-books [data-book]').forEach(function (button) {
            const active = Number(button.dataset.book) === selectedBook;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        units.innerHTML = unitMap[selectedBook].map(function (unit) {
            const active = unit === selectedUnit;
            return '<button type="button" class="' + (active ? 'active' : '') + '" aria-pressed="' + (active ? 'true' : 'false') + '" onclick="nwSelectHomeUnit(' + (unit === 'all' ? "'all'" : unit) + ')">' + unitLabel(unit) + '</button>';
        }).join('');

        const count = document.getElementById('nw-launch-count');
        const summary = document.getElementById('nw-launch-progress');
        const title = document.getElementById('nw-launch-primary-title');
        const sub = document.getElementById('nw-launch-primary-sub');
        if (count) count.textContent = 'Book ' + selectedBook + ' · ' + unitLabel(selectedUnit);

        const canResume = progress && Number(progress.book) === selectedBook && progress.unit === selectedUnit;
        if (canResume) {
            if (summary) summary.textContent = '上次背到 ' + progress.word + '，第 ' + (Number(progress.cardIndex || 0) + 1) + ' 个词。';
            if (title) title.textContent = '继续背诵';
            if (sub) sub.textContent = '从 ' + progress.word + ' 继续';
        } else {
            if (summary) summary.textContent = 'Book ' + selectedBook + ' · ' + unitLabel(selectedUnit);
            if (title) title.textContent = '开始背诵';
            if (sub) sub.textContent = '进入当前学习范围';
        }
        if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
    }

    window.nwSelectHomeBook = function (book) {
        selectedBook = Number(book);
        const progress = readProgress();
        selectedUnit = progress && Number(progress.book) === selectedBook && unitMap[selectedBook].includes(progress.unit)
            ? progress.unit
            : 'all';
        localStorage.setItem('nw_last_book', String(selectedBook));
        renderHomeLaunch();
    };

    window.nwSelectHomeUnit = function (unit) {
        selectedUnit = unit;
        renderHomeLaunch();
    };

    window.nwStartPlan = function (mode) {
        const progress = readProgress();
        if (selectedBook === 3) window.enterBook3();
        else if (selectedBook === 4) window.enterBook4();
        else window.enterBook5();
        window.changeUnit(selectedUnit);
        window.switchMode(mode || 'card');
        if (mode === 'card' && progress && Number(progress.book) === selectedBook && progress.unit === selectedUnit) {
            cardIndex = Math.min(Number(progress.cardIndex || 0), Math.max(0, currentData.length - 1));
            window.updateCardUI();
        }
    };

    window.nwOpenWrongbook = function () {
        wrongOnlyEnabled = true;
        localStorage.setItem('_wrong_only_units', '1');
        window.nwStartPlan('choice');
        if (typeof window.syncWrongbookButtons === 'function') window.syncWrongbookButtons();
    };

    window.nwGoHome = function () {
        document.body.classList.remove('nw-show-me');
        window.goHome();
        renderHomeLaunch();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.nwOpenStudy = function () {
        document.body.classList.remove('nw-show-me');
        const progress = readProgress();
        selectedBook = progress && unitMap[Number(progress.book)] ? Number(progress.book) : Number(localStorage.getItem('nw_last_book') || 5);
        selectedUnit = progress && Number(progress.book) === selectedBook && unitMap[selectedBook].includes(progress.unit) ? progress.unit : 'all';
        window.nwStartPlan('card');
    };

    window.nwOpenMe = function () {
        window.goHome();
        document.body.classList.add('nw-show-me');
        syncNavigation();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    function visible(id) {
        const el = document.getElementById(id);
        return !!el && getComputedStyle(el).display !== 'none';
    }

    function currentSection() {
        if (document.body.classList.contains('nw-show-me')) return 'me';
        const lookup = document.getElementById('cl-lookup-page');
        if (lookup && lookup.classList.contains('open')) return 'lookup';
        if (visible('review-page')) {
            const wrongActive = document.querySelector('.wrongbook-filter-btn.active');
            return wrongActive ? 'wrongbook' : 'study';
        }
        if (visible('favorites-page')) return 'favorites';
        if (visible('exam-page')) return 'exam';
        if (visible('outline-page')) return 'outline';
        if (visible('custom-page')) return 'custom';
        return 'home';
    }

    function syncNavigation() {
        const section = currentSection();
        document.querySelectorAll('[data-nw-section]').forEach(function (button) {
            const active = button.dataset.nwSection === section;
            button.classList.toggle('active', active);
            if (active) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
        document.body.dataset.nwPage = section;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } });
        }
    }

    function observePages() {
        const observer = new MutationObserver(syncNavigation);
        ['home-page', 'review-page', 'favorites-page', 'exam-page', 'outline-page', 'custom-page', 'cl-lookup-page'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) observer.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        document.addEventListener('click', function () { setTimeout(syncNavigation, 0); });
    }

    function labelNavigation() {
        document.querySelectorAll('#book3-nav-group .nav-btn, #book4-nav-group .nav-btn, #book5-nav-group .nav-btn').forEach(function (button, index) {
            button.setAttribute('aria-label', '切换练习模式：' + button.textContent.trim());
        });
        document.querySelectorAll('.filter-btn, .outline-unit-btn').forEach(function (button) {
            button.setAttribute('aria-pressed', button.classList.contains('active') ? 'true' : 'false');
        });
    }

    function sanitizeExternalStats() {
        ['busuanzi_site_pv', 'busuanzi_site_uv', 'busuanzi_today_pv', 'busuanzi_today_uv'].forEach(function (id) {
            const el = document.getElementById(id);
            if (!el) return;
            const clean = function () {
                if (/域名|IP|禁用/.test(el.textContent || '')) el.textContent = '-';
            };
            clean();
            new MutationObserver(clean).observe(el, { childList: true, subtree: true, characterData: true });
            window.setTimeout(function () {
                if ((el.textContent || '').trim() === '…') {
                    el.textContent = '-';
                    el.title = '访问统计暂不可用';
                }
            }, 5000);
        });
    }

    function boot() {
        mountNavigation();
        observePages();
        labelNavigation();
        sanitizeExternalStats();
        const progress = readProgress();
        if (progress && unitMap[Number(progress.book)]) {
            selectedBook = Number(progress.book);
            selectedUnit = unitMap[selectedBook].includes(progress.unit) ? progress.unit : 'all';
        }
        renderHomeLaunch();
        syncNavigation();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
