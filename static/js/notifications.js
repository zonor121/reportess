document.addEventListener("DOMContentLoaded", function () {
    const notifBtn = document.getElementById("notif-btn");
    const notifDropdown = document.getElementById("notif-dropdown");
    const notifCount = document.getElementById("notif-count");
    const notifList = document.getElementById("notif-list");

    if (!notifBtn) return; // Если пользователь не вошел, ничего не делаем

    // 1. Загрузка непрочитанных уведомлений
    loadUnreadCount();
    
    // Обновляем счетчик каждые 30 секунд
    setInterval(loadUnreadCount, 30000);

    // 2. Клик по колокольчику
    notifBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        notifDropdown.classList.toggle("show");
        if (notifDropdown.classList.contains("show")) {
            loadNotifications();
        }
    });

    // 3. Закрытие при клике вне меню
    document.addEventListener("click", function () {
        notifDropdown.classList.remove("show");
    });

    // --- ФУНКЦИИ ---

    function loadUnreadCount() {
        fetch("/api/notifications/unread-count")
            .then(res => res.json())
            .then(data => {
                if (data.count > 0) {
                    notifCount.textContent = data.count;
                    notifCount.style.display = "block";
                } else {
                    notifCount.style.display = "none";
                }
            });
    }

    function loadNotifications() {
        notifList.innerHTML = '<div style="padding:10px; text-align:center;">Загрузка...</div>';
        
        fetch("/api/notifications")
            .then(res => res.json())
            .then(notifications => {
                notifList.innerHTML = "";
                if (!notifications.length) {
                    notifList.innerHTML = '<div style="padding:15px; text-align:center; color:#888;">Нет уведомлений</div>';
                    return;
                }

                notifications.forEach(notif => {
                    const div = document.createElement("div");
                    div.className = `notif-item ${notif.is_read ? 'read' : ''}`;
                    
                    // Иконка в зависимости от типа
                    let icon = "🔔";
                    if (notif.type === 'review') icon = "✅";
                    if (notif.type === 'upload') icon = "📄";

                    let link = notif.report_id ? `/reports` : "#";
                    
                    div.innerHTML = `
                        <div class="notif-icon">${icon}</div>
                        <div class="notif-content">
                            <div class="notif-title">${escapeHtml(notif.title)}</div>
                            <div class="notif-text">${escapeHtml(notif.message)}</div>
                            <div class="notif-time">${formatTimeAgo(notif.created_at)}</div>
                        </div>
                    `;

                    // Клик по уведомлению помечает его как прочитанное и перенаправляет
                    div.addEventListener("click", function() {
                        if (!notif.is_read) {
                            markAsRead(notif.id);
                        }
                        if (notif.report_id) {
                            window.location.href = link;
                        }
                    });

                    notifList.appendChild(div);
                });
            });
    }

    function markAsRead(id) {
        fetch(`/api/notifications/${id}/read`, { method: "POST" });
        loadUnreadCount();
    }

    // Вспомогательная: форматирование времени (например, "5 мин. назад")
    function formatTimeAgo(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return "Только что";
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} мин. назад`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} ч. назад`;
        return date.toLocaleDateString();
    }

    function escapeHtml(text) {
        if (!text) return "";
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
});