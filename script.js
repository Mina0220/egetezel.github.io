const translations = document.querySelectorAll("[data-en]");
const enButton = document.getElementById("en-btn");
const trButton = document.getElementById("tr-btn");
const themeToggle = document.getElementById("theme-toggle");

const setLanguage = (lang) => {
    translations.forEach((element) => {
        const text = element.dataset[lang];
        if (text) {
            element.innerHTML = text;
        }
    });
    document.documentElement.lang = lang === "tr" ? "tr" : "en";
    enButton.classList.toggle("active", lang === "en");
    trButton.classList.toggle("active", lang === "tr");
};

const toggleTheme = () => {
    document.body.classList.toggle("dark");
    themeToggle.textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";
};

if (enButton && trButton) {
    enButton.addEventListener("click", () => setLanguage("en"));
    trButton.addEventListener("click", () => setLanguage("tr"));
}

if (themeToggle) {
    themeToggle.addEventListener("click", toggleTheme);
}

setLanguage("tr");
