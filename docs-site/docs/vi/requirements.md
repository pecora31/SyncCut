# Yêu cầu hệ thống

## Cấu hình khuyến nghị

SyncCut được thiết kế trước hết cho Windows x64 với:

| Thành phần | Mức khuyến nghị |
|---|---|
| Hệ điều hành | Windows 10/11 64-bit |
| CPU | 6 nhân trở lên; CPU nhiều nhân giúp FFmpeg và index nhanh hơn |
| RAM | 32 GB |
| GPU | NVIDIA RTX 3060 12 GB VRAM hoặc tốt hơn |
| Driver | NVIDIA Studio/Game Ready hỗ trợ CUDA hiện hành |
| Ổ đĩa | SSD; chừa 30–65 GB cho runtime/model, cộng dung lượng cache và export |
| Python | CPython 3.11 hoặc 3.12 x64, chỉ cần khi tự chuẩn bị runtime |
| Phần mềm dựng | Adobe Premiere Pro phiên bản hỗ trợ import FCP7 XML |

## Dung lượng và hiệu năng

Các con số sau là ngân sách lập kế hoạch, không phải benchmark bảo đảm:

| Chế độ | RAM SyncCut ước lượng | VRAM model ước lượng | Cách dùng |
|---|---:|---:|---|
| Idle/Pause | 1–3 GB | thường dưới 1 GB | Có thể dùng Premiere, Chrome và game bình thường |
| Fast/Shared | 6–12 GB | khoảng 4–7 GB | Nên dùng khi cần vừa xử lý vừa làm việc nhẹ |
| Quality/Focused | 10–18 GB | khoảng 7–10 GB | Nên dành GPU cho SyncCut trong lúc model chạy |

Premiere, Chrome, driver và LOL dùng thêm tài nguyên riêng. `Shared` chỉ giảm workload và chọn model Fast, không tạo quota GPU. Nếu cần ưu tiên Premiere hoặc game, nhấn **Pause and release GPU**.

## Định dạng nguồn

- Voiceover: WAV, MP3, M4A, AAC, FLAC, OGG.
- Script: TXT, Markdown, SRT, VTT. SRT/VTT được bỏ số thứ tự và dòng timestamp.
- Footage: MP4, MOV, MKV, AVI, WEBM.
- Image: JPG, JPEG, PNG, WEBP, BMP.

Preview phụ thuộc codec mà WebView đọc được. Khi codec không preview được, SyncCut vẫn có thể decode bằng FFmpeg trong bước phân tích/export; nếu không, hãy transcode sang H.264/AAC trước.

## Điều cần biết trước khi chạy

Model weights không nằm trong installer. Cần chạy script chuẩn bị runtime trên chính máy khách và kiểm tra CUDA trước khi xử lý. Không chạy model trên máy phát triển để “thử cho biết”, vì kết quả phụ thuộc driver, VRAM, codec, dữ liệu và phiên bản model.
