# Kế hoạch triển khai SyncCut mới

Ngày lập: 17/09/2026. Trạng thái: kế hoạch, chưa triển khai hoặc build.

## 1. Mục tiêu và phạm vi

Ứng dụng Windows nhận một voiceover và nhiều video/ảnh, hiểu nội dung lời đọc và hình ảnh, tạo bản dựng thô để hậu kỳ trong Adobe Premiere Pro 2024. Quy trình chính: kéo thả nguồn → Phân tích & dựng → Xuất XML.

- Ưu tiên tiếng Anh; máy đích RTX 3060 12GB VRAM, RAM 32GB.
- Giữ nguyên toàn bộ voiceover theo mặc định, bao gồm khoảng nghỉ. Không tự cắt từ đệm, chọn take hoặc thay đổi tốc độ lời đọc.
- Không bắt nhập script, xác nhận transcript hay duyệt từng cảnh. Người dùng có thể bổ sung mô tả chủ đề/tên riêng để hỗ trợ phân tích.
- XML phải có sequence chỉnh sửa được, gồm hình ảnh/video và voiceover. Footage audio mặc định tắt để không lẫn vào lời đọc.
- XML là bản mô tả timeline tham chiếu media, không chứa dữ liệu hình/âm thanh bên trong. Khi media nguồn tương thích, đầu ra chính là một XML tham chiếu nguồn gốc. Khi phải chuyển mã/đóng gói, XML đi kèm thư mục media cần thiết; không thể hứa một file XML tự chứa mọi thứ.
- Không làm trình dựng video đầy đủ, không tạo ảnh/video bằng AI, không tích hợp tải YouTube trong bản đầu. Hoàn thiện luồng nhập file → XML trước.

## 2. Điều kiện đầu vào và cam kết đầu ra

“Luôn có đầu ra” áp dụng cho dự án có ít nhất một voiceover đọc được, có nội dung âm thanh và một nguồn hình đọc được; ổ đĩa phải ghi được và còn dung lượng. Không thể khôi phục nội dung từ file hoàn toàn hỏng hoặc tạo voiceover gốc khi không có nguồn.

Nếu thiếu điều kiện tối thiểu: chặn trước xử lý, nêu chính xác file/lý do và cho xuất báo cáo chẩn đoán. Không báo thành công hoặc tạo XML rỗng.

Với đầu vào hợp lệ:

1. Toàn bộ thời lượng voiceover có hình phủ kín; chỉ sai số làm tròn tối đa một frame ở biên kết thúc.
2. Không bỏ voiceover do phiên âm hoặc model hình ảnh lỗi. Bản âm thanh dùng phân tích tách biệt với âm thanh xuất.
3. Không để đoạn video vượt khoảng đọc được của nguồn.
4. Nếu không tìm thấy cảnh phù hợp: dùng nguồn hợp lệ thay thế, đánh dấu rõ “minh họa thay thế”, “lặp cảnh” hoặc “giữ khung hình”.
5. Nếu AI thất bại sau số lần thử giới hạn: tạo bản dựng dự phòng từ media hợp lệ, hiển thị “Có đầu ra dự phòng — cần kiểm tra”, không gọi đó là kết quả ghép đúng ngữ nghĩa.
6. Nếu nguồn biến mất, ổ đĩa đầy hoặc xuất thất bại: giữ kết quả trung gian, cho sửa đường dẫn/chọn nơi lưu và xuất lại. Không giả định có thể xuất thành công trong mọi lỗi hệ thống.

## 3. Kiến trúc dự kiến

Giữ Tauri + React/TypeScript cho ứng dụng Windows. Dùng Python worker cho phân tích AI và lập kế hoạch dựng; FFmpeg/FFprobe xử lý media. Rust quản lý vòng đời worker, đường dẫn, sự kiện và tích hợp desktop, không lặp lại logic dựng.

Các module:

- `media`: kiểm tra nguồn, probe, chuẩn hóa khi cần, lấy ảnh mẫu, quản lý ID nguồn ổn định.
- `speech`: phiên âm và thời gian lời đọc; không sửa audio gốc.
- `vision`: mô tả cảnh từ các ảnh mẫu, truy xuất ứng viên, kiểm tra độ phù hợp.
- `planner`: lập timeline bằng code với các ràng buộc thời gian, phủ hình và giới hạn nguồn.
- `export`: FCP7 XML/xmeml và kiểm tra tham chiếu media.
- `jobs`: trạng thái, hủy, retry giới hạn, checkpoint và cache có phiên bản.
- `diagnostics`: log cấu trúc, báo cáo xử lý, xuất gói chẩn đoán.

