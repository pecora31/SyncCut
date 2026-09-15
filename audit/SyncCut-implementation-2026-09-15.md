# Báo cáo triển khai SyncCut Studio 0.2

Ngày: 15/09/2026. Mục tiêu: tiếng Anh, Windows, RAM 32 GB, RTX 3060 12 GB. Giữ React/TypeScript, Tauri/Rust và Python; bổ sung SQLite cho project/job.

## Những phần đã triển khai

| Phần | Thay đổi |
|---|---|
| Giao diện | Bốn bước Sources → Recording → Scenes → Timeline; giữ nền tối, màu trung tính, không icon, tiếng Anh. Click chọn; double-click mở nguồn; các frame gợi ý mở đúng mốc nguồn. |
| Nhập nguồn | ID theo đường dẫn tuyệt đối, phân biệt file trùng tên ở thư mục khác, gán voice/script/footage rõ ràng, hiển thị thumbnail nguồn đã chọn. |
| Xử lý giọng nói | Transcribe audio thực tế bằng faster-whisper; căn từ bằng acoustic CTC; đối chiếu script. Đoạn thiếu, thêm, thay đổi hoặc ranh giới không chắc được đưa ra duyệt. Không có fallback chia thời gian theo độ dài chữ. |
| Hiểu ngữ cảnh | Qwen tạo tóm tắt và yêu cầu hình ảnh cho từng đoạn trước khi SigLIP tìm cảnh; có ngữ cảnh lân cận. |
| Tìm và kiểm tra cảnh | Phát hiện shot, chia cửa sổ dài, lấy nhiều keyframe; SigLIP lấy top-K; Qwen mô tả độc lập rồi đánh giá bằng frame có timestamp. Không hiển thị điểm tin cậy phần trăm giả. |
| Timeline | Khung hình nguyên, FPS dạng phân số, kiểm tra giới hạn nguồn, giảm lặp nguồn; chỉ tự chọn cảnh được đánh giá match. Thiếu cảnh để thành gap. Có chọn thay thế, khóa, split, chỉnh source-in và replan phần chưa khóa. |
| Preview | Voiceover là đồng hồ của Program; video nguồn tắt tiếng trong Program. Source và Program riêng; thông báo khi codec không preview được. |
| Xuất Premiere | Conform đoạn được chọn thành H.264 theo FPS/resolution project, xác minh số frame bằng FFprobe, xuất voice WAV stereo và XML cùng source manifest. Kiểm tra hash nguồn trước xuất. |
| Job và khôi phục | Một worker cho một job, checkpoint theo nội dung/model, SQLite revision chống ghi đè. Pause/Cancel dừng cây tiến trình sở hữu. Windows Job Object giúp tránh worker bị bỏ lại khi app chết. |
| Runtime | Script cài riêng trên máy khách; repo model ghim commit, kiểm tra SHA-256; inference offline. Có Fast/Quality và Shared/Focused, không tự tải model từ editor. |
| Đóng gói | Nhánh mã 0.2.0, engine/setup/runbook được đưa vào installer. Pipeline CI tạo draft prerelease để chờ nghiệm thu máy khách. |

Các engine Python cũ và đường chạy Rust dùng kết quả giả lập đã được bỏ khỏi luồng thực thi. Một số component UI cũ vẫn nằm trong repository làm mã tham chiếu nhưng không được mount bởi App mới. Downloader được giữ, sửa dữ liệu camelCase và dùng FFmpeg của runtime được chọn.

## Bộ model thực tế trong mã

| Stage | Fast | Quality |
|---|---|---|
| ASR | distil-whisper/distil-large-v3.5-ct2 | Systran/faster-whisper-large-v3 |
| Acoustic alignment | facebook/wav2vec2-base-960h | Cùng model |
| Visual retrieval | google/siglip2-so400m-patch14-384 | Cùng model |
| Reasoning/verification | Qwen/Qwen3-VL-4B-Instruct, NF4 | Qwen/Qwen3-VL-8B-Instruct, NF4 |
| Caption retrieval tùy chọn | BAAI/bge-base-en-v1.5 trên CPU | Cùng model |

Hai điểm khác so với đề xuất kiến trúc trước:

- Alignment dùng bộ giải CTC trong engine trên acoustic model tiếng Anh; không kéo toàn bộ dependency WhisperX vào runtime.
- BGE hiện chỉ tìm trên caption đã được cache từ lượt kiểm tra trước. Lượt đầu dùng SigLIP; chưa có bước caption toàn bộ footage trước retrieval.

