document.addEventListener("DOMContentLoaded", async function() {
    console.log("📝 Upload page loaded");

    const form = document.getElementById("upload-form");
    const submitBtn = document.getElementById("submit-btn");
    const fileInput = document.getElementById("file");

    if (!form) {
        console.error("❌ Форма #upload-form не найдена!");
        return;
    }

    // === ЗАГРУЗКА ДАННЫХ ПОСЛЕДОВАТЕЛЬНО (чтобы не перегружать сокеты) ===
    
    async function loadSelectData(url, elementId, valueField, textField, placeholder) {
        try {
            console.log(`⏳ Загрузка ${elementId}...`);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            console.log(`✅ Загружено ${data.length} элементов для ${elementId}`);
            
            const select = document.getElementById(elementId);
            if (select) {
                select.innerHTML = `<option value="">${placeholder}</option>`;
                data.forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item[valueField];
                    opt.textContent = item[textField];
                    select.appendChild(opt);
                });
            }
        } catch (err) {
            console.error(`❌ Ошибка загрузки ${elementId}:`, err.message);
            const select = document.getElementById(elementId);
            if (select) select.innerHTML = `<option value="">Ошибка загрузки</option>`;
        }
        
        // Небольшая пауза между запросами (чтобы не перегружать сокеты)
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Загружаем данные последовательно
    await loadSelectData('/api/report-templates', 'report-template', 'title', 'title', 'Выберите название отчёта');
    await loadSelectData('/api/subjects', 'subject', 'id', 'name', 'Выберите предмет');
    await loadSelectData('/api/practice-types', 'practice_type', 'name', 'name', 'Выберите тип');

    console.log("✅ Все списки загружены");

    // === ОБРАБОТЧИК ОТПРАВКИ ФОРМЫ ===
    form.addEventListener("submit", function(e) {
        e.preventDefault();
        console.log("🚀 Отправка формы...");

        if (!fileInput.files.length) {
            alert("Выберите файл для загрузки");
            return;
        }

        const formData = new FormData(form);
        
        // Логируем что отправляем
        console.log("📦 Отправляемые данные:");
        for (let [key, value] of formData.entries()) {
            if (key === 'file') {
                console.log(`  file: ${value.name} (${(value.size/1024).toFixed(1)} KB)`);
            } else {
                console.log(`  ${key}:`, value);
            }
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Загрузка...";
        }

        fetch("/api/upload", {
            method: "POST",
            body: formData
        })
        .then(async response => {
            console.log("📥 Ответ сервера:", response.status, response.statusText);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            
            return response.json();
        })
        .then(data => {
            console.log("✅ Успешно загружено:", data);
            alert("Отчёт успешно загружен!");
            form.reset();
            // Возвращаем select'ы в исходное состояние
            document.getElementById('report-template').innerHTML = '<option value="">Выберите название отчёта</option>';
            document.getElementById('subject').innerHTML = '<option value="">Выберите предмет</option>';
            document.getElementById('practice_type').innerHTML = '<option value="">Выберите тип</option>';
            // Перезагружаем списки
            location.reload();
        })
        .catch(error => {
            console.error("❌ Ошибка загрузки:", error);
            alert("Ошибка: " + error.message);
        })
        .finally(() => {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Загрузить отчёт";
            }
        });
    });

    // Лог выбора файла
    if (fileInput) {
        fileInput.addEventListener("change", function() {
            if (this.files.length) {
                const file = this.files[0];
                const size = (file.size / 1024 / 1024).toFixed(2);
                console.log(`📁 Выбран файл: ${file.name} (${size} MB)`);
            }
        });
    }
});