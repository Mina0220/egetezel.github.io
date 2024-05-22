document.addEventListener('DOMContentLoaded', () => {
    const enBtn = document.getElementById('en-btn');
    const trBtn = document.getElementById('tr-btn');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const body = document.body;

    enBtn.addEventListener('click', () => {
        switchLanguage('en');
    });

    trBtn.addEventListener('click', () => {
        switchLanguage('tr');
    });

    themeToggleBtn.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        themeToggleBtn.textContent = body.classList.contains('dark-mode') ? '☀️' : '🌙';
    });

    const switchLanguage = (language) => {
        document.querySelectorAll('[data-en]').forEach(el => {
            el.textContent = el.getAttribute(`data-${language}`);
        });
    };

    // Default to English
    switchLanguage('en');

    // Scroll animation
    const elements = document.querySelectorAll('.animate');
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, {
        threshold: 0.1
    });

    elements.forEach(el => observer.observe(el));
});
