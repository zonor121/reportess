import os
import uuid
import datetime
import secrets
import io

import pandas as pd
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify, send_file
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from supabase import create_client, Client
from functools import wraps
from dotenv import load_dotenv

load_dotenv()

# ==========================================
# ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
# ==========================================
app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY")
if not app.config["SECRET_KEY"]:
    app.config["SECRET_KEY"] = secrets.token_hex(32)

app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
SUPABASE_BUCKET = "reports"

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("❌ ОШИБКА: В файле .env не указаны SUPABASE_URL или SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

ALLOWED_EXTENSIONS = {"pdf", "doc", "docx", "odt", "txt", "zip", "rar"}

# ==========================================
# ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ ШАБЛОНОВ
# ==========================================
@app.template_global('statusClass')
def get_status_class(status):
    classes = {
        'pending': 'status-pending',
        'approved': 'status-approved',
        'rejected': 'status-rejected'
    }
    return classes.get(status, 'status-pending')

@app.template_global('formatStatus')
def get_status_text(status):
    statuses = {
        'pending': 'На проверке',
        'approved': 'Принят',
        'rejected': 'Возвращён'
    }
    return statuses.get(status, status)

# ==========================================
# ХЕЛПЕРЫ
# ==========================================
def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            flash("Пожалуйста, авторизуйтесь.", "warning")
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated

def teacher_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            flash("Пожалуйста, авторизуйтесь.", "warning")
            return redirect(url_for("login"))
        if session.get("role") != "teacher":
            flash("Доступ запрещён.", "danger")
            return redirect(url_for("index"))
        return f(*args, **kwargs)
    return decorated

def create_notification(user_id, title, message, type="info", report_id=None, sender_id=None):
    try:
        supabase.table("notifications").insert({
            "user_id": user_id,
            "sender_id": sender_id,
            "title": title,
            "message": message,
            "type": type,
            "report_id": report_id,
            "is_read": False
        }).execute()
    except Exception as e:
        print(f"Ошибка создания уведомления: {e}")

# ==========================================
# DB ФУНКЦИИ
# ==========================================
def get_user_by_email(email: str):
    result = supabase.table("users").select("*").eq("email", email).execute()
    if result.data:
        return result.data[0]
    return None

def create_user(email: str, password_hash: str, full_name: str):
    result = supabase.table("users").insert({
        "email": email,
        "password_hash": password_hash,
        "full_name": full_name,
        "role": "student",
    }).execute()
    return result.data[0] if result.data else None

def create_report(title, description, file_name, file_path, student_id, practice_type, practice_start, practice_end, subject_id=None):
    result = supabase.table("reports").insert({
        "title": title,
        "description": description,
        "file_name": file_name,
        "file_path": file_path,
        "student_id": student_id,
        "practice_type": practice_type,
        "practice_start": practice_start,
        "practice_end": practice_end,
        "subject_id": subject_id,
    }).execute()
    return result.data[0] if result.data else None

def get_reports_for_student(student_id: str):
    result = supabase.table("reports").select("*, users!inner(full_name, email), subjects(name)").eq("student_id", student_id).order("uploaded_at", desc=True).execute()
    return result.data if result.data else []

def get_all_reports():
    result = supabase.table("reports").select("*, users!inner(full_name, email), subjects(name)").order("uploaded_at", desc=True).execute()
    return result.data if result.data else []

def get_report_by_id(report_id: str):
    result = supabase.table("reports").select("*, users!inner(full_name, email), subjects(name)").eq("id", report_id).execute()
    if result.data:
        return result.data[0]
    return None

def update_report_status(report_id: str, status: str, grade: str, feedback: str):
    result = supabase.table("reports").update({
        "status": status,
        "grade": grade,
        "feedback": feedback,
        "reviewed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }).eq("id", report_id).execute()
    return result.data[0] if result.data else None

# ==========================================
# МАРШРУТЫ
# ==========================================
@app.route("/")
def index():
    if "user_id" in session:
        return redirect(url_for("dashboard"))
    return redirect(url_for("login"))

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        user = get_user_by_email(email)
        if user and check_password_hash(user["password_hash"], password):
            session["user_id"] = user["id"]
            session["email"] = user["email"]
            session["full_name"] = user["full_name"]
            session["role"] = user["role"]
            flash("Вы успешно вошли!", "success")
            return redirect(url_for("dashboard"))
        else:
            flash("Неверный email или пароль.", "danger")
    return render_template("login.html")

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")
        full_name = request.form.get("full_name", "").strip()

        if not email or not password or not full_name:
            flash("Заполните все поля.", "danger")
            return render_template("register.html")
        if password != confirm_password:
            flash("Пароли не совпадают.", "danger")
            return render_template("register.html")
        if len(password) < 6:
            flash("Пароль должен быть не менее 6 символов.", "danger")
            return render_template("register.html")

        existing = get_user_by_email(email)
        if existing:
            flash("Пользователь с таким email уже существует.", "danger")
            return render_template("register.html")

        password_hash = generate_password_hash(password)
        user = create_user(email, password_hash, full_name)
        if user:
            flash("Регистрация успешна! Войдите в систему.", "success")
            return redirect(url_for("login"))
        else:
            flash("Ошибка при регистрации.", "danger")
    return render_template("register.html")

@app.route("/logout")
def logout():
    session.clear()
    flash("Вы вышли из системы.", "info")
    return redirect(url_for("login"))

@app.route("/dashboard")
@login_required
def dashboard():
    is_teacher = session.get("role") == "teacher"
    stats = {}
    students_list = []
    selected_student_id = request.args.get("student_id")

    if is_teacher:
        students = supabase.table("users").select("id, full_name, email").eq("role", "student").execute()
        students_list = students.data if students.data else []

        query = supabase.table("reports").select("*, users(full_name, email)")
        if selected_student_id:
            query = query.eq("student_id", selected_student_id)
        
        all_reports = query.order("uploaded_at", desc=True).execute().data or []
        
        pending_count = len([r for r in all_reports if r.get("status") == "pending"])
        approved_count = len([r for r in all_reports if r.get("status") == "approved"])
        rejected_count = len([r for r in all_reports if r.get("status") == "rejected"])
        unique_students = len(set(r["student_id"] for r in all_reports))
        recent_reports = all_reports[:5]

        stats = {
            "total": len(all_reports),
            "pending": pending_count,
            "approved": approved_count,
            "rejected": rejected_count,
            "students": unique_students,
            "recent": recent_reports
        }
    else:
        my_reports = supabase.table("reports").select("*").eq("student_id", session["user_id"]).order("uploaded_at", desc=True).execute().data or []
        stats = {
            "total": len(my_reports),
            "pending": len([r for r in my_reports if r.get("status") == "pending"]),
            "approved": len([r for r in my_reports if r.get("status") == "approved"]),
            "rejected": len([r for r in my_reports if r.get("status") == "rejected"]),
            "recent": my_reports[:5]
        }

    return render_template("dashboard.html", 
                         is_teacher=is_teacher, 
                         stats=stats, 
                         students_list=students_list,
                         selected_student_id=selected_student_id)

@app.route("/reports")
@login_required
def reports():
    is_teacher = session.get("role") == "teacher"
    return render_template("reports.html", is_teacher=is_teacher)

@app.route("/upload", methods=["GET"])
@login_required
def upload_page():
    if session.get("role") == "teacher":
        flash("Преподаватели не загружают отчёты.", "warning")
        return redirect(url_for("dashboard"))
    return render_template("upload.html")

# Добавь эти функции если их нет (или обнови существующие)
@app.route("/api/report-templates", methods=["GET"])
@login_required
def api_get_report_templates():
    try:
        result = supabase.table("report_templates").select("id, title").eq("is_active", True).order("title").execute()
        return jsonify(result.data if result.data else [])
    except Exception as e:
        print(f"Ошибка загрузки шаблонов: {e}")
        return jsonify([]), 200

@app.route("/api/practice-types", methods=["GET"])
@login_required
def api_get_practice_types():
    try:
        result = supabase.table("practice_types").select("id, name").eq("is_active", True).order("name").execute()
        return jsonify(result.data if result.data else [])
    except Exception as e:
        print(f"Ошибка загрузки типов практик: {e}")
        return jsonify([]), 200

# ==========================================
# API ПРЕДМЕТОВ (с обработкой ошибок)
# ==========================================
@app.route("/api/subjects", methods=["GET"])
@login_required
def api_get_subjects():
    try:
        result = supabase.table("subjects").select("id, name").eq("is_active", True).order("name").execute()
        return jsonify(result.data if result.data else [])
    except Exception as e:
        print(f"Ошибка загрузки предметов: {e}")
        return jsonify([]), 200  # Возвращаем пустой список вместо ошибки

@app.route("/api/subjects", methods=["POST"])
@teacher_required
def api_add_subject():
    try:
        data = request.get_json()
        name = data.get("name", "").strip()
        if not name:
            return jsonify({"error": "Введите название"}), 400
        result = supabase.table("subjects").insert({"name": name}).execute()
        return jsonify(result.data[0] if result.data else {}), 201
    except Exception as e:
        print(f"Ошибка добавления предмета: {e}")
        return jsonify({"error": "Такой предмет уже существует или ошибка БД"}), 400

@app.route("/api/subjects/<subject_id>", methods=["DELETE"])
@teacher_required
def api_delete_subject(subject_id):
    try:
        supabase.table("subjects").delete().eq("id", subject_id).execute()
        return jsonify({"message": "OK"})
    except Exception as e:
        print(f"Ошибка удаления предмета: {e}")
        return jsonify({"error": "Ошибка удаления"}), 500
# ==========================================
# API УВЕДОМЛЕНИЙ
# ==========================================
@app.route("/api/notifications", methods=["GET"])
@login_required
def get_notifications():
    result = supabase.table("notifications") \
        .select("*") \
        .eq("user_id", session["user_id"]) \
        .order("created_at", desc=True) \
        .limit(10) \
        .execute()
    return jsonify(result.data if result.data else [])

@app.route("/api/notifications/unread-count", methods=["GET"])
@login_required
def get_unread_count():
    result = supabase.table("notifications") \
        .select("id", count="exact") \
        .eq("user_id", session["user_id"]) \
        .eq("is_read", False) \
        .execute()
    return jsonify({"count": result.count})

@app.route("/api/notifications/<notification_id>/read", methods=["POST"])
@login_required
def mark_notification_read(notification_id):
    supabase.table("notifications").update({"is_read": True}).eq("id", notification_id).execute()
    return jsonify({"message": "OK"})

@app.route("/api/notifications/read-all", methods=["POST"])
@login_required
def mark_all_read():
    supabase.table("notifications").update({"is_read": True}).eq("user_id", session["user_id"]).execute()
    return jsonify({"message": "OK"})

# ==========================================
# API ОТЧЁТОВ И ЗАГРУЗКИ
# ==========================================
@app.route("/api/reports", methods=["GET"])
@login_required
def api_reports():
    is_teacher = session.get("role") == "teacher"
    subject_id = request.args.get("subject_id")
    student_id = request.args.get("student_id")

    query = supabase.table("reports").select("*, users(full_name, email), subjects(name)")

    if not is_teacher:
        query = query.eq("student_id", session["user_id"])
    elif student_id:
        query = query.eq("student_id", student_id)

    if subject_id:
        query = query.eq("subject_id", subject_id)

    result = query.order("uploaded_at", desc=True).execute()
    return jsonify(result.data if result.data else [])

@app.route("/api/upload", methods=["POST"])
@login_required
def api_upload():
    if session.get("role") == "teacher":
        return jsonify({"error": "Преподаватели не загружают отчёты"}), 403

    if "file" not in request.files:
        return jsonify({"error": "Файл не выбран"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "Файл не выбран"}), 400

    original_full_name = file.filename
    if "." not in original_full_name:
        return jsonify({"error": "Файл должен иметь расширение"}), 400

    ext = original_full_name.rsplit(".", 1)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"Недопустимый формат. Разрешены: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

    name_without_ext = original_full_name.rsplit(".", 1)[0]
    safe_name = secure_filename(name_without_ext)
    if not safe_name:
        safe_name = "report"
    original_filename = f"{safe_name}.{ext}"
    unique_filename = f"{uuid.uuid4().hex}.{ext}"

    title = request.form.get("title", "").strip()
    description = request.form.get("description", "").strip()
    practice_type = request.form.get("practice_type", "").strip()
    practice_start = request.form.get("practice_start", "").strip()
    practice_end = request.form.get("practice_end", "").strip()
    subject_id = request.form.get("subject_id", "").strip() or None

    if not title or not practice_type or not practice_start or not practice_end:
        return jsonify({"error": "Заполните обязательные поля"}), 400

    try:
        file_content = file.read()
        supabase.storage.from_(SUPABASE_BUCKET).upload(unique_filename, file_content)
    except Exception as e:
        print(f"❌ Ошибка Storage: {e}")
        return jsonify({"error": "Ошибка загрузки файла"}), 500

    report = create_report(
        title=title,
        description=description,
        file_name=original_filename,
        file_path=unique_filename,
        student_id=session["user_id"],
        practice_type=practice_type,
        practice_start=practice_start,
        practice_end=practice_end,
        subject_id=subject_id,
    )

    if report:
        # === УВЕДОМЛЕНИЕ: Студент загрузил работу ===
        teachers = supabase.table("users").select("id").eq("role", "teacher").execute()
        if teachers.data:
            for teacher in teachers.data:
                create_notification(
                    user_id=teacher["id"],
                    title="Новая работа на проверку",
                    message=f"Студент {session['full_name']} загрузил отчёт: {title}",
                    type="upload",
                    report_id=report["id"],
                    sender_id=session["user_id"]
                )
        
        return jsonify({"message": "Отчёт загружен", "report_id": report["id"]}), 201
    else:
        try:
            supabase.storage.from_(SUPABASE_BUCKET).remove([unique_filename])
        except: pass
        return jsonify({"error": "Ошибка сохранения в БД"}), 500

@app.route("/api/reports/<report_id>", methods=["PUT"])
@login_required
def api_update_report(report_id):
    report = get_report_by_id(report_id)
    if not report:
        return jsonify({"error": "Отчёт не найден"}), 404
    
    if report["student_id"] != session["user_id"]:
        return jsonify({"error": "Доступ запрещён"}), 403
    
    if report["status"] != "pending":
        return jsonify({"error": "Редактирование закрыто, отчёт уже проверен"}), 400

    title = request.form.get("title", "").strip()
    description = request.form.get("description", "").strip()
    practice_type = request.form.get("practice_type", "").strip()
    practice_start = request.form.get("practice_start", "").strip()
    practice_end = request.form.get("practice_end", "").strip()
    subject_id = request.form.get("subject_id", "").strip() or None

    if not title or not practice_type:
        return jsonify({"error": "Заполните обязательные поля"}), 400

    update_data = {
        "title": title,
        "description": description,
        "practice_type": practice_type,
        "practice_start": practice_start,
        "practice_end": practice_end,
        "subject_id": subject_id,
    }

    if "file" in request.files:
        file = request.files["file"]
        if file and file.filename != "":
            original_full_name = file.filename
            ext = original_full_name.rsplit(".", 1)[1].lower()
            
            old_file_path = report["file_path"]
            try:
                supabase.storage.from_(SUPABASE_BUCKET).remove([old_file_path])
            except Exception as e:
                print(f"Ошибка удаления старого файла: {e}")

            safe_name = secure_filename(original_full_name.rsplit(".", 1)[0])
            unique_filename = f"{uuid.uuid4().hex}.{ext}"
            
            try:
                file_content = file.read()
                supabase.storage.from_(SUPABASE_BUCKET).upload(unique_filename, file_content)
                
                update_data["file_name"] = original_full_name
                update_data["file_path"] = unique_filename
            except Exception as e:
                print(f"Ошибка загрузки нового файла: {e}")
                return jsonify({"error": "Ошибка сохранения файла"}), 500

    result = supabase.table("reports").update(update_data).eq("id", report_id).execute()
    
    return jsonify({"message": "Отчёт обновлён", "report": result.data[0]}), 200

@app.route("/api/reports/<report_id>/review", methods=["POST"])
@teacher_required
def api_review_report(report_id):
    data = request.get_json()
    status = data.get("status", "pending")
    grade = data.get("grade", "")
    feedback = data.get("feedback", "")

    result = update_report_status(report_id, status, grade, feedback)
    if result:
        report = get_report_by_id(report_id)
        if report:
            create_notification(
                user_id=report["student_id"],
                title="Оценка выставлена",
                message=f"Ваш отчёт '{report['title']}' получил статус: {get_status_text(status)}",
                type="review",
                report_id=report_id,
                sender_id=session["user_id"]
            )
        return jsonify({"message": "Оценка сохранена"})
    return jsonify({"error": "Ошибка"}), 500

@app.route("/api/report/<report_id>/file")
@login_required
def api_report_file(report_id):
    report = get_report_by_id(report_id)
    if not report:
        return jsonify({"error": "Отчёт не найден"}), 404

    if session.get("role") != "teacher" and report.get("student_id") != session["user_id"]:
        return jsonify({"error": "Доступ запрещён"}), 403

    original_filename = report.get("file_name", "download.docx")
    file_path = report.get("file_path")
    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{file_path}"
    
    return jsonify({
        "file_url": public_url,
        "file_name": original_filename,
    })

@app.route("/api/export-excel")
@teacher_required
def export_excel():
    try:
        result = supabase.table("reports") \
            .select("*, users(full_name, email), subjects(name)") \
            .order("uploaded_at", desc=True) \
            .execute()
        
        data = result.data if result.data else []

        excel_data = []
        for report in data:
            student_info = report.get("users", {})
            subject_info = report.get("subjects", {})
            excel_data.append({
                "ФИО Студента": student_info.get("full_name", "Неизвестно"),
                "Email": student_info.get("email", "-"),
                "Предмет": subject_info.get("name", "—"),
                "Название отчёта": report.get("title"),
                "Тип практики": report.get("practice_type"),
                "Период": f"{report.get('practice_start')} — {report.get('practice_end')}",
                "Дата загрузки": str(report.get("uploaded_at", ""))[:10],
                "Статус": get_status_text(report.get("status")),
                "Оценка": report.get("grade") or "—",
                "Комментарий": report.get("feedback") or "—"
            })

        df = pd.DataFrame(excel_data)

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Отчёты")
            workbook = writer.book
            worksheet = writer.sheets["Отчёты"]
            for idx, col in enumerate(df.columns):
                max_len = max(df[col].astype(str).map(len).max(), len(col))
                width = min(max_len + 2, 50)
                worksheet.column_dimensions[chr(65 + idx)].width = width

        output.seek(0)

        return send_file(
            output,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name="Otchety_Praktiki.xlsx"
        )

    except Exception as e:
        print(f"Ошибка генерации Excel: {e}")
        return jsonify({"error": "Не удалось создать файл"}), 500

@app.route("/healthz")
def healthz():
    return "OK", 200

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)