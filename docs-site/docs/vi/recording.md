# Kiểm tra voiceover và script

## Chạy phân tích

Trong Sources, bảo đảm Voiceover và Script đã chọn rồi nhấn **Check recording**. Job chạy nền; footer hiển thị stage, message, progress và nút Pause/Cancel. Không đổi input trong khi job đang chạy.

ASR nghe nội dung thật của voiceover. Acoustic CTC alignment kiểm tra boundary từ trong audio. Script chỉ dùng để đối chiếu, không được dùng để phát minh timestamp.

## Đọc passage

Chọn passage trong danh sách. Double-click passage để đưa playhead tới thời điểm bắt đầu. Editor hiển thị:

- **Script**: câu trong file script;
- **Recorded**: câu thực tế ASR nghe được;
- **Start/End**: boundary giây;
- **Issue**: lý do cần review.

Các lỗi thường gặp:

- `Not found in the recording`: câu script không xuất hiện trong take;
- `Recording differs...`: từ đọc khác script, tên riêng hoặc số bị nhận dạng khác;
- `Overlapping speech mapping`: hai passage dùng chung khoảng audio;
- boundary thiếu: ASR không có đủ bằng chứng.

## Cách xử lý

Nếu Recorded đúng và boundary hợp lý, sửa text/start/end nếu cần rồi nhấn **Use reviewed passage**. Nếu passage là take thừa hoặc không cần ghép hình, nhấn **Exclude**. Khi exclude, audio gốc vẫn giữ nguyên và timeline có thể có khoảng tương ứng.

Không cố ép một câu script vào audio chỉ để hết màu `review`. Nếu người đọc đổi câu, hãy sửa script passage theo lời đọc thực tế hoặc ghi chú để biên tập kiểm tra.

## Chất lượng nên kiểm tra thủ công

Nghe ít nhất đầu, giữa và cuối voiceover; kiểm tra tên người, thương hiệu, số, acronym, từ đọc nhanh và chỗ ngắt câu. Model tiếng Anh được ưu tiên nhưng accent, nhiễu nền, nhạc và hai người nói chồng nhau vẫn cần người duyệt.

## Khi Find scenes bị khóa

Nếu còn passage `review`, không có voice/script, hoặc chưa chọn footage, nút Find scenes bị disable. Đây là chủ ý để tránh tạo timeline trên timing chưa đáng tin.
