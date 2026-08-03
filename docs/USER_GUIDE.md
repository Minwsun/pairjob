# Hướng Dẫn Sử Dụng PairJob

Production: https://pairjob.vercel.app

## 1. Trang chủ

Trang chủ cho phép chọn không gian Nhà tuyển dụng hoặc Ứng viên. Mỗi không gian có sidebar riêng. Khi một tác vụ AI chạy, nút chuyển sang loading và progress panel hiển thị từng stage.

## 2. Nhà tuyển dụng

### Tổng quan

Hiển thị số tin tuyển dụng, ứng viên phù hợp, ứng tuyển và các thao tác gần đây.

### Tin tuyển dụng

- Danh sách tin: xem trạng thái và mở chi tiết.
- `Tạo tin`: mở flow tạo JD.
- Card hoặc tiêu đề tin: mở thông tin đầy đủ.
- `Chỉnh sửa`: cập nhật dữ liệu canonical.
- `Ứng viên phù hợp`: xem danh sách đã xếp hạng cho tin đó.
- `Ứng tuyển`: xem người đã chủ động nộp hồ sơ.

### Tạo tin

1. Nhập tiêu đề và mô tả tự nhiên.
2. Bấm phân tích.
3. Theo dõi các stage đọc JD, AI extraction và taxonomy normalization.
4. Kiểm tra nghề, kỹ năng, kinh nghiệm và các điều kiện đã hiểu.
5. Trả lời popup nếu hệ thống cần làm rõ.
6. Xác nhận để publish.

Các câu trả lời làm rõ được chuyển thành yêu cầu tuyển dụng hoàn chỉnh; ứng viên không nhìn thấy hội thoại thô.

### Ứng viên phù hợp

Danh sách hiển thị điểm matching trên từng ứng viên. Chọn ứng viên để xem breakdown: nghề, kỹ năng, kinh nghiệm, điều kiện làm việc, điểm mạnh và phần còn thiếu.

### Quản lý ứng tuyển

Nhà tuyển dụng xem hồ sơ đã nộp và cập nhật trạng thái ứng tuyển theo quy trình của hệ thống.

## 3. Ứng viên

### Hồ sơ của tôi

- Xem hồ sơ canonical đã nhập.
- Chỉnh chức danh, nghề, kỹ năng, kinh nghiệm, học vấn và điều kiện làm việc.
- Mỗi thay đổi tạo phiên bản mới để matching/roadmap được tính lại đúng dữ liệu.

### Nhập CV

1. Chọn PDF có text layer, DOCX hoặc nhập URL portfolio công khai.
2. Bấm nộp CV.
3. Hệ thống tự parse, extract, normalize và lưu hồ sơ.
4. Nếu thông tin chưa đủ, popup hỏi thêm tối thiểu các điểm quan trọng.
5. Hoàn thành câu hỏi để hồ sơ được chấp nhận.

PDF scan không có text layer trả trạng thái `OCR_REQUIRED`.

### Việc phù hợp

Trang luôn hiển thị job cùng điểm matching. Mở job để xem mô tả đầy đủ, yêu cầu, lý do phù hợp, kỹ năng thiếu và nút ứng tuyển.

### Ứng tuyển của tôi

Hiển thị các job đã ứng tuyển và trạng thái hiện tại.

### Lộ trình phát triển

Roadmap trình bày:

- Vị trí phù hợp hiện tại và lý do.
- Điểm mạnh đang có.
- Kỹ năng hoặc kiến thức còn thiếu.
- `Việc cần làm` theo từng giai đoạn.
- Hướng mở rộng ngoài phạm vi CV hiện tại.

## 4. Trạng thái và lỗi thường gặp

- `LLM_NOT_CONFIGURED`: thiếu cấu hình LLM.
- `OCR_REQUIRED`: PDF scan không có text layer.
- `PDF_RUNTIME_UNAVAILABLE`: runtime PDF chưa tải được.
- `TAXONOMY_DEFAULT_PARENT_MISSING`: taxonomy nền chưa được seed.
- Loading kéo dài: kiểm tra LLM provider, database và pipeline status.

## 5. Quyền riêng tư

Không nhập CV thật vào môi trường không tin cậy. Production cần cấu hình secret trong Vercel và kiểm soát quyền truy cập database/blob.
