# Hướng dẫn sử dụng chi tiết

## Cài local AI trong ứng dụng

Từ SyncCut 0.2.1, nhấn **Set up local AI first** hoặc **Set up AI**. Chọn **Fast · Recommended** cho RTX 3060 12 GB rồi nhấn **Install Fast runtime**. Ứng dụng tự tìm Python, dùng FFmpeg đi kèm, cài package/model và kiểm tra CUDA/media tools.

Nếu Python hiện **Action needed**, nhấn **Get Python for Windows**, cài Python 3.12 x64 rồi **Check computer again**. Có thể hủy và chạy lại để tiếp tục file model đã tải. Xem [hướng dẫn cài lần đầu](https://pecora31.github.io/SyncCut/vi/first-run/) cho từng bước.

## 1. Chuẩn bị dữ liệu

Đặt voiceover, script và footage vào các thư mục ổn định. Không đổi tên hoặc di chuyển source sau khi đã import. Script nên là UTF-8; voiceover tiếng Anh nên có chất lượng rõ, ít nhạc nền.

## 2. Tạo project

Mỗi job nên có một project riêng. Chọn thư mục project có đủ dung lượng cho cache và kết quả phân tích. Có thể sao lưu cả thư mục project sau khi hoàn tất.

## 3. Phân tích voiceover và script

Import hai tệp, xác nhận ngôn ngữ English, rồi chạy **Transcribe & align**. Mở từng đoạn có confidence thấp để nghe lại. Nếu câu đọc khác script, sửa script hoặc đánh dấu ngoại lệ trước khi tìm cảnh.

## 4. Tìm cảnh

Import nhiều footage cùng lúc nếu cần. Chạy **Find scenes**, sau đó duyệt candidate theo evidence frame, visual brief và điểm phù hợp. Giữ lại các cảnh đúng ngữ cảnh; loại cảnh trùng, mờ, sai chủ thể hoặc không đủ thời lượng.

## 5. Dựng và xuất timeline

Chọn candidate cho từng đoạn lời, kiểm tra nhịp cắt và các khoảng trống. Dùng **Rebuild timeline** sau khi thay đổi lựa chọn, rồi **Lock** khi đã duyệt. Xuất video preview và XML/edit package; trong Premiere Pro hãy relink về thư mục footage gốc.

## 6. Tài nguyên máy

Máy 32 GB RAM và RTX 3060 12 GB phù hợp với profile Fast khi vừa chạy ứng dụng khác. Profile Quality cần nhiều VRAM và thời gian hơn; nên dùng khi máy rảnh. Có thể Pause job trước khi chơi game hoặc dựng Premiere.

## 7. Khi có lỗi

Kiểm tra runtime trước, sau đó xem Jobs và log. Với lỗi CUDA/VRAM, chuyển sang Fast, giảm worker và đóng ứng dụng GPU nặng. Với lỗi export hoặc media offline, giữ nguyên source path và relink trong Premiere.

Xem [trang xử lý lỗi đầy đủ](https://pecora31.github.io/SyncCut/vi/troubleshooting/) để biết từng bước chẩn đoán.
