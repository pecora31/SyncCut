# Checkpoint, Pause và Resume

## Trạng thái job

Footer hiển thị stage (`speech`, `match`, `export`), status, message và progress. Một thời điểm chỉ có một GPU worker cho một project/runtime.

## Pause

Nhấn **Pause and release GPU**. SyncCut dừng worker process tree do app sở hữu, lưu cache đã hoàn tất và đổi trạng thái sang paused. VRAM thường giảm sau khi process thoát; ứng dụng khác có thể lấy lại GPU.

Pause không bảo đảm giữ phần đang chạy dở của một model. Nếu đang trong ASR hoặc một request Qwen chưa ghi checkpoint, phần đó có thể chạy lại khi Resume.

## Cancel

**Cancel** dừng worker và giữ project cũ chưa apply kết quả. Cache đã hoàn tất vẫn còn để chạy lại. Dùng Cancel khi input đã sai hoặc muốn đổi profile.

## Resume

Sau khi app mở lại, job đang chạy được đánh dấu `interrupted`. Nhấn **Resume from cache** sau khi runtime sẵn sàng. Speech/match dùng checkpoint theo fingerprint source, engine version, model revision và settings.

Export resume có thể tái sử dụng clip đã conform trong thư mục job/export nếu revision còn đúng. Luôn kiểm tra export folder trước khi gửi khách.

## Đóng app

Đóng cửa sổ khi worker chạy sẽ dừng process tree và lưu interrupted. Mở lại project để kiểm tra footer. Nếu máy mất điện, SQLite revision và checkpoint atomic giúp tránh document nửa chừng, nhưng một request cuối có thể cần chạy lại.

## Log

Nút **Worker log** mở log stderr của job. Khi báo lỗi, gửi log cùng engine version, profile, stage và `preflight.json`; tránh gửi script/đường dẫn nguồn nếu không được phép.
