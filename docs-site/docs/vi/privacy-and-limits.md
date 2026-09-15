# Quyền riêng tư và giới hạn

## Dữ liệu cục bộ

Project database lưu đường dẫn source, script text, beat timing, scene metadata, model provenance và export path. Cache có thể chứa audio WAV tạm, frame JPEG và caption. Hãy bảo vệ cả thư mục project như dữ liệu sản xuất.

Pipeline AI không cần gửi voiceover, script hoặc footage lên cloud. Model pack được tải riêng trong bước setup; sau đó worker đặt chế độ offline. YouTube downloader vẫn cần network khi bạn chủ động dùng nó.

## Giới hạn chất lượng

- ASR/acoustic alignment không thay thế người duyệt, nhất là tên riêng, số, acronym, accent và nhiễu.
- Ba keyframe không chứng minh mọi hành động trong shot.
- Visual model có thể hiểu sai context hoặc caption; evidence timestamp chỉ chứng minh frame đã được nhìn thấy, không chứng minh sự kiện ngoài frame.
- Planner greedy giúp rough cut nhanh nhưng không tối ưu toàn bộ câu chuyện như editor.
- XML không mang color, transition, music, captions hoặc metadata camera đầy đủ.

## Dữ liệu cần gửi khi hỗ trợ

Ưu tiên gửi engine version, model revision, preflight.json, worker.log đã che path và một mô tả tái hiện. Chỉ gửi voice/script/frame khi khách hàng đã cho phép. Không đăng token, đường dẫn nội bộ hoặc nguồn chưa công bố vào issue công khai.

## Bản quyền

Bạn chịu trách nhiệm về quyền sử dụng voiceover, script, footage và media tải từ Internet. License của model và binary runtime được tách khỏi license của SyncCut; kiểm tra trước khi phân phối cho khách hàng.
