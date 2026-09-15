# Cài đặt và chạy lần đầu

## 1. Cài SyncCut

Tải bộ cài mới nhất từ trang Releases và cài như ứng dụng Windows thông thường. SyncCut đã kèm FFmpeg/FFprobe; model AI được tải ở bước tiếp theo để tránh làm bộ cài editor quá lớn.

## 2. Mở trình cài AI

Khởi động SyncCut và nhấn **Set up local AI first** ở màn hình chào hoặc **Set up AI** trên thanh đầu ứng dụng.

Trình cài tự kiểm tra GPU NVIDIA, Python 3.11/3.12 bản 64-bit, FFmpeg/FFprobe đi kèm, thư mục runtime và các model đã có. Mục có nhãn **Ready** không cần xử lý. Nếu Python hiện **Action needed**, nhấn **Get Python for Windows**, cài Python 3.12 x64 rồi nhấn **Check computer again**.

## 3. Chọn model

Chọn **Fast · Recommended** cho máy RTX 3060 12 GB. Profile này phù hợp khi vẫn mở Premiere, Chrome hoặc ứng dụng khác. Chọn **Quality** khi SyncCut được dùng GPU riêng và chấp nhận thời gian xử lý lâu hơn.

Tùy chọn **Install optional text search model** chỉ cần thiết khi muốn tìm trong caption đã cache; quy trình dựng thông thường không cần bật.

## 4. Cài tự động

Nhấn **Install Fast runtime** hoặc **Install Quality runtime**. Giữ SyncCut mở và giữ kết nối mạng trong lúc tải package/model. Có thể nhấn **Open install log** để xem chi tiết. Cuối quá trình cài, SyncCut kiểm tra package, CUDA và media tools trước khi báo sẵn sàng.

Nếu nhấn **Cancel installation** hoặc mất mạng, file đã tải hoàn tất vẫn được giữ. Mở lại cửa sổ và nhấn **Continue installation** để tiếp tục.

Khi hiện **Runtime ready**, nút trên thanh đầu đổi thành **AI ready**. Lúc này có thể tạo project và bắt đầu xử lý.

!!! danger "Không sao chép runtime sang máy khác"
    Runtime chứa môi trường Python gắn với máy đã cài. Khi đổi máy, hãy chạy trình cài trong SyncCut trên máy mới.

## 5. Dùng runtime đã chuẩn bị sẵn

Người dùng kỹ thuật có thể mở **Advanced: use an existing runtime pack** → **Choose existing folder**. SyncCut vẫn kiểm tra Python, FFmpeg và marker của từng model trước khi cho chạy job.

## 6. Project đầu tiên

Chọn thư mục riêng cho project. SyncCut tạo `.synccut/project.sqlite`, cache và log trong đó. Không đặt project trong thư mục tạm hoặc thư mục đồng bộ đám mây khi đang xử lý.

Nên thử lần đầu với voiceover 1–3 phút, script rõ ràng và 3–5 footage. Đọc [Tạo project và import nguồn](sources.md) để tránh gán nhầm role.
