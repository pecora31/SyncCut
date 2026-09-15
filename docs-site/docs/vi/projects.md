# Quản lý project và cache

## Cấu trúc thư mục

```text
My Project/
├─ .synccut/project.sqlite
├─ .synccut/cache/       # probe, audio, shots, vectors, reasoning
└─ .synccut/jobs/<id>/   # request, result, worker.log, export checkpoint
```

SQLite lưu project document, assets, beats, scenes, matches, clips, settings và revision. Cache có thể tạo lại từ source; project database không nên xóa nếu muốn giữ công việc.

## Sao lưu

Đóng job trước khi sao lưu. Sao chép cả `.synccut/project.sqlite` và source_manifest/export folder nếu cần chuyển cho editor khác. Source media không được copy tự động vào project.

## Đổi tên/di chuyển source

Không đổi tên hoặc di chuyển source giữa Recording và Export. SyncCut fingerprint nội dung; nếu file mất hoặc đổi, stage sau sẽ yêu cầu import/recheck. Với thư mục mạng/UNC, dùng đường dẫn ổn định và kiểm tra Preview.

## Cache

Cache giúp Resume và tìm lại nhanh. Không xóa cache khi job đang chạy. Khi cần giải phóng dung lượng:

1. Đóng SyncCut và Premiere đang dùng export.
2. Sao lưu project database.
3. Xóa riêng `.synccut/cache` nếu chấp nhận chạy lại phân tích.
4. Giữ `.synccut/jobs` và export cho đến khi đã nghiệm thu.

## Revision conflict

Nếu thấy `Project changed in another window`, dừng chỉnh sửa ở cửa sổ hiện tại và nhấn **Reload saved project**. Không tiếp tục click Save liên tục; revision CAS đang bảo vệ thay đổi đã lưu.
