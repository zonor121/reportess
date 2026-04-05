document.addEventListener("DOMContentLoaded", function () {
    const registerForm = document.getElementById("register-form");
    if (!registerForm) return;

    registerForm.addEventListener("submit", function (e) {
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirm_password").value;

        if (password !== confirmPassword) {
            e.preventDefault();
            showNotification("Пароли не совпадают!", "danger");
            return;
        }

        if (password.length < 6) {
            e.preventDefault();
            showNotification("Пароль должен быть не менее 6 символов!", "danger");
            return;
        }
    });
});