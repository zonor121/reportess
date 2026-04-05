document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("upload-form");
    const progressBar = document.getElementById("upload-progress");
    const progressFill = progressBar ? progressBar.querySelector(".progress-fill") : null;
    const submitBtn = document.getElementById("submit-btn");
    const uploadContainer = document.querySelector('.upload-container');
    const clearDraftBtn = document.getElementById("clear-draft-btn");
    
    // Ключ для localStorage
    const DRAFT_KEY = 'report_draft_data';
    // Поля, которые нужно сохранять
    const draftFields = ['title', 'practice_type', 'practice_start', 'practice_end', 'description'];

    if (!form || !submitBtn) return;

    // 1. Загружаем черновик при открытии страницы
    loadDraft();

    // 2. Слушаем изменения во всех полях и сохраняем черновик
    draftFields.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            // Для текстовых полей сохраняем при каждом вводе
            element.addEventListener('input', saveDraft); 
            // Для выпадающих списков и дат сохраняем при выборе
            element.addEventListener('change', saveDraft); 
        }
    });

    // 3. Кнопка очистки черновика
    if (clearDraftBtn) {
        clearDraftBtn.addEventListener('click', function() {
            if (confirm('Вы уверены? Черновик будет удален.')) {
                localStorage.removeItem(DRAFT_KEY);
                draftFields.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = ''; // Очищаем поля
                });
                showNotification("Черновик очищен", "info");
            }
        });
    }

    // 4. Обработка отправки формы
    form.addEventListener("submit", function (e) {
        e.preventDefault();
        e.stopPropagation();

        const title = document.getElementById("title").value.trim();
        const practiceType = document.getElementById("practice_type").value;
        const practiceStart = document.getElementById("practice_start").value;
        const practiceEnd = document.getElementById("practice_end").value;
        const fileInput = document.getElementById("file");

        // Валидация
        if (!title) { showNotification("Введите название отчёта", "danger"); return; }
        if (!practiceType) { showNotification("Выберите тип практики", "danger"); return; }
        if (!practiceStart || !practiceEnd) { showNotification("Укажите даты практики", "danger"); return; }
        if (new Date(practiceStart) > new Date(practiceEnd)) { showNotification("Дата окончания должна быть позже начала", "danger"); return; }
        if (!fileInput.files || fileInput.files.length === 0) { showNotification("Выберите файл", "danger"); return; }

        const ext = fileInput.files[0].name.split('.').pop().toLowerCase();
        const allowedExts = ['pdf', 'doc', 'docx', 'odt', 'txt', 'zip', 'rar'];
        if (!allowedExts.includes(ext)) {
            showNotification("Недопустимый формат файла", "danger");
            return;
        }

        uploadReport();
    });

    function uploadReport() {
        const formData = new FormData(form);
        
        submitBtn.disabled = true;
        submitBtn.textContent = "Загрузка...";
        if (progressBar) progressBar.style.display = "block";
        if (progressFill) progressFill.style.width = "0%";

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", function (e) {
            if (e.lengthComputable && progressFill) {
                const percent = Math.round((e.loaded / e.total) * 100);
                progressFill.style.width = percent + "%";
            }
        });

        xhr.addEventListener("load", function () {
            submitBtn.disabled = false;
            submitBtn.textContent = "Загрузить отчёт";
            if (progressBar) progressBar.style.display = "none";
            if (progressFill) progressFill.style.width = "0%";

            if (xhr.status === 201) {
                // УСПЕХ!
                form.style.display = "none"; // Скрываем форму
                
                // ВАЖНО: Удаляем черновик, так как отчет ушел
                localStorage.removeItem(DRAFT_KEY); 
                
                // Показываем сообщение
                const successDiv = document.createElement("div");
                successDiv.className = "success-message";
                successDiv.innerHTML = `
                    <div style="text-align: center; padding: 2rem 0;">
                        <div style="font-size: 4rem; margin-bottom: 1rem;">✅</div>
                        <h3 style="color: #2d6a4f; margin-bottom: 0.5rem;">Отчёт успешно загружен!</h3>
                        <p style="color: #666;">Перенаправляем...</p>
                    </div>
                `;
                uploadContainer.appendChild(successDiv);

                setTimeout(() => { window.location.href = "/reports"; }, 2000);

            } else {
                let errorMsg = "Ошибка при загрузке";
                try {
                    const resp = JSON.parse(xhr.responseText);
                    if (resp.error) errorMsg = resp.error;
                } catch (err) {}
                showNotification(errorMsg, "danger");
            }
        });

        xhr.addEventListener("error", function () {
            submitBtn.disabled = false;
            submitBtn.textContent = "Загрузить отчёт";
            if (progressBar) progressBar.style.display = "none";
            showNotification("Ошибка сети", "danger");
        });

        xhr.open("POST", "/api/upload");
        xhr.send(formData);
    }

    // === ФУНКЦИИ ДЛЯ ЧЕРНОВИКОВ ===

    function saveDraft() {
        const data = {};
        draftFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) data[id] = el.value;
        });
        localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    }

    function loadDraft() {
        const savedData = localStorage.getItem(DRAFT_KEY);
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                let hasData = false;
                draftFields.forEach(id => {
                    const el = document.getElementById(id);
                    if (el && data[id]) {
                        el.value = data[id];
                        hasData = true;
                    }
                });
                
                if (hasData) {
                    // Если черновик найден, показываем кнопку очистки
                    if (clearDraftBtn) clearDraftBtn.style.display = "inline-block";
                    showNotification("Черновик восстановлен", "info");
                }
            } catch (e) {
                console.error("Ошибка чтения черновика", e);
            }
        }
    }
});