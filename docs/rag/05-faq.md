# CÂU HỎI THƯỜNG GẶP (FAQ & NATURAL LANGUAGE QUERIES)
**Mã tài liệu:** `RAG-FAQ-05`  
**Ngày cập nhật:** 17/10/2026  
**Trạng thái xác minh:** `VERIFIED_WORKING`  
**Tài liệu tham chiếu:** `RAG-FEAT-01`, `RAG-RBAC-02`, `RAG-GUIDE-03`, `RAG-RULE-04`

---

## NHÓM 1: CÂU HỎI VỀ ĐĂNG TIN & QUẢN LÝ BẤT ĐỘNG SẢN (Mã: `FEAT-PROP-MGR`)

### Câu hỏi 1.1: Làm sao để tôi đăng tin bất động sản lên website bdsdanang.site?
- **Các cách diễn đạt khác:**
  - *Muốn đưa nhà đất lên sàn thì làm thế nào?*
  - *Tôi cần đăng nhà cho thuê hoặc bán đất ở đâu?*
  - *Quy trình tạo tin đăng mới cho chuyên viên môi giới?*
- **Tài liệu nguồn:** `RAG-GUIDE-03` (Mục 2.3).
- **Câu trả lời chuẩn:**
  Để đăng tin bất động sản lên hệ thống:
  1. Đăng nhập vào tài khoản chuyên viên tại `https://bdsdanang.site/dang-nhap`.
  2. Tại thanh điều hướng bên trái, chọn mục **Danh sách Bất động sản** (`/admin#properties`).
  3. Bấm vào nút **"+ Thêm Bất động sản"** ở góc phải màn hình.
  4. Điền đầy đủ thông tin: Tiêu đề, loại BĐS (Đất nền, Nhà phố, Căn hộ...), giá (tính theo tỷ VNĐ), diện tích ($m^2$), vị trí địa chỉ và pháp lý.
  5. **Bắt buộc chọn Nguồn tin:** Tick chọn **Môi giới** hoặc **Chính chủ**.
  6. Tải ảnh thực tế và bấm **"Lưu tin đăng"**. Tin sẽ hiển thị ngay trong kho hàng của bạn và xuất hiện trên cổng công khai nếu để trạng thái `available`.

### Câu hỏi 1.2: Vì sao tôi không đăng được tin hoặc bị báo lỗi khi lưu tin?
- **Các cách diễn đạt khác:**
  - *Tôi bấm lưu tin BĐS nhưng hệ thống báo lỗi không cho tạo?*
  - *Tại sao tài khoản của tôi không có nút thêm bất động sản?*
- **Tài liệu nguồn:** `RAG-RULE-04`, `RAG-RBAC-02`.
- **Câu trả lời chuẩn:**
  Có 3 nguyên nhân phổ biến:
  1. **Thiếu trường bắt buộc:** Bạn chưa tick chọn mục **Nguồn tin** (Môi giới hoặc Chính chủ) hoặc chưa nhập mức giá/diện tích hợp lệ (phải là số dương).
  2. **Tài khoản chưa được phân quyền:** Tài khoản của bạn bị cấu hình quyền `property.write` là `none` trong ma trận phân quyền.
  3. **Lỗi phiên làm việc:** Token đăng nhập đã hết hạn. Bạn hãy đăng xuất và đăng nhập lại rồi thử lưu tin.

### Câu hỏi 1.3: Làm sao để tôi chỉnh sửa hoặc ẩn một tin bất động sản đã bán?
- **Các cách diễn đạt khác:**
  - *Nhà đã bán rồi thì cập nhật trạng thái ở đâu?*
  - *Cách gỡ tin hoặc đổi giá bán của một căn nhà?*
