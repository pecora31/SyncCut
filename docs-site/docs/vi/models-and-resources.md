# Model và tài nguyên máy

## Hai profile

| Profile | ASR | Visual reasoner | Dùng khi |
|---|---|---|---|
| Fast | distil-whisper large-v3.5 CT2 | Qwen3-VL 4B NF4 | Ưu tiên thời gian và chạy cùng app khác |
| Quality | faster-whisper large-v3 | Qwen3-VL 8B NF4 | Ưu tiên hiểu cảnh, nên chạy focused |

Cả hai dùng English wav2vec2 CTC alignment và SigLIP2 SO400M. BGE-base-en-v1.5 là tùy chọn CPU để tìm caption đã cache, không phải bước bắt buộc của lượt đầu.

## Fast/Quality và Shared/Focused

- **Focused**: cho một stage dùng nhiều tài nguyên hơn; phù hợp khi không cần chơi game/dựng cùng lúc.
- **Shared**: ép profile Fast, giới hạn CPU batch/thread và throttle; phù hợp khi Chrome/Premiere đang mở. Vẫn có thể thiếu VRAM nếu app khác chiếm GPU.

SyncCut chỉ nạp một model nặng mỗi stage rồi worker thoát để giải phóng VRAM. Guard yêu cầu VRAM trống tối thiểu khoảng 6 GiB cho Fast Qwen và 9 GiB cho Quality Qwen, đã cộng biên an toàn 2 GiB. Đây là admission check, không phải reservation.

## Đo thực tế

```powershell
& 'D:\SyncCutRuntime\python\Scripts\python.exe' .\monitor_resources.py `
  --output 'D:\SyncCutMeasurements\fast-premiere' --seconds 900
```

Chạy riêng baseline, Fast, Quality, Fast + Chrome, Fast + Premiere và Fast + LOL. Đọc `systemRamAvailableGiB` và VRAM toàn device; sampler không đo FPS game hoặc latency Premiere.

## Khi máy bị lag

1. Pause job để dừng worker và nhả GPU.
2. Đổi Quality → Fast hoặc Focused → Shared sau khi job kết thúc.
3. Đóng tab Chrome/video preview và ứng dụng dùng GPU.
4. Chạy lại stage sau khi hệ thống ổn định.

Không tắt process bằng Task Manager khi có thể dùng Pause/Cancel trong app; supervisor cần ghi trạng thái checkpoint.
