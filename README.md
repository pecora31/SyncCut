# SyncCut

Ứng dụng Windows tạo bản dựng thô từ voiceover, footage và ảnh, rồi xuất FCP7 XML/xmeml để mở trong Adobe Premiere Pro 2024.

Phiên bản hiện tại là nền tảng giai đoạn 1: nhập file, kiểm tra source với FFprobe, tạo timeline dự phòng phủ kín voiceover và xuất XML. Chưa cài model AI hoặc tuyên bố đã chọn cảnh theo ngữ nghĩa.

## Quy tắc an toàn của pipeline

- Giữ nguyên voiceover gốc.
- Không tạo XML nếu không có voiceover hợp lệ và tối thiểu một nguồn hình hợp lệ.
- Không cho đoạn video vượt thời lượng nguồn.
- Timeline hình phải phủ kín voiceover trước khi xuất.
- Khi AI chưa có hoặc thất bại, dùng bản dựng dự phòng và gắn marker để mở trong Premiere kiểm tra nhanh.

## Chạy môi trường phát triển

Cần Node.js, Rust, Python và FFmpeg/FFprobe có trong `PATH`.

```powershell
npm install
npm run tauri dev
```

Kiểm tra lõi:

```powershell
npm run test:engine
npm run build
Set-Location src-tauri
cargo check
```

## Xác thực bắt buộc trước bản phát hành

Phải mở XML từ bộ mẫu thực trong đúng Premiere Pro 2024 của khách, kiểm tra picture track, voiceover, media relink, frame rate và marker. Không tạo release cho đến khi cổng kiểm tra này đạt.