Dùng một hợp đồng dữ liệu có phiên bản. Source ID, source in/out và timeline start/end là các trường riêng; không dùng một biến duration cho nhiều ý nghĩa. Quy ước khoảng [in, out), lưu nguồn theo timebase/FPS gốc và timeline theo frame số nguyên. Chuyển đổi tập trung tại một module, tránh cộng dồn số thực qua từng cảnh.

AI chỉ trả về mô tả và ID cảnh ứng viên trong danh mục đã kiểm tra. AI không được tự bịa đường dẫn, thời lượng nguồn hoặc viết XML. Bộ planner là nơi duy nhất tạo thời gian timeline.

## 4. Model: chọn sau thử nghiệm, không chốt theo quảng cáo

Hai model ứng viên cho prototype:

- Whisper small.en qua faster-whisper: phiên âm tiếng Anh và lấy mốc thời gian.
- Qwen3-VL-4B-Instruct lượng tử hóa 4-bit: đọc ảnh mẫu, mô tả chủ thể/bối cảnh/hành động và đối chiếu cảnh với lời đọc.

Đây là ứng viên, chưa có số đo trên máy khách. Cần xác minh backend lượng tử hóa hỗ trợ Windows và model trước khi chọn runtime phát hành. Nếu chất lượng không đạt, so sánh phương án khác bằng cùng bộ mẫu, không tự tăng model hoặc thêm chuỗi agent.

Ưu tiên hai model chuyên trách thay vì ép một model vừa nghe âm thanh vừa hiểu video khi chưa có bằng chứng chất lượng/tài nguyên tốt hơn. Chạy tuần tự, giải phóng model giữa các giai đoạn. Bản đầu chưa thêm model embedding/reranker riêng; thử truy xuất trên mô tả rồi dùng lại model hình ảnh kiểm tra nhóm ứng viên. Đo tốc độ và độ bỏ sót trước khi quyết định có cần embedding.

Đích thiết kế ban đầu: hạn chế đỉnh VRAM khoảng 8–9GB và RAM tiến trình khoảng 16–20GB trên máy đích. Đây là ngân sách cần đo, không phải số liệu thực tế hoặc bảo đảm có thể chạy đồng thời Premiere/LoL. Chế độ Tiết kiệm giảm batch, độ phân giải ảnh mẫu và số tác vụ song song; khi OOM giảm tải và thử lại hữu hạn.

## 5. Pipeline xử lý

### A. Kiểm tra và nhận nguồn

Probe từng file, xác nhận stream đọc được, thời lượng, FPS/timebase, xoay hình, độ phân giải và audio channels. Tên Unicode, dấu cách, đường dẫn ổ khác phải được hỗ trợ. Lưu thông tin nguồn trong manifest thống nhất.

Đánh dấu/bỏ qua từng footage hỏng nếu vẫn đủ nguồn hợp lệ; voiceover hỏng thì cần thay nguồn. Chỉ chuẩn hóa định dạng, VFR hoặc codec khi cần cho tính ổn định của đầu ra Premiere. Không mặc định chuyển mã toàn bộ hoặc xuất hàng trăm clip nhỏ.

### B. Hiểu lời đọc

Phiên âm một lần, lấy mốc từ/câu, chia đoạn nội dung. Nếu phiên âm lỗi cục bộ: giữ thời gian và audio, dùng ngữ cảnh lân cận hoặc bản dựng dự phòng cho đoạn đó. Transcript không trở thành cửa chặn toàn bộ pipeline.

### C. Hiểu footage và ảnh

Phát hiện chuyển cảnh; với cảnh dài, bổ sung mẫu theo thời gian. Phân tích các khung đầu/giữa/cuối phù hợp với cảnh; có thể lấy thêm khi thông tin mâu thuẫn hoặc chuyển động khó nhận biết. Không coi vài ảnh mẫu là bằng chứng đã hiểu mọi frame.

Lưu source ID, khoảng nguồn, ảnh mẫu, mô tả và các yếu tố nhìn thấy được. Tên nhân vật riêng chỉ được ghi như nhận diện chắc chắn khi có bằng chứng/thông tin người dùng hỗ trợ; tránh đoán danh tính từ hình ảnh mơ hồ.

### D. Chọn cảnh và dựng

Tìm ứng viên theo nội dung từng đoạn lời đọc, ưu tiên cảnh đúng chủ thể/hành động và xem xét toàn timeline để tránh tiêu hết cảnh đặc thù quá sớm. Tách cảnh phù hợp, cảnh minh họa và cảnh dự phòng. Không sử dụng một ngưỡng similarity chưa hiệu chuẩn làm chứng nhận “đúng”.

Nếu footage dài hơn voice: chỉ dùng những đoạn phù hợp. Nếu ngắn hơn: tận dụng ảnh, đoạn chưa dùng, lặp có khoảng cách hoặc giữ khung hình theo cấu hình. Giữ khung hình phải dùng ảnh thực từ nguồn hợp lệ, không kéo out-point vượt EOF. Mặc định không thay đổi tốc độ voiceover.

