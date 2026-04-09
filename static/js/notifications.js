document.addEventListener("DOMContentLoaded", function () {
    const notifBtn = document.getElementById("notif-btn");
    const notifDropdown = document.getElementById("notif-dropdown");
    const notifCount = document.getElementById("notif-count");
    const notifList = document.getElementById("notif-list");
    const clearBtn = document.getElementById("clear-notif-btn");

    if (!notifBtn) return;

    // 1. Загрузка счетчика
    loadUnreadCount();
    setInterval(loadUnreadCount, 30000);

    // 2. Открытие/закрытие
    notifBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const isOpen = notifDropdown.classList.contains("show");
        
        if (isOpen) {
            notifDropdown.classList.remove("show");
        } else {
            notifDropdown.classList.add("show");
            loadNotifications(); // Загружаем список при открытии
        }
    });

    document.addEventListener("click", function () {
        notifDropdown.classList.remove("show");
    });

    // 3. Кнопка "Очистить все"
    // Кнопка "Очистить все"
    if (clearBtn) {
        clearBtn.addEventListener("click", function() {
            if (!confirm("Удалить все уведомления?")) return;
            
            fetch("/api/notifications/delete-all", { 
                method: "POST"
            })
            .then(res => res.ok ? res.json() : Promise.reject("Ошибка"))
            .then(() => {
                loadNotifications();
                loadUnreadCount();
            })
            .catch(err => {
                console.error("Ошибка очистки:", err);
                alert("Не удалось очистить уведомления");
            });
        });
    }

    // --- Функции ---

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
        if (!notifList) return;
        notifList.innerHTML = '<div style="padding:15px; text-align:center; color:#888;">Загрузка...</div>';
        
        fetch("/api/notifications")
            .then(res => res.json())
            .then(notifications => {
                notifList.innerHTML = "";
                if (!notifications.length) {
                    notifList.innerHTML = '<div style="padding:15px; text-align:center; color:var(--text-muted); font-size:0.9rem;">Нет уведомлений</div>';
                    return;
                }

                notifications.forEach(notif => {
                    const div = document.createElement("div");
                    div.className = `notif-item ${notif.is_read ? 'read' : ''}`;
                    
                    let icon = "🔔";
                    if (notif.type === 'review') icon = "✅";
                    if (notif.type === 'upload') icon = "📄";

                    div.innerHTML = `
                        <div class="notif-icon">${icon}</div>
                        <div class="notif-content">
                            <div class="notif-title">${escapeHtml(notif.title)}</div>
                            <div class="notif-text">${escapeHtml(notif.message)}</div>
                            <div class="notif-time">${formatTimeAgo(notif.created_at)}</div>
                        </div>
                    `;

                    div.addEventListener("click", function() {
                        if (!notif.is_read) markAsRead(notif.id);
                        if (notif.report_id) window.location.href = '/reports?open_report=' + notif.report_id;
                    });

                    notifList.appendChild(div);
                });
            })
            .catch(() => {
                notifList.innerHTML = '<div style="padding:15px; text-align:center; color:#888;">Ошибка загрузки</div>';
            });
    }

    function markAsRead(id) {
        fetch(`/api/notifications/${id}/read`, { method: "POST" });
        loadUnreadCount();
    }

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