# Tìm và duyệt cảnh

## Phân tích cảnh

Trong Recording, khi passage đã `verified` hoặc `accepted`, nhấn **Find scenes**. Mỗi footage được probe bằng FFprobe, phát hiện cut bằng detector, chia scene dài thành cửa sổ nhỏ hơn và lấy 3 frame đại diện. Ảnh được xử lý như một still scene.

## Visual brief

SyncCut dùng context toàn script, passage lân cận và passage hiện tại để tạo visual brief. Brief nên trả lời “cần thấy gì”, hành động nào cần bằng chứng, entity nào cần nhận diện và phần nào chỉ là minh họa tùy chọn.

Nếu brief hiểu sai chủ thể hoặc hành động, đừng chọn cảnh chỉ vì similarity cao. Hãy giữ gap hoặc chọn cảnh partial để tự chỉnh trong Premiere.

## Candidate card

Mỗi card có:

- tên source;
- các frame theo thứ tự và timestamp source;
- verdict `match`, `partial`, `unrelated` hoặc `unreviewed`;
- lý do model;
- caption quan sát độc lập;
- khoảng source-in/source-out.

`match` phải có timestamp nằm đúng một frame đã hiển thị. `partial` nghĩa là chỉ một phần yêu cầu có bằng chứng. `unreviewed` là ứng viên retrieval chưa được Qwen kiểm tra. Không có điểm phần trăm vì đó không phải xác suất đáng tin.

## Preview và chọn cảnh

Double-click frame để mở asset trong Source monitor. Ở Timeline, chọn slot rồi xem **Alternatives for selected slot**. Nhấn **Use this scene** để thay scene của slot; SyncCut kiểm tra scene có đủ duration và giữ source range trong boundary đã xác minh.

## Các trường hợp cần thận trọng

- Hành động nhanh có thể không xuất hiện trong 3 frame mẫu.
- Một vật thể nhìn thấy không chứng minh người nào đó đã thực hiện hành động.
- Tên người, sản phẩm, logo cần bằng chứng nhận diện rõ; nếu không, dùng partial.
- Cảnh có hình ảnh đẹp nhưng không liên quan nội dung vẫn phải đánh unrelated.
- Cảnh ngắn hơn slot cần split slot hoặc chọn source khác.

## Tìm lại sau khi đổi footage

Tick/untick Use, đổi shot duration hoặc đổi model profile có thể làm scene index cũ không còn hợp lệ. Hãy chạy Find scenes lại; bản chạy mới tạo timeline mới. Nếu muốn giữ cut cũ, sao lưu project folder trước.