### E. Kiểm tra và xuất

Kiểm tra toàn bộ interval hình/audio, giới hạn nguồn, file tham chiếu, FPS, channel mapping và tính hợp lệ XML trước khi ghi đầu ra. Kiểm tra decode tại các điểm sử dụng và quanh điểm cắt; chỉ nói đã decode toàn bộ khi thực sự chạy kiểm tra toàn bộ.

Ghi file tạm rồi đổi tên khi hoàn tất. Nếu chuyển mã tạo media phụ trợ, xác minh media trước khi công bố XML. Sequence có marker ở các đoạn thay thế/không chắc chắn để hậu kỳ tìm nhanh trong Premiere, sau khi xác nhận marker được Premiere 2024 nhập đúng.

## 6. Giao diện

Một màn hình monochrome, không chia bước bắt buộc:

- Vùng kéo thả voiceover và vùng kéo thả video/ảnh, tên file, thời lượng, thumbnail và trạng thái hợp lệ rõ ràng.
- Xóa khỏi dự án bằng nút/context menu, không xóa file gốc. Phân biệt nguồn đã nhập với nguồn được chọn tham gia dựng.
- Nút chính “Phân tích & dựng”; khi đang chạy có Hủy và trạng thái hiện tại.
- Sau thành công: nút “Xuất XML cho Premiere” nổi bật. Có tùy chọn tự xuất sau xử lý khi đã chọn nơi lưu.
- Preview là tùy chọn, không phải cửa chặn xuất. Chưa xây editor timeline phức tạp trong MVP.
- Thiết lập mở rộng: FPS/khung hình đầu ra, nhịp cảnh, chính sách thiếu footage, giới hạn tài nguyên, nơi lưu dự án/cache/model/runtime.
- Setup AI: tự kiểm tra máy, cài theo gói đã kiểm chứng, hiển thị phần trăm/tốc độ/dung lượng khi biết tổng dung lượng; giai đoạn giải nén/cài đặt có trạng thái riêng.

## 7. Tiến trình, cache và log

Hiển thị giai đoạn thực tế, ví dụ “Phân tích cảnh 18/120”, thời gian đã chạy và số cảnh/lời đọc đã xử lý. Khi chưa biết tổng công việc thì dùng trạng thái không xác định thay vì phần trăm giả. Tiến trình AI dựa trên số đơn vị xử lý, không dựa vào đồng hồ chạy giả.

Mỗi job có ID; log JSONL kèm bản dễ đọc, chứa app/engine/model version, cấu hình, GPU/driver, stage, source ID, thời gian, số cảnh, số lần thử, lỗi và stack trace. Lỗi timeline phải ghi cả source in/out, source duration, timeline start/end, FPS/timebase và nguồn metadata/checkpoint.

Gói chẩn đoán gồm log, manifest, timeline plan và kết quả kiểm tra export; không tự gửi ra mạng. Cho biết đường dẫn/tên file có thể nằm trong gói. Transcript, ảnh mẫu và dữ liệu gốc chỉ đưa vào khi người dùng chủ động chọn.

Cache khóa theo fingerprint nội dung nguồn, model/version, cấu hình và schema. Phân biệt dữ liệu nguồn với dữ liệu suy ra. Có “Phân tích lại bỏ qua cache” và “Xóa cache xử lý”; không xóa model hoặc file nguồn theo các thao tác này. Model được kiểm tra lại từ thư mục cấu hình đã lưu khi khởi động.

## 8. Thứ tự triển khai và cổng nghiệm thu

### Giai đoạn 0 — Chốt bộ mẫu

Nhận bộ mẫu có quyền sử dụng: voice tiếng Anh, nhiều footage, ảnh, trường hợp thiếu hình, khác FPS và tên/đường dẫn Unicode. Ghi rõ Premiere 2024 phiên bản 24.x cụ thể, GPU driver và cấu hình máy khách. Nếu chưa có dữ liệu khách, có thể phát triển phần kỹ thuật bằng media tổng hợp; không dùng nó để kết luận chất lượng AI.

### Giai đoạn 1 — Chứng minh XML trước AI/UI

Tạo exporter tối thiểu với timeline xác định trước. Thử video, ảnh, voiceover dài hơn hình, khác FPS, đường dẫn Unicode, stereo/mono và media chuyển mã khi cần. Khách mở trên đúng Premiere 2024 để kiểm tra hình/tiếng, thời gian, offline media và khả năng chỉnh sửa từng đoạn.

Điều kiện qua: các mẫu hợp lệ có đủ hình/tiếng, không vượt nguồn, không drift quá một frame ở các mốc kiểm tra. Chưa qua thì chưa triển khai AI/UI đầy đủ.

