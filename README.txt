SHOPEE CS TOOLKIT v2.4.0 — HƯỚNG DẪN CÀI ĐẶT
=================================================

1. Giải nén file .zip này vào một thư mục cố định trên máy tính (không xóa sau khi cài).
2. Mở trình duyệt Chrome hoặc Edge, truy cập địa chỉ: chrome://extensions
3. Bật công tắc "Chế độ cho nhà phát triển" (Developer mode) ở góc trên bên phải.
4. Bấm "Tải tiện ích đã giải nén" (Load unpacked) và chọn thư mục vừa giải nén.
5. Ghim biểu tượng "Shopee CS Toolkit" lên thanh công cụ và bấm vào để mở Side Panel.

TÍNH NĂNG CHÍNH:
- Tab DMS Tracking:
  + Dán trực tiếp đoạn chat/log hoặc danh sách mã đơn, tích hợp nút "Tách mã đơn" và chế độ tự động lọc trùng trước khi chạy.
  + Tự động tra cứu Shipping Tracking Number trên dms.cs.shopee.vn.
  + Khi có nhiều kết quả tìm kiếm sau khi Enter, tự động ưu tiên click kết quả đầu tiên là thẻ div có url="/info/order/..." (VD: url="/info/order/248841747237619").
  + Tự động đóng tab tra cứu sau khi hoàn tất lấy mã vận đơn (giữ tab nếu cần đăng nhập Google).
  + Xuất kết quả nhanh sang Excel (Copy TSV) hoặc tải file CSV.
- Tab Tách mã đơn:
  + Tách chính xác mã đơn hàng Shopee (6 số đầu + 8 ký tự chữ/số cuối).
  + Lọc bỏ mã trùng, chọn ngăn cách dấu phẩy (,) hoặc xuống dòng.
  + Sao chép nhanh hoặc chuyển trực tiếp sang tab DMS Tracking chỉ với 1 click.
- Tab Hóa đơn (Google Sheets):
  + Tự động mở Sheet tổng hợp, đọc cột A (Năm), cột B (Tháng) và link cột C (hỗ trợ cả Smart Chips) tạo danh sách CHECKBOX cho phép CS chọn nhiều tháng cùng lúc.
  + Lần lượt mở link cột C từng tháng đã tick:
    * Sheet "Hoa don gui PN": bỏ 3 cột đầu tiên (A, B, C), tự động lấy mã tra cứu cho TẤT CẢ các cột còn lại.
    * Sheet "_AMS" (loại trừ "AMS Service fee"): tự động lấy thêm mã Phí dịch vụ AMS.
  + Tự động gộp kết quả nhiều kỳ để sao chép 1 lần hoặc copy lẻ từng kỳ, tự đóng tab Google Sheet sau khi xong.
