document.addEventListener("DOMContentLoaded", function () {
    const reportsList = document.getElementById("reports-list");
    const loading = document.getElementById("reports-loading");
    const reportModal = document.getElementById("report-modal");
    const reviewModal = document.getElementById("review-modal");
    const editModal = document.getElementById("edit-modal");

    if (!reportsList) return;

    // Восстанавливаем сохраненный вид
    const savedLayout = localStorage.getItem('reportsLayout') || 'layout-3';
    applyLayout(savedLayout);

    loadReports();

    function applyLayout(layoutClass) {
        reportsList.classList.remove('layout-3', 'layout-4', 'layout-6');
        reportsList.classList.add(layoutClass);
        
        document.querySelectorAll('.layout-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('onclick').includes(layoutClass)) {
                btn.classList.add('active');
            }
        });
    }

    window.setLayout = function(layoutClass) {
        applyLayout(layoutClass);
        localStorage.setItem('reportsLayout', layoutClass);
    };

    function loadReports() {
        loading.style.display = "block";
        reportsList.style.display = "none";

        fetch("/api/reports")
            .then(res => res.ok ? res.json() : Promise.reject("Ошибка сети"))
            .then(data => {
                loading.style.display = "none";
                reportsList.style.display = (data.length > 0) ? "" : "none";

                if (!data.length) {
                    reportsList.innerHTML = '<div class="empty-state"><p>Отчётов пока нет.</p></div>';
                    return;
                }

                reportsList.innerHTML = "";
                data.forEach(report => {
                    reportsList.appendChild(createReportCard(report));
                });
            })
            .catch(err => {
                loading.style.display = "none";
                reportsList.style.display = "block";
                reportsList.innerHTML = `<div class="empty-state"><p>Ошибка загрузки: ${err}</p></div>`;
            });
    }

    function createReportCard(report) {
        const card = document.createElement("div");
        card.className = "report-card";

        const studentName = report.users?.full_name || "";
        let metaHTML = `
            <span>📅 ${formatDate(report.uploaded_at)}</span>
            <span>🏢 ${report.practice_type}</span>
            <span>📄 ${report.file_name}</span>
        `;
        if (studentName) metaHTML += `<span>👤 ${studentName}</span>`;
        if (report.grade) metaHTML += `<span>⭐ ${report.grade}</span>`;

        let actionsHTML = `<button class="btn btn-primary btn-sm" onclick="viewReport('${report.id}')">Просмотр</button>`;

        if (window.IS_TEACHER) {
            actionsHTML += `<button class="btn btn-success btn-sm" onclick="openReviewModal('${report.id}')">Оценить</button>`;
            actionsHTML += `<button class="btn btn-secondary btn-sm" onclick="downloadReport('${report.id}')">Скачать</button>`;
        } else {
            // Студент может редактировать только "На проверке"
            if (report.status === 'pending') {
                actionsHTML += `<button class="btn btn-warning btn-sm" onclick="openEditModal('${report.id}')">✏️ Изменить</button>`;
            }
        }

        let feedbackHTML = '';
        if (report.feedback && reportsList.classList.contains('layout-3')) {
            feedbackHTML = `<div class="card-feedback"><strong>Комментарий:</strong> ${escapeHtml(report.feedback)}</div>`;
        }

        card.innerHTML = `
            <div class="report-info">
                <h3>${escapeHtml(report.title)}</h3>
                <div class="report-meta">${metaHTML}<span class="status-badge ${statusClass(report.status)}">${formatStatus(report.status)}</span></div>
                ${feedbackHTML}
            </div>
            <div class="report-actions">${actionsHTML}</div>
        `;
        return card;
    }

    // === ПРОСМОТР ===
    window.viewReport = function (reportId) {
        fetch(`/api/report/${reportId}/file`)
            .then(res => res.json())
            .then(fileData => {
                return fetch("/api/reports").then(res => res.json()).then(all => {
                    const report = all.find(r => r.id === reportId);
                    if (!report) throw new Error("Отчёт не найден");
                    const studentName = report.users?.full_name || "";
                    let bodyHTML = `
                        <div class="modal-body-detail">
                            <p><strong>Тип:</strong> ${report.practice_type}</p>
                            <p><strong>Период:</strong> ${report.practice_start} — ${report.practice_end}</p>
                            ${studentName ? `<p><strong>Студент:</strong> ${studentName}</p>` : ''}
                            ${report.description ? `<p><strong>Описание:</strong><br>${escapeHtml(report.description)}</p>` : ''}
                            <p style="margin-top:1rem;"><a href="${fileData.file_url}" download="${fileData.file_name}" target="_blank" class="btn btn-primary btn-sm">📥 Скачать файл</a></p>
                            <p><strong>Статус:</strong> <span class="status-badge ${statusClass(report.status)}">${formatStatus(report.status)}</span></p>
                            ${report.grade ? `<p><strong>Оценка:</strong> ${report.grade}</p>` : ''}
                            ${report.feedback ? `<div class="feedback-box"><strong>Комментарий:</strong><br>${escapeHtml(report.feedback)}</div>` : ''}
                        </div>
                    `;
                    document.getElementById("modal-title").textContent = report.title;
                    document.getElementById("modal-body").innerHTML = bodyHTML;
                    reportModal.style.display = "flex";
                });
            })
            .catch(err => showNotification("Ошибка: " + err, "danger"));
    };

    // === СКАЧИВАНИЕ ===
    window.downloadReport = function (reportId) {
        fetch(`/api/report/${reportId}/file`)
            .then(res => res.json())
            .then(data => {
                const link = document.createElement('a');
                link.href = data.file_url;
                link.download = data.file_name;
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            })
            .catch(err => showNotification("Ошибка скачивания", "danger"));
    };

    // === ОЦЕНКА (ПРЕПОДАВАТЕЛЬ) ===
    window.openReviewModal = function (reportId) {
        document.getElementById("review-report-id").value = reportId;
        document.getElementById("review-status").value = "pending";
        document.getElementById("review-grade").value = "";
        document.getElementById("review-feedback").value = "";
        reviewModal.style.display = "flex";
    };

    document.getElementById("modal-close").onclick = () => reportModal.style.display = "none";
    document.getElementById("review-modal-close").onclick = () => reviewModal.style.display = "none";
    window.onclick = (e) => {
        if (e.target === reportModal) reportModal.style.display = "none";
        if (e.target === reviewModal) reviewModal.style.display = "none";
        if (editModal && e.target === editModal) editModal.style.display = "none";
    };

    document.getElementById("review-form").onsubmit = function (e) {
        e.preventDefault();
        const id = document.getElementById("review-report-id").value;
        const status = document.getElementById("review-status").value;
        const grade = document.getElementById("review-grade").value;
        const feedback = document.getElementById("review-feedback").value;

        fetch(`/api/reports/${id}/review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, grade, feedback }),
        })
        .then(res => res.ok ? res.json() : Promise.reject("Ошибка"))
        .then(() => {
            showNotification("Сохранено!", "success");
            reviewModal.style.display = "none";
            loadReports();
        })
        .catch(err => showNotification("Ошибка: " + err, "danger"));
    };

    // === РЕДАКТИРОВАНИЕ (СТУДЕНТ) ===
    window.openEditModal = function(reportId) {
        console.log("Открываем редактирование для:", reportId);
        if (!editModal) {
            console.error("Модальное окно редактирования не найдено в HTML!");
            return;
        }

        fetch("/api/reports")
            .then(res => res.json())
            .then(allReports => {
                const report = allReports.find(r => r.id === reportId);
                if (!report) return;

                document.getElementById("edit-report-id").value = report.id;
                document.getElementById("edit-title").value = report.title || "";
                document.getElementById("edit-practice-type").value = report.practice_type || "учебная";
                document.getElementById("edit-start").value = report.practice_start || "";
                document.getElementById("edit-end").value = report.practice_end || "";
                document.getElementById("edit-description").value = report.description || "";
                document.getElementById("edit-file").value = ""; // Сброс поля файла

                editModal.style.display = "flex";
            })
            .catch(err => console.error("Ошибка загрузки данных для редактирования:", err));
    };

    if (editModal) {
        document.getElementById("edit-form").onsubmit = function(e) {
            e.preventDefault();
            const id = document.getElementById("edit-report-id").value;
            const formData = new FormData();
            
            formData.append("title", document.getElementById("edit-title").value);
            formData.append("practice_type", document.getElementById("edit-practice-type").value);
            formData.append("practice_start", document.getElementById("edit-start").value);
            formData.append("practice_end", document.getElementById("edit-end").value);
            formData.append("description", document.getElementById("edit-description").value);
            
            const fileInput = document.getElementById("edit-file");
            if (fileInput.files.length > 0) {
                formData.append("file", fileInput.files[0]);
            }

            const submitBtn = document.getElementById("edit-submit-btn");
            submitBtn.disabled = true;
            submitBtn.textContent = "Сохранение...";

            fetch(`/api/reports/${id}`, { method: "PUT", body: formData })
            .then(res => res.ok ? res.json() : Promise.reject("Ошибка сервера"))
            .then(() => {
                showNotification("Отчёт обновлён!", "success");
                editModal.style.display = "none";
                loadReports();
            })
            .catch(err => showNotification("Ошибка: " + err, "danger"))
            .finally(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = "Сохранить изменения";
            });
        };

        document.getElementById("edit-modal-close").onclick = () => editModal.style.display = "none";
    }
});

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}