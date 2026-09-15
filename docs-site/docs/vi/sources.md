# Tạo project và import nguồn

## Tạo hoặc mở project

Trong màn hình chào, nhấn **Choose a project folder**. Chọn thư mục trống cho project mới hoặc thư mục đã có `.synccut/project.sqlite` để mở lại. Mỗi project có revision; app dùng revision để tránh cửa sổ khác ghi đè thay đổi âm thầm.

## Import file

Trong **Sources**, nhấn **Import files** rồi chọn nhiều file cùng lúc. Đường dẫn được chuẩn hóa và ID được tạo từ đường dẫn, vì vậy hai file cùng tên ở hai thư mục khác nhau vẫn là hai asset khác nhau. File không tồn tại hoặc extension không hỗ trợ sẽ bị từ chối.

Bạn cũng có thể kéo file từ Windows Explorer vào cửa sổ app. Kéo một dòng nguồn trong media list vào monitor để preview; click một lần chỉ chọn.

## Gán role

Chọn một file trong dropdown **Voiceover** và một file trong **Script**. Audio/video có audio stream mới dùng làm voiceover. Script phải là file text. Các video và image được chọn bằng checkbox **Use** trong danh sách nguồn.

Voiceover và script thay đổi nội dung phân tích, nên SyncCut xóa word timing, beat, scene match và timeline cũ để tránh dùng kết quả sai nguồn. Khi footage thay đổi, scene index và timeline được tạo lại.

## Preview nguồn

- Click: highlight/select.
- Double-click: mở trong tab **Source**.
- Kéo dòng nguồn vào monitor: mở preview.
- Chọn **Program**: xem timeline theo voiceover.
- Chọn **Source**: xem media độc lập, không thay đổi project.

Ảnh hiển thị trực tiếp. Video chạy muted trong Program vì voiceover là master clock. Audio voiceover trong Source có thể nghe độc lập.

## YouTube downloader

Nút **Download media** mở downloader riêng. Nhập URL, chọn mode/chất lượng và thư mục output. Sau khi tải xong, file được import như asset mới. Tải media cần mạng; phân tích AI sau đó vẫn offline. Chỉ tải nội dung bạn có quyền sử dụng.

## Trước khi Check recording

Kiểm tra:

- voiceover nghe được và đúng take;
- script đúng phiên bản, không còn ghi chú dành cho biên tập;
- tất cả footage cần tìm cảnh đã tick **Use**;
- ổ đĩa có đủ chỗ cho cache frame và export;
- nếu máy đang chạy Premiere/LOL, bắt đầu bằng profile Fast/Shared.
