# SyncCut Studio

SyncCut là ứng dụng desktop giúp biến một bản ghi voiceover, file kịch bản và nhiều footage thành một rough cut có thể tiếp tục chỉnh sửa trong Adobe Premiere Pro. Mọi phân tích AI chạy cục bộ trên máy đã cài runtime; project, cache và đường dẫn nguồn được lưu trong thư mục project.

## Cách SyncCut làm việc

```text
Nguồn → Recording → Scenes → Timeline → Premiere XML
```

1. **Sources**: import voiceover, script, video và image; gán đúng vai trò.
2. **Recording**: nghe voiceover, nhận diện lời nói thực tế, căn mốc từ bằng bằng chứng âm thanh và đối chiếu với script.
3. **Scenes**: phát hiện shot, lấy frame đại diện, hiểu yêu cầu hình ảnh của từng đoạn và đề xuất footage liên quan.
4. **Timeline**: duyệt đề xuất, chọn cảnh thay thế, khóa chỉnh sửa, xử lý gap và xuất media đã chuẩn hóa cùng XML.

SyncCut không tự khẳng định cảnh nào đúng tuyệt đối. Mỗi đề xuất cần được đánh giá theo frame mẫu và lý do; khi không có cảnh đủ bằng chứng, ứng dụng giữ một gap rõ ràng thay vì lấy đại footage.

## Bắt đầu nhanh

Nếu runtime đã được cài sẵn trên máy khách, quy trình tối thiểu là:

1. Mở **Runtime** và chọn thư mục runtime.
2. Nhấn **Open project**, chọn một thư mục project mới hoặc project đã có.
3. Vào **Sources → Import files**.
4. Gán **Voiceover**, **Script** và tick **Use** cho các video/image muốn phân tích.
5. Nhấn **Check recording**, duyệt tất cả đoạn có trạng thái `review`.
6. Nhấn **Find scenes**, xem frame và lý do của từng đề xuất.
7. Vào **Timeline**, khóa những cut bạn muốn giữ, xử lý gap và nhấn **Export to Premiere**.

Hướng dẫn đầy đủ nằm ở thanh bên. Nếu đây là lần đầu cài, đọc [Yêu cầu hệ thống](requirements.md), [Cài đặt lần đầu](first-run.md) và [Tạo project và import nguồn](sources.md) trước.

!!! warning "Bản ghi và script phải được duyệt"
    SyncCut không dùng độ dài ký tự để chia thời gian giả. Đoạn script thiếu trong voice, từ bị thay đổi, take lặp và ranh giới âm thanh chưa chắc chắn sẽ chặn bước tìm cảnh cho đến khi bạn sửa hoặc loại trừ.

## Liên kết

- [Tải bản phát hành](https://github.com/pecora31/SyncCut/releases)
- [Báo lỗi](https://github.com/pecora31/SyncCut/issues)
- [Mã nguồn](https://github.com/pecora31/SyncCut)
- [Hướng dẫn nghiệm thu trên máy khách](https://github.com/pecora31/SyncCut/blob/main/docs/customer-validation.md)

!!! note
    Giao diện ứng dụng hiện dùng tiếng Anh để thống nhất với model và workflow dựng phim. Wiki này dùng tiếng Việt làm ngôn ngữ chính; tên nút được giữ nguyên tiếng Anh để bạn có thể đối chiếu trực tiếp trong app.
