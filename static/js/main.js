function formatDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatStatus(status) {
    const map = { pending: "На проверке", approved: "Принят", rejected: "Возвращён" };
    return map[status] || status;
}

function statusClass(status) {
    return `status-${status}`;
}

function showNotification(message, type = "info") {
    const container = document.querySelector(".container") || document.body;
    const alert = document.createElement("div");
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    container.prepend(alert);
    setTimeout(() => { alert.remove(); }, 4000);
}