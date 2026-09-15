# Tổng quan 4 bước

## Sources

Đây là nơi quản lý input. Bạn có thể import nhiều footage, chọn voiceover/script và đánh dấu footage tham gia phân tích. Không có AI chạy khi chỉ import.

## Recording

**Check recording** chạy ASR tiếng Anh và acoustic alignment. Kết quả là các passage có start/end, text script, spoken text thực tế và trạng thái:

| Trạng thái | Ý nghĩa |
|---|---|
| `verified` | Script và lời đọc khớp, timing có bằng chứng |
| `review` | Có từ thiếu/thay đổi/thừa, take lặp hoặc boundary chưa chắc |
| `accepted` | Người dùng đã sửa/xác nhận passage |
| `excluded` | Bỏ mapping passage khỏi bước tìm cảnh; không xóa voiceover |

## Scenes

**Find scenes** chỉ chạy khi mọi passage cần dùng đã được xử lý. Footage được phát hiện shot và chia thành các cửa sổ có frame mẫu. SigLIP xếp hạng ứng viên; Qwen kiểm tra caption, visual brief, lý do và timestamp bằng chứng.

## Timeline

Planner tạo các clip theo frame clock của project. Clip không vượt scene/source, hạn chế lặp source và để gap nếu không có `match` đủ dài. Người dùng có thể chọn alternative, lock, split, trim source-in hoặc clear.

## Export

**Export to Premiere** tạo thư mục export riêng gồm clip H.264 đã conform, `voiceover.wav`, `source_manifest.json` và `SyncCut.xml`. XML dùng mốc frame; media gốc không bị sửa. Gap chỉ được xuất khi tick **Allow empty timeline gaps**.

## Thứ tự duyệt nên dùng

1. Duyệt passage có lỗi trước.
2. Ở Scenes, đọc visual brief rồi xem frame, không chỉ nhìn verdict.
3. Chọn cảnh thay thế cho các clip quá ngắn hoặc không hợp ngữ cảnh.
4. Lock các cut chắc chắn trước khi **Rebuild unlocked**.
5. Export một project nhỏ để kiểm tra Premiere trước project dài.