## Phạm vi kiểm chứng

- TypeScript và build frontend đã qua biên dịch.
- `cargo check --tests` đã qua: biên dịch cả các contract test Rust, **không chạy chúng**.
- Python được phân tích cú pháp AST; script PowerShell được kiểm tra cú pháp, không thực thi setup.
- Đường dẫn resource trong cấu hình bundle và script NSIS được đối chiếu. Bộ cài Windows được tạo bằng Tauri/NSIS; không cài hoặc mở chạy thử trên máy phát triển.
- Có 7 test Python và 6 test Rust được chuẩn bị cho máy khách. Chưa chạy inference, benchmark, test UI hoặc import XML vào Premiere trên máy này.
- Các phiên bản dependency trực tiếp đã được kiểm tra tồn tại trên PyPI. Điều này **không thay thế** việc kiểm chứng toàn bộ tổ hợp CUDA/Transformers/bitsandbytes trên RTX 3060.

## Các giới hạn cần nghiệm thu

1. Đây là bản triển khai để nghiệm thu, chưa có cơ sở gọi là “hết mọi bug” hay bảo đảm chọn cảnh đúng tuyệt đối. Cần đo trên nguồn thật của khách.
2. Planner hiện là greedy có ràng buộc, chưa phải beam search tối ưu toàn timeline.
3. Đánh giá cảnh dựa trên các frame được lấy mẫu; có thể bỏ lỡ hành động nhanh, không tự xác thực danh tính người/sản phẩm ngoài bằng chứng nhìn thấy.
4. Cách chuẩn hóa số, tên riêng và acronym thận trọng, có thể tạo thêm đoạn cần duyệt. Exclude chỉ bỏ mapping hình ảnh; chưa tự cắt take thừa khỏi voiceover.
5. Rebuild unlocked giữ clip khóa. Chạy lại Find scenes hoặc thay input/model có thể thay index/timeline và làm mất cut cũ; cần lưu bản project trước lượt phân tích khác nếu muốn giữ nhiều phương án. Chưa có undo/history UI.
6. Export là media dựng đã conform, không phải relink trực tiếp toàn bộ footage gốc; không có handles để kéo dài clip ngoài đoạn đã xuất. Cần kiểm tra Premiere round-trip thật.
7. Chưa có proxy tự động cho mọi codec nguồn; codec WebView không đọc được sẽ được báo. Chưa có preview render hoàn chỉnh để bù cho mọi giới hạn browser decoder.
8. Runtime hiện tạo venv trên máy khách, phụ thuộc Python cài tại đó; chưa là bản Python portable chuyển nguyên thư mục giữa nhiều máy.
9. Resume dùng checkpoint hoàn tất. Nếu pause trong ASR trước checkpoint hoàn chỉnh, đoạn ASR đó chạy lại. Export resume qua lần đóng/mở toàn bộ app chưa được bảo đảm tận dụng hết media dở dang.
10. Shared hạn chế workload nhưng không đặt quota GPU. Premiere/LOL vẫn có thể tranh compute và VRAM; dùng Pause khi cần ưu tiên tương tác.

## Bàn giao để chạy trên máy khách

Đọc [hướng dẫn cài và nghiệm thu](../docs/customer-validation.md), bắt đầu với Fast/Shared, sau đó mới đo Quality. Hướng dẫn có bộ case cho mismatch, filename trùng, Unicode/UNC, FPS khác nhau, nguồn ngắn, Pause/Resume, khóa/split và Premiere.

`engine/monitor_resources.py` ghi RAM khả dụng, CPU và VRAM toàn máy ra CSV/JSON. Đo từng cấu hình: app riêng, app + Chrome, app + Premiere, app + LOL và trạng thái Pause. Không suy diễn RAM còn trống thành bảo đảm không giật; cần ghi thêm FPS/frame-time khi chơi game.

Ngân sách kế hoạch hiện tại vẫn là ước lượng: Fast khoảng 6–12 GB RAM và 4–7 GB VRAM; Quality khoảng 10–18 GB RAM và 7–10 GB VRAM, có thể tăng lúc load model. Cần cộng Windows, Premiere, browser, game và cache video vào tổng máy. Chưa có benchmark khách để thay những dải này bằng số đo.
