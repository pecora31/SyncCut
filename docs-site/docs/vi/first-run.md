# Cài đặt lần đầu

## 1. Cài editor

Tải `SyncCut_0.2.0_x64-setup.exe` hoặc MSI từ trang Releases. Installer chỉ chứa ứng dụng, engine và script; không tự tải model AI.

## 2. Chuẩn bị runtime

Trên máy khách, cài NVIDIA driver và CPython 3.11/3.12 x64. Giải nén runtime kit hoặc lấy thư mục `engine` đi kèm release. Mở PowerShell trong thư mục đó:

```powershell
.\setup-runtime.ps1 `
  -RuntimeRoot 'D:\SyncCutRuntime' `
  -PythonExe 'C:\Python312\python.exe' `
  -MediaBin 'D:\Tools\ffmpeg\bin' `
  -Profile fast
```

`-Profile fast` cài bộ nhẹ hơn. Dùng `-Profile both` nếu muốn có cả Quality; thêm `-WithTextIndex` để cài BGE cho việc tìm caption đã cache. Script cài package và model bằng revision cố định, tạo marker SHA-256 và có thể chạy lại để tiếp tục.

!!! danger "Không di chuyển virtual environment"
    Runtime là venv gắn với bản Python đã dùng để tạo. Không copy nguyên thư mục sang máy khác. Nếu đổi máy, chạy setup lại.

## 3. Kiểm tra runtime

```powershell
.\customer-check.ps1 -RuntimeRoot 'D:\SyncCutRuntime' -Profile fast
```

Lệnh này kiểm tra package, CUDA, FFmpeg/FFprobe, marker và hash model rồi chạy các contract test nhẹ. Nó không đánh giá chất lượng nhận dạng hoặc độ chính xác cảnh.

## 4. Chọn runtime trong app

Mở SyncCut → **Runtime** → **Choose runtime folder** → chọn `D:\SyncCutRuntime`. Các dòng `Python`, `FFmpeg / FFprobe` và model cần hiện `Found`/`Installed`.

Nếu model hiển thị `Missing`:

1. Đóng các job đang chạy.
2. Chạy lại `manage_models.py verify` để biết file nào thiếu.
3. Chạy lại setup với đúng profile.
4. Nhấn **Refresh** trong cửa sổ Runtime.

## 5. Project đầu tiên

Chọn thư mục riêng cho project. SyncCut tạo `.synccut/project.sqlite`, cache và log trong đó. Không đặt project trong thư mục tạm hoặc thư mục đồng bộ đám mây khi đang xử lý; SQLite/WAL cần filesystem ổn định.

Hãy bắt đầu bằng voiceover 1–3 phút, một script rõ ràng và 3–5 footage trước khi chạy project lớn. Đọc [Tạo project và import nguồn](sources.md) để tránh gán nhầm role.
