# Xuất sang Premiere Pro

## Chuẩn bị

Trước export:

1. Duyệt passage và candidate.
2. Kiểm tra clip đầu, giữa, cuối trên Program monitor.
3. Xử lý hoặc chấp nhận mọi gap.
4. Lock các clip muốn giữ.
5. Kiểm tra source vẫn nằm đúng đường dẫn và không bị đổi nội dung.

## Thực hiện

Trong Timeline nhấn **Export to Premiere**. Nếu còn gap, tick **Allow empty timeline gaps** rồi nhấn lại. SyncCut hỏi thư mục export và tạo thư mục con có ID job để không ghi đè export cũ.

Các file chính:

| File | Vai trò |
|---|---|
| `clip_*.mp4` | Video từng slot, H.264, đúng FPS/resolution project |
| `voiceover.wav` | Voice stereo, 48 kHz, 24-bit PCM |
| `source_manifest.json` | Source path, frame range, fingerprint và settings |
| `SyncCut.xml` | FCP7 XML để import vào Premiere |

Clip được conform theo frame count và FFprobe xác minh số frame. Audio được pad silence ở cuối nếu sequence cần phần lẻ frame; voice không bị kéo giãn. File source gốc không bị sửa.

## Import trong Premiere

1. Mở Premiere và tạo project/sequence mới hoặc mở project đích.
2. Chọn **File → Import**, chọn `SyncCut.xml`.
3. Mở sequence được import.
4. Nếu media offline, dùng **Link Media** tới thư mục export, không trỏ nhầm vào cache.
5. Kiểm tra start, giữa và cuối voice cùng marker passage.
6. Sau khi xác nhận, có thể thay clip conform bằng source camera gốc nếu cần handles hoặc chất lượng cao hơn.

## Giới hạn XML

XML tạo video track, hai audio track voice stereo và marker passage. Nó không tạo color grade, transition, music mix, subtitle burn-in hay multicam. Clip export không có extra handles; muốn kéo dài edit cần relink source hoặc export lại với slot dài hơn.

Nếu Premiere báo lỗi generic import, kiểm tra XML và media path trong `source_manifest.json`, bảo đảm export hoàn tất, rồi thử import XML từ thư mục local không đồng bộ cloud.