### Giai đoạn 2 — Chứng minh chất lượng và tài nguyên AI

Làm worker tối thiểu, chạy đúng bộ mẫu trên máy khách. Đánh giá riêng phiên âm, tìm cảnh và kết quả dựng. Báo tỷ lệ đoạn phù hợp, sai chủ thể, đoạn dự phòng, mức lặp; phân biệt tập có cảnh đúng sẵn với tập thiếu hình. Đo đỉnh RAM/VRAM, thời gian từng giai đoạn và dung lượng cache.

Đề xuất ngưỡng khởi điểm cần thống nhất với khách: ít nhất 85% đoạn lời đọc có cảnh phù hợp khi bộ nguồn thực sự có cảnh tương ứng, 100% đoạn dự phòng được đánh dấu; hình/âm thanh và giới hạn nguồn phải đạt 100%. Không chọn bộ mẫu dễ sau khi xem kết quả để làm đẹp tỷ lệ.

### Giai đoạn 3 — Hoàn thiện pipeline chịu lỗi

Tích hợp planner, fallback, resume và diagnostics. Thử lỗi chủ đích: model trả sai schema, OOM, worker chết, nguồn mất, footage hỏng, cache cũ, hết dung lượng, hủy giữa chừng. Với dự án đủ nguồn hợp lệ và ổ đĩa ghi được, lỗi AI phải dẫn đến bản dựng dự phòng được gắn nhãn; lỗi lưu trữ phải có cơ chế xuất lại.

### Giai đoạn 4 — Giao diện và setup Windows

Làm một màn hình chính, drag-drop, thiết lập, tiến trình và log. Kiểm tra thư mục cài ở ổ khác, mở lại app vẫn nhận model, subprocess không bật cửa sổ gây chớp màn hình, và thao tác xóa nguồn không xóa file gốc.

### Giai đoạn 5 — Nghiệm thu và phát hành

Chạy bộ regression export cùng bộ mẫu khách trên bản đóng gói, mở trong Premiere 2024. Chỉ phát hành sau khi đạt cổng kỹ thuật và khách chấp nhận chất lượng chọn cảnh. Build/release cần yêu cầu cho phép riêng; việc duyệt kế hoạch không tự động cho phép build hoặc đẩy GitHub.

Không hứa ngày hoàn thành hoặc tốc độ xử lý trước khi có kết quả giai đoạn 1–2. Sau đó ước lượng lịch theo phần việc thực tế còn lại.

## 9. Quyết định về Montaj

Không dùng nguyên dự án làm nền. Tham khảo cách lập danh mục cảnh, phân biệt thời gian nguồn/timeline, đánh dấu filler và tổ chức module. Bản clone khảo sát có thể xóa sau khi lưu tham chiếu.

Nếu tái sử dụng mã sau này, lấy từ commit cố định, giữ thông báo bản quyền/MIT và kiểm tra license từng dependency. Không mang vào app toàn bộ editor/render stack, quy tắc cắt voiceover hoặc việc agent trực tiếp ghi timeline.

Mốc khảo sát: Montaj 4.5.0, commit `789cc9a6b25975c3c4d0bf4f5e13faa569581529`.

- Repository: https://github.com/theSamPadilla/montaj/tree/789cc9a6b25975c3c4d0bf4f5e13faa569581529
- Workflow: https://github.com/theSamPadilla/montaj/blob/789cc9a6b25975c3c4d0bf4f5e13faa569581529/workflows/broll.json
- Hướng dẫn chọn B-roll: https://github.com/theSamPadilla/montaj/blob/789cc9a6b25975c3c4d0bf4f5e13faa569581529/skills/broll/SKILL.md
- Thời gian nguồn: https://github.com/theSamPadilla/montaj/blob/789cc9a6b25975c3c4d0bf4f5e13faa569581529/montaj_assets/timeline-core/src/source-window.js
- Validator: https://github.com/theSamPadilla/montaj/blob/789cc9a6b25975c3c4d0bf4f5e13faa569581529/engine/validate.py

## 10. Thông tin cần từ khách khi bắt đầu kiểm chứng

1. Bộ voiceover + footage/ảnh đại diện, đặc biệt một bộ từng xuất lỗi hoặc thiếu hình.
2. Phiên bản Premiere Pro 2024 cụ thể; FPS, tỷ lệ khung hình và độ phân giải đầu ra thường dùng.
3. Cho biết có chấp nhận lặp cảnh/giữ ảnh khi thiếu footage hay không; mặc định bật và đánh dấu rõ.
4. Một lượt mở XML mẫu và ghi lại kết quả, sau đó chạy benchmark AI trên máy 3060 12GB.

Không yêu cầu khách tự sửa JSON, mò cache hay chỉnh script để hoàn thành kiểm thử.
