document.addEventListener('DOMContentLoaded', () => {
    const accountMenuToggle = document.getElementById('accountMenuToggle');
    const accountSidebar = document.getElementById('accountSidebar');
    const accountOverlay = document.getElementById('accountOverlay');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    const sidebarUsername = document.getElementById('sidebarUsername');
    const sidebarEmail = document.getElementById('sidebarEmail');

    // Отримуємо дані поточного користувача з localStorage
    const savedUsername = localStorage.getItem('authUsername');
    const savedEmail = localStorage.getItem('authEmail');

    // Якщо користувач не авторизований, перекидаємо на сторінку входу
    if (!savedUsername || !savedEmail) {
        window.location.href = 'login.html';
        return;
    }

    // Відображаємо дані в панелі
    sidebarUsername.textContent = savedUsername;
    sidebarEmail.textContent = savedEmail;

    // Відкриття панелі акаунта
    function openAccountSidebar() {
        accountSidebar.classList.add('active');
        accountOverlay.classList.add('active');
    }

    // Закриття панелі акаунта
    function closeAccountSidebar() {
        accountSidebar.classList.remove('active');
        accountOverlay.classList.remove('active');
    }

    if (accountMenuToggle) {
        accountMenuToggle.addEventListener('click', openAccountSidebar);
    }

    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', closeAccountSidebar);
    }

    if (accountOverlay) {
        accountOverlay.addEventListener('click', closeAccountSidebar);
    }

    // Логіка виходу з акаунта
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm("Ви дійсно хочете вийти з акаунта?")) {
                // Очищаємо дані поточної сесії
                localStorage.removeItem('authUsername');
                localStorage.removeItem('authEmail');

                // Перенаправляємо на сторінку входу
                window.location.href = 'login.html';
            }
        });
    }
});