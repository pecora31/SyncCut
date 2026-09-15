# Xử lý sự cố

## Runtime không sẵn sàng

**Triệu chứng:** Runtime báo Python/FFmpeg/model Missing hoặc nút stage báo runtime incomplete.

**Cách xử lý:** kiểm tra đúng thư mục có `python/Scripts/python.exe`, `bin/ffmpeg.exe`, `bin/ffprobe.exe`, chạy `customer-check.ps1`, rồi Refresh. Model marker phải khớp revision trong `engine/models.json`.

## CUDA unavailable / thiếu VRAM

Đảm bảo driver NVIDIA hoạt động, PyTorch là CUDA wheel, không phải CPU-only. Đóng app dùng GPU, chọn Fast/Shared hoặc Pause Premiere/LOL. Không cố bỏ qua admission guard; model có thể crash giữa chừng.

## ASR nhận sai tên hoặc số

Đây là trường hợp cần review. Sửa text/boundary trong Recording nếu lời đọc đúng; nếu lời đọc khác script, giữ Recorded làm bằng chứng và quyết định accept/exclude theo nội dung thật.

## Find scenes không bật

Kiểm tra voice/script đã gán, footage đã tick Use, mọi passage cần dùng không còn `review`, và job speech đã hoàn tất. Passage excluded không được match.

## Nhiều cảnh unrelated

Đừng chọn theo similarity một mình. Xem visual brief, caption và frame. Clear/giữ gap, chọn partial hoặc thay footage. Nếu lỗi lặp, giảm shot duration, dùng source đa dạng hơn và tạo benchmark thủ công để báo issue.

## Video không preview

WebView không đọc mọi codec/professional format. Transcode bản preview sang H.264 hoặc kiểm tra FFmpeg có decode được. Export dùng clip conform H.264 nếu source hợp lệ.

## Export báo source changed

File đã đổi nội dung sau khi phân tích hoặc fingerprint không còn khớp. Giữ export cũ, import file đúng phiên bản và chạy lại Recording/Find scenes theo message.

## Premiere media offline

Giữ nguyên thư mục export, không đổi tên clip. Trong Premiere dùng Link Media tới `clip_*.mp4`; mở `source_manifest.json` để xem originalPath và clip range. Nếu muốn relink camera original, làm sau khi đã kiểm tra conformed cut.

## App bị đóng khi đang job

Mở lại project, xem job `interrupted`, đọc Worker log và Resume from cache. Không xóa `.synccut/jobs` trước khi xác định job nào cần tiếp tục.

## Báo lỗi hữu ích

Gửi version, Windows, GPU/driver, profile/resource, stage, command cuối trong log, preflight module/CUDA info và bước tái hiện. Che path/script/voiceover nếu chứa dữ liệu khách hàng.
