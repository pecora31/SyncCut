# Câu hỏi thường gặp

## SyncCut có upload voiceover hoặc script lên cloud không?

Không trong pipeline mặc định. Model và inference chạy offline trên runtime local. Downloader YouTube là thao tác online riêng. Xem [Quyền riêng tư và giới hạn](privacy-and-limits.md).

## Có cần cài model trên máy phát triển không?

Không. Installer/build chỉ cần frontend và Rust. Model phải được cài trên máy khách bằng setup script để kiểm tra đúng GPU/driver.

## Có thể dùng Premiere và Chrome cùng lúc không?

Có thể, nhưng mức lag phụ thuộc project, codec, tab và GPU workload. Dùng Fast/Shared, đo bằng sampler và Pause khi cần Premiere/LOL phản hồi nhanh.

## SyncCut có tự chọn cảnh cuối cùng không?

SyncCut tạo rough-cut suggestion. Clip `suggested` cần editor duyệt; chỉ candidate `match` có bằng chứng mới được planner tự dùng. Cảnh không đủ evidence trở thành gap.

## Tại sao timeline có gap?

Không có cảnh `match` đủ dài, source đã dùng hết duration hợp lệ, hoặc đó là khoảng pause trong voice. Gap là tín hiệu để bạn chọn source khác hoặc chèn thủ công.

## Có thể dùng footage VFR/23.976 không?

Có. Project dùng FPS phân số và export conform clip theo sequence. Hãy kiểm tra start/middle/end trong Premiere, đặc biệt với VFR và source gần EOF.

## Có handles không?

Không. Clip export chỉ chứa đúng range đã chọn để giữ frame count chắc chắn. Muốn kéo dài cần source gốc hoặc export lại.

## Đổi model profile có làm mất timeline không?

Đổi profile xóa kết quả speech/scenes/timeline liên quan để tránh trộn model output. Sao lưu project nếu muốn giữ phương án cũ.

## BGE có bắt buộc không?

Không. Lượt đầu dùng SigLIP. BGE chỉ tìm trên caption Qwen đã cache từ các lượt kiểm tra trước, giúp tìm lại cảnh trong project lớn.

## Tôi có thể chỉnh SQLite thủ công không?

Không nên. Schema, revision và frame invariants được Rust validator kiểm tra; chỉnh tay dễ làm app từ chối project hoặc XML sai.
