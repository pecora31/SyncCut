# Chỉnh timeline

## Đọc timeline

Sequence hiển thị trên frame clock của FPS project. Thanh video có tên source; vùng gạch chéo là gap. Voiceover là track tham chiếu và Program monitor theo thời gian audio.

Click clip để chọn; double-click để seek tới start. Chọn passage/candidate ở panel trái không tự thay clip đã khóa.

## Các thao tác

| Thao tác | Cách dùng |
|---|---|
| Chọn cảnh thay thế | Chọn slot → chọn candidate → **Use this scene** |
| Khóa clip | **Keep and lock**; clip được giữ khi Rebuild unlocked |
| Mở khóa | **Unlock** trước khi cho planner dùng lại slot |
| Split | Đặt playhead trong clip → **Split at playhead** |
| Đổi source-in | Nhập giây mới trong inspector; phải nằm trong scene |
| Xóa media | **Clear**; kết quả là gap có lý do |
| Tạo lại phần chưa khóa | **Rebuild unlocked** |

## Gap có chủ ý

Gap xuất hiện khi không có candidate `match` đủ duration, source đã dùng hết phần hợp lệ hoặc đó là khoảng pause trong audio. Bạn có thể giữ gap để tự chèn B-roll trong Premiere, hoặc chọn alternative/cắt lại slot.

Tick **Allow empty timeline gaps** chỉ khi muốn export gap. Tùy chọn này không tự lấp gap và không thay đổi voiceover.

## Rebuild và lock

Rebuild unlocked giữ start/end/source của clip khóa và lập lại các slot còn lại. Planner là greedy có giới hạn duration và repetition, không phải tối ưu toàn cục. Sau khi rebuild, hãy xem lại toàn bộ các slot chưa khóa.

## Đổi FPS và format

Đổi FPS xóa clips vì frame clock thay đổi. Đổi format giữ kết quả phân tích nhưng export cần conform lại. Chọn 1080p, Vertical hoặc 4K tùy sequence đích; source gốc không bị crop phá hủy.

## Không nên làm

- Không kéo source-in ra ngoài scene đã xác minh.
- Không unlock rồi export ngay mà không xem gap mới.
- Không coi `suggested` là cut cuối cùng.
- Không chỉnh file SQLite bằng tay khi app đang mở.
