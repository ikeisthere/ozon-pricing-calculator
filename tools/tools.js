    (() => {
      const sections = [...document.querySelectorAll('.category-section')];
      const menuButton = document.querySelector('.menu-button');
      const nav = document.querySelector('#site-nav');
      if (['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
        document.querySelectorAll('a[href^="https://ozon.kuakuakua.com"]').forEach((link) => {
          const target = new URL(link.href);
          const localPath = target.pathname === '/' ? '/index.html' : target.pathname;
          link.href = `${window.location.origin}${localPath}${target.search}${target.hash}`;
        });
      }
      const closeMenu = () => {
        nav?.classList.remove('open');
        menuButton?.setAttribute('aria-expanded', 'false');
        menuButton?.setAttribute('aria-label', '打开导航菜单');
      };
      menuButton?.addEventListener('click', () => {
        const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
        menuButton.setAttribute('aria-expanded', String(!isOpen));
        menuButton.setAttribute('aria-label', isOpen ? '打开导航菜单' : '关闭导航菜单');
        nav?.classList.toggle('open', !isOpen);
      });
      nav?.addEventListener('click', (event) => { if (event.target.closest('a')) closeMenu(); });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && nav?.classList.contains('open')) {
          closeMenu();
          menuButton?.focus();
        }
      });
      const categoryLinks = [...document.querySelectorAll('.category-link')];
      const setActive = id => categoryLinks.forEach(link => link.classList.toggle('is-active', link.hash === `#${id}`));
      categoryLinks.forEach(link => link.addEventListener('click', () => setActive(link.hash.slice(1))));
      if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
          const current = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (current) setActive(current.target.id);
        }, { rootMargin: '-22% 0px -68% 0px', threshold: [0, .1, .4] });
        sections.forEach(section => observer.observe(section));
      }
    })();