- **Tài liệu nguồn:** `RAG-GUIDE-03`, `RAG-RULE-04`.
- **Câu trả lời chuẩn:**
  1. Vào mục **Danh sách Bất động sản** trong trang quản trị.
  2. Tìm căn nhà/đất cần cập nhật và bấm vào biểu tượng chiếc bút **Chỉnh sửa** (Edit).
  3. Để đổi trạng thái: Tại ô **Trạng thái kinh doanh**, chuyển từ `available` (Đang bán) sang `sold` (Đã bán) hoặc `hidden` (Tạm ẩn).
  4. Để đổi giá/nội dung: Cập nhật trực tiếp số liệu mới.
  5. Bấm **"Cập nhật"**. Tin đã bán sẽ tự động không còn xuất hiện trên trang tìm kiếm công khai.

### Câu hỏi 1.4: Cho tôi xem giỏ hàng đi? Xem giỏ hàng bất động sản ở đâu?
- **Các cách diễn đạt khác:**
  - *Cho tôi xem giỏ hàng đi?*
  - *Xem giỏ hàng ở đâu?*
  - *Bấm vào đâu để xem bảng hàng bất động sản?*
- **Tài liệu nguồn:** `RAG-PROD-00`, `RAG-GUIDE-03`.
- **Câu trả lời chuẩn:**
  Hệ thống bdsdanang.site phân định rõ 2 phân hệ giỏ hàng tùy thuộc vào đối tượng người dùng:
  1. **Nếu bạn là Khách mua / Nhà đầu tư:** Bạn có thể xem giỏ hàng nhà đất công khai tại [Cổng tìm kiếm Bất động sản công khai](/bat-dong-san).
  2. **Nếu bạn là Chuyên viên môi giới nội bộ:** Bạn đăng nhập tài khoản và truy cập mục [Danh sách Bất động sản](/admin#properties) để xem và quản lý kho hàng nội bộ của mình và đội nhóm.

---

## NHÓM 2: CÂU HỎI VỀ MÃ GIỚI THIỆU & ĐỘI NHÓM (Mã: `FEAT-AUTH-REG`, `FEAT-TEAM-MGR`)

### Câu hỏi 2.1: Mã giới thiệu là gì? Tôi lấy mã giới thiệu ở đâu để đưa cho nhân viên?
- **Các cách diễn đạt khác:**
  - *Mã referral dùng để làm gì?*
  - *Làm sao để tôi tuyển thêm sale vào nhóm của mình?*
  - *Tao muốn tuyển thêm đàn em vô đội nhóm thì gửi cái gì cho tụi nó?*
  - *Xem mã mời của tôi ở chỗ nào?*
- **Tài liệu nguồn:** `RAG-RBAC-02`, `RAG-GUIDE-03`.
- **Câu trả lời chuẩn:**
  Mã giới thiệu (Referral Code) là một chuỗi ký tự duy nhất (dạng `REF-XXXXXX`) gắn liền với mỗi tài khoản.
  - **Mục đích:** Khi người khác đăng ký tài khoản và nhập mã của bạn, họ sẽ tự động được thêm vào Đội nhóm (Team) do bạn quản lý.
  - **Cách lấy mã:** Bạn đăng nhập vào hệ thống, bấm vào mục **Hồ sơ cá nhân** (`/admin#profile`). Tại đây, hệ thống hiển thị **Mã giới thiệu của bạn** (Ví dụ: `REF-UOWNER` hoặc mã riêng của bạn). Bạn sao chép mã này gửi cho nhân viên/thành viên mới.
  - **Duyệt thành viên:** Sau khi người mới đăng ký thành công có nhập mã, bạn vào mục **Quản lý Team** (`/admin#team`) để bấm nút **Duyệt (Approve)** cho họ vào nhóm chính thức.

### Câu hỏi 2.2: Tôi đã đăng ký tài khoản nhưng tại sao không xem được giỏ hàng của Team?
- **Các cách diễn đạt khác:**
  - *Tài khoản mới tạo báo "Chờ duyệt" là sao?*
  - *Tại sao tôi vào giỏ hàng mà không thấy các căn nhà của sàn?*
- **Tài liệu nguồn:** `RAG-RULE-04` (Mục 2.2), `RAG-GUIDE-03`.
- **Câu trả lời chuẩn:**
  Khi bạn đăng ký tài khoản có nhập mã giới thiệu, theo quy chế bảo mật, tài khoản của bạn sẽ ở trạng thái **Chờ duyệt (Pending Member)**:
  - Ở trạng thái này, bạn chỉ có thể đăng và xem các tin do chính bạn tạo ra.
  - Bạn **chưa thể xem giỏ hàng chung của Team** cho đến khi Trưởng nhóm (người sở hữu mã bạn đã nhập) đăng nhập vào mục **Quản lý Team** và bấm nút **Duyệt (Approve)** cho bạn.
  - Hãy liên hệ với Trưởng nhóm của bạn để được phê duyệt vào đội ngũ chính thức!

### Câu hỏi 2.3: Tôi lỡ đăng ký tài khoản mà quên không nhập mã giới thiệu thì có vào team được không?
- **Các cách diễn đạt khác:**
  - *Tài khoản tạo rồi chưa nhập mã giới thiệu có thêm vào team được không?*
  - *Cập nhật mã giới thiệu bảo trợ ở đâu sau khi đã có nick?*
- **Tài liệu nguồn:** `RAG-GUIDE-03` (Mục 2.2).
- **Câu trả lời chuẩn:**
  Hoàn toàn được! Bạn không cần tạo tài khoản mới. Hãy làm theo các bước sau:
  1. Đăng nhập vào tài khoản của bạn.
  2. Bấm vào mục **Hồ sơ cá nhân** (`/admin#profile`).
  3. Tìm đến ô **"Mã giới thiệu bảo trợ"**.
  4. Nhập mã giới thiệu của Trưởng nhóm bạn (Ví dụ: `REF-UOWNER` hoặc mã riêng của Leader).
  5. Bấm **"Lưu hồ sơ"**. Bạn sẽ được chuyển vào danh sách chờ duyệt của Team đó và nhờ Leader bấm Duyệt.

### Câu hỏi 2.4: Môi giới độc lập có thể xem và sửa toàn bộ giỏ hàng của các team khác trên hệ thống không?
- **Các cách diễn đạt khác:**
  - *Nghe nói tài khoản môi giới độc lập có thể xem và sửa toàn bộ giỏ hàng của các team khác trên hệ thống đúng không?*
  - *Tài khoản independent có xem được kho hàng của các đội nhóm khác không?*
- **Tài liệu nguồn:** `RAG-RBAC-02` (Mục 1, 3), `RAG-RULE-04`.
- **Câu trả lời chuẩn:**
  Không đúng. Theo ma trận phân quyền RBAC của hệ thống, tài khoản Môi giới Độc lập (`independent`) có phạm vi quyền hạn giỏ hàng là `own`. Bạn chỉ có quyền xem, đăng và chỉnh sửa bất động sản do chính mình tạo ra. Bạn **hoàn toàn không có quyền** xem, sửa hoặc can thiệp vào kho hàng nội bộ của các Đội nhóm (Team) khác trên hệ thống.

---

## NHÓM 3: CÂU HỎI DÀNH CHO KHÁCH HÀNG TÌM KIẾM BĐS (Mã: `FEAT-CATALOG`)

### Câu hỏi 3.1: Tôi có thể lọc tìm bất động sản theo quận huyện hoặc dự án tại Đà Nẵng không?
- **Các cách diễn đạt khác:**
  - *Tìm đất nền Nam Hòa Xuân hoặc FPT City ở đâu?*
  - *Tôi muốn tìm căn hộ Sơn Trà giá dưới 3 tỷ thì làm thế nào?*
- **Tài liệu nguồn:** `RAG-GUIDE-03` (Mục 1.1).
- **Câu trả lời chuẩn:**
  Có. Bạn có thể tìm kiếm rất dễ dàng:
  - Truy cập mục **Bất động sản** (`https://bdsdanang.site/bat-dong-san`).
  - Chọn khu vực mong muốn (Hải Châu, Sơn Trà, Ngũ Hành Sơn, Cẩm Lệ, Nam Hòa Xuân, FPT City...).
  - Chọn loại hình: Căn hộ, Đất nền, Biệt thự hoặc Nhà phố.
  - Chọn khung tài chính (Dưới 2 tỷ, 2-5 tỷ...).
  - Hệ thống sẽ hiển thị các sản phẩm đang có sẵn đúng với tiêu chí của bạn.

### Câu hỏi 3.2: Mức giá hiển thị trên website bdsdanang.site có chính xác không?
- **Các cách diễn đạt khác:**
  - *Giá nhà đất trên web là giá thật hay giá ảo?*
  - *Giá này có bao gồm phí sang tên sổ đỏ chưa?*
- **Tài liệu nguồn:** `RAG-RULE-04`, `AUDIT-DATA-02`.
- **Câu trả lời chuẩn:**
  Tất cả mức giá trên hệ thống bdsdanang.site đều được niêm yết theo đơn vị Tỷ đồng VNĐ dựa trên thông tin làm việc trực tiếp với chủ nhà hoặc đơn vị phân phối. Tuy nhiên, bất động sản là thị trường có tính biến động cao, giá có thể được thương lượng hoặc điều chỉnh theo từng thời điểm. Bạn nên bấm nút **"Gọi tư vấn"** để được chuyên viên cung cấp báo giá cập nhật và biểu phí chuyển nhượng chính xác nhất tại thời điểm quan tâm.

---

## NHÓM 4: CÂU HỎI VỀ CÔNG CỤ DESKTOP & GÓI BẢN QUYỀN (Mã: `FEAT-LIC-TOOL`)

### Câu hỏi 4.1: File cài đặt HouseAndLife-Agent-Setup.exe dùng để làm gì? Tải ở đâu?
- **Các cách diễn đạt khác:**
  - *Tool tự động hóa của sàn tải ở đâu?*
  - *Làm sao để tải bộ cài đặt phần mềm về máy tính Windows?*
- **Tài liệu nguồn:** `RAG-FEAT-01`, `RAG-GUIDE-03`.
- **Câu trả lời chuẩn:**
  - **Mục đích:** `HouseAndLife-Agent-Setup.exe` là phần mềm cài đặt dành cho máy tính Windows, giúp chuyên viên tự động hóa việc quét khách hàng tiềm năng trên mạng xã hội, đăng bài tiếp thị và đồng bộ dữ liệu với hệ sinh thái House & Life.
  - **Cách tải:** Bạn có thể tải trực tiếp file cài đặt an toàn tại đường dẫn: `https://bdsdanang.site/downloads/HouseAndLife-Agent-Setup.exe` (Dung lượng ~175MB).
  - **Kích hoạt:** Sau khi cài đặt, bạn đăng nhập bằng tài khoản chuyên viên hoặc nhập mã License Key được Super Admin cấp phát để sử dụng.

---

## NHÓM 5: CÂU HỎI NGOÀI PHẠM VI HOẶC CẦN HỖ TRỢ TRỰC TIẾP

### Câu hỏi 5.1: Tôi có thể đặt cọc online hoặc thanh toán tiền mua nhà trực tiếp qua website không?
- **Tài liệu nguồn:** `RAG-PROD-00`, `RAG-RULE-04`.
- **Câu trả lời chuẩn:**
  Không. Website bdsdanang.site là nền tảng tiếp thị số, giới thiệu thông tin và kết nối giao dịch giữa khách hàng, chuyên viên tư vấn và chủ sở hữu bất động sản. Hệ thống **không hỗ trợ** đặt cọc hoặc chuyển khoản thanh toán trực tuyến tiền mua bán nhà đất trên website. Mọi thủ tục đặt cọc, công chứng chuyển nhượng đều được thực hiện trực tiếp theo đúng quy định của pháp luật Việt Nam.
