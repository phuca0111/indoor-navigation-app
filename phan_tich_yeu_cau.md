# PHÂN TÍCH YÊU CẦU VÀ PHẠM VI DỰ ÁN

**Đề tài:** Hệ thống định vị và tìm đường đi trong nhà (Indoor Navigation System)
(Bao gồm Web Map Editor cho Quản trị viên và Android App cho Người dùng cuối) 

---

## 1. PHẠM VI DỰ ÁN (PROJECT SCOPE)

### 1.1. Những gì hệ thống SẼ LÀM (In-Scope)
Hệ thống giải quyết bài toán định vị và chỉ đường trong nhà mà không cần tín hiệu tĩnh (như GPS, Wifi, Bluetooth Beacons), hoạt động dựa trên phương pháp **PDR (Pedestrian Dead Reckoning)** kết hợp quét mã QR để khởi tạo điểm bắt đầu. Hệ thống giới hạn ở không gian 2D, áp dụng khả thi cho các tòa nhà vừa và nhỏ như trường học, bệnh viện, khu trung tâm thương mại.

**Web Map Editor (Dành cho Quản trị viên):**
Hệ thống web này đóng vai trò như một môi trường "số hóa không gian vật lý", cho phép người quản trị ánh xạ từ tòa nhà thực tế vào dữ liệu của ứng dụng di động:
1. **Thiết lập không gian nền (Base Map Layer):** Cho phép upload hình ảnh thiết kế mặt bằng (tầng 1, 2, 3...) dưới dạng ảnh bitmap (PNG/JPG) làm nền để so đối. Một project có thể quản lý nhiều bản đồ tầng khác nhau.
2. **Hệ thống công cụ vẽ linh hoạt (Drawing Toolbox):** Cung cấp giải pháp vẽ biên dạng phòng ban bằng nhiều khối hình:
   - *Polygon (Đa giác):* Vẽ các không gian có hình thù phức tạp, góc chéo, uốn lượn. Hỗ trợ đặt đỉnh tùy ý mà không bị gò bó bởi lưới (Disable grid snapping).
   - *Hình chữ nhật / Hình tròn:* Hỗ trợ thao tác kéo thả vẽ nhanh.
3. **Ứng dụng thuật toán phân vùng nhận diện (Magic Wand):** Giải pháp bán tự động hỗ trợ click chuột vào một vùng màu nhất định trên bản đồ nền, thuật toán (Color Flood-fill/Edge Detection) sẽ tự động nhận diện biên giới khu vực đó và khởi tạo luôn một khối đa giác phòng bao quanh, giúp tiết kiệm 80% thời gian so với vẽ tay đồ lại từng ranh giới.
4. **Quản trị lịch sử thao tác (State Management):** Tích hợp tính năng Undo/Redo đa cấp độ, cho phép quản trị viên khôi phục lại các thao tác sai (vẽ nhầm đỉnh, xóa nhầm phòng) tức thời. Tích hợp khả năng Edit trực tiếp (kéo thả lại các đỉnh Polygon đã vẽ).
5. **Định danh Điểm chức năng (POI & Doors):** Cung cấp bộ công cụ ghim lối ra vào (cửa) lên mặt tường của phòng ban. Cắm các điểm POI quan trọng như (Thang máy, Giao lộ cầu thang, Nhà vệ sinh, ATM) làm đích đến cho thuật toán tìm đường.
6. **Kiến tạo Mạng lưới dẫn đường (Path Routing Network):** Người quản trị sẽ cắm các Điểm (Node) dọc theo hành lang và nối chúng thành các Cạnh (Edge). Đây sẽ là "đường ray" đồ thị duy nhất để thuật toán `A*` tính toán khi dẫn người dùng đi, đảm bảo tính người dùng không bị dẫn đi "xuyên tường".
7. **Bản địa hóa dữ liệu (Export/Import JSON):** Toàn bộ dữ liệu tọa độ, tính chất, hệ thống đồ thị path-finding sẽ được đóng gói tải về dưới dạng tệp `.json` siêu nhẹ. Tệp chuẩn này có thể dùng để nạp ngược lại vào web (khi cần sửa) hoặc nhúng trực tiếp vào Android App để sử dụng offline.

**Android App (Dành cho Người dùng cuối):**
Ứng dụng di động này hoạt động trên cơ chế xử lý ngay trên thời gian thực (Real-time edge computing) trong thiết bị. Về **Mô hình Xuất bản App (Deployment Model)**, dự án đi theo hướng **Platform App (Một App duy nhất cho mọi Tòa nhà)**:
1. **Kiến trúc Tải dữ liệu Tự động (Dynamic Asset Loading):** Khách hàng chỉ cần cài đặt một ứng dụng gốc (Host App) duy nhất trên điện thoại. Khi đến một địa điểm (ví dụ: Bệnh viện A), người dùng có 2 cách để nạp dữ liệu:
   - *Cách 1:* Bật định vị (GPS). App sẽ gọi hàm gốc của thiết bị (Location Manager) để lấy tọa độ hiện tại (Vĩ độ, Kinh độ) **mà không dùng dịch vụ trả phí Google Maps API**. App chỉ việc đem cặp tọa độ này so sánh với toạ độ mốc của các tòa nhà sẵn có trên Database (áp dụng công thức toán học tính khoảng cách Haversine) để tìm ra tòa nhà gần nhất và gợi ý lên màn hình (Ví dụ: "Bạn đang ở ĐH Sài Gòn?").
   - *Cách 2:* Quét mã QR dán ngoài sảnh tòa nhà chứa cấu hình đường dẫn tải (Download Link).
   - *Cách 3:* Trực tiếp gõ từ khóa tìm kiếm tên tòa nhà trên thanh tìm kiếm của App.
   Ngay lập tức, App sẽ kết nối mạng (WiFi/4G) **tải một chạm** tải file cấu hình JSON cực nhỏ (chỉ vài trăm KB) của tòa nhà đó về lưu trong bộ nhớ tạm (Cache) của điện thoại.
   
   > **CƠ CHẾ DỰ PHÒNG NGOẠI LỆ (FAIL-SAFE / EDGE CASES):**
   > * **Trường hợp 2 tòa nhà nằm sát vách nhau:** GPS sai số 5-10m có thể chỉ nhầm. Giải pháp: App không tự động tải, mà sử dụng thuật toán Haversine để ném ra ListView "Gợi ý Top 3 tòa nhà gần nhất trong bán kính 1km" để người dùng tự xác nhận bấm chọn đúng nơi mình đến.
   > * **Trường hợp người dùng đi sâu vào trong nhà (mất sóng vệ tinh GPS) mới sực nhớ lấy App ra mở:** Lệnh gọi tọa độ GPS lúc này sẽ bị thất bại (Timeout). Phương án thay thế bắt buộc: Người dùng mở Tab Camera trên App quay vào mã QR dán trên cửa/cầu thang nội bộ (Cách 2) hoặc tự gõ tay tìm kiếm tên tòa nhà (Cách 3) để ép App kết nối 4G kéo Map JSON về. Không phụ thuộc vào GPS lõi.

2. **Vận hành Offline sau khi tải (Offline Navigation):** Việc sử dụng Internet chỉ bị bắt buộc đúng **1 lần duy nhất** lúc tải map JSON ban đầu. Sau khi bản đồ tòa nhà đó đã chui vào Cache, toàn bộ quá trình định vị, đếm bước chân và tìm đường `A*` sau đó sẽ tự chạy **100% Offline**. Điều này giải quyết triệt để vấn đề mất kết nối mạng ở các khu vực lõi bê tông kín sóng (như hành lang phòng X-quang, tầng hầm gửi xe).
3. **Xác định Vị trí Xuất phát trong nhà (Indoor Localization):** Nếu người dùng dùng **Cách 1 (GPS)** hoặc **Cách 3 (Gõ tìm kiếm)** ở trên, thì lúc này App *mới chỉ có được Bản đồ Tòa nhà*, chứ hoàn toàn chưa biết người dùng đang đứng ở cái sảnh hay cái toilet nào bên trong. Do đó, để bắt đầu định vị nội bộ, người dùng có 2 cách:
   - **Quét mốc QR (QR Check-in):** Đưa camera quét các mã QR tọa độ dán tại mỗi cửa phòng/cầu thang. App đối chiếu ID của QR để nhận biết *"À, User đang đứng chính xác ở tọa độ X,Y của Tầng 1"*.
   - **Ghim tay (Manual Pinning):** Nếu xung quanh không có mã QR, người dùng tự mở giao diện Bản đồ 2D Graphic trên app, bấm chạm ngón tay (Tap) vào vị trí mình dự đoán đang đứng (Ví dụ: Chạm vào biểu tượng Cổng chính, hoặc Cầu thang số 2). App sẽ dùng điểm chạm đó làm Điểm Xuất phát (Start Node).
4. **Hệ thống Tìm đường Thông minh (Pathfinding Engine):** Cung cấp thanh tìm kiếm thông minh thông qua văn bản (Text format) và tự động lọc đích đến. Tính toán tức thời lộ trình các Node ngắn nhất nối từ điểm ghim QR hiện tại tới Đích dựa trên giải thuật `A*`.
5. **Theo dõi Di chuyển Nội bộ (PDR Tracking System):** Khi người dùng cất bước đi, App khai thác con quay gia tốc (Accelerometer) để nhận diện cường độ nhịp bước gót chân (Step Counter), khai thác la bàn (Magnetometer) để biết hướng xoay. Liên tục tổng hợp và làm mượt dữ liệu (Sensor fusion) để dịch chuyển chấm xanh lam trên màn hình khớp theo tỉ lệ khoảng cách thực tế. 
   *(Lưu ý Bảo mật: Toàn bộ quá trình theo dõi hành trình này chỉ diễn ra cục bộ (Local) trên CPU của điện thoại. Hệ thống tuyệt đối **KHÔNG** gửi tọa độ bước đi của User về Server, đảm bảo quyền riêng tư tuyệt đối).*
6. **Chỉ dẫn Chặng đường (Turn-by-turn Navigation):** Hỗ trợ chỉ đường dưới dạng hộp văn bản tại các nút thắt cắt nhau (Ví dụ: Lộ trình phía trước rẽ phải thì hiện thẻ *"Đi tiếp 20 bước, rẽ phải"*).
7. **Nhận thức Đa không gian (Multi-floor Routing):** Nếu đích đến khác Tầng, thuật toán tự chia làm 2 chặng: Dẫn đến Thang máy gần nhất -> Hiện Popup hỏi User xác nhận đổi tầng -> Tự động nạp bản đồ JSON của tầng đích và dẫn tiếp.

### 1.2. Những gì hệ thống KHÔNG LÀM (Out-of-Scope)
- Không dùng tín hiệu vô tuyến (Wifi Fingerprinting, Bluetooth iBeacons, RFID) để định vị tự động. Nghĩa là phải quét QR để xác thực lại vị trí nếu đi sai lệch quá xa.
- Không có thiết kế 3D. Bản đồ tải lên hoàn toàn là hình chiếu mặt phẳng 2D.
- Web Map Editor không phải là một phần mềm thay thế phần mềm AutoCAD chuyên nghiệp. Ứng dụng tập trung thiết kế logic đồ thị nội suy hướng đi dựa trên hình ảnh mặt bằng có sẵn.
- Cấm lưu trữ hành trình (No Live Tracking Tracking): App không cung cấp tính năng lưu trữ lịch sử đi lại của Người dùng lên máy chủ hoặc theo dõi vị trí người khác (Live tracking user-to-user) vì mục đích bảo mật quyền riêng tư.

---

## 2. PHÂN TÍCH YÊU CẦU NGƯỜI DÙNG (USER REQUIREMENTS)

### 2.1. Quản trị viên (Người dùng Web Map Editor)
**Phân tích Chân dung Người dùng (User Persona):**
- **Họ là ai?** Nhân viên IT của tòa nhà, ban quản trị cơ sở vật chất, hoặc nhân sự hành chính được giao quyền số hóa bản đồ tòa nhà.
- **Kiến thức chuyên môn:** Họ là người am hiểu thực địa, nắm rõ sơ đồ bố trí các phòng ban, lộ trình, cấu trúc của tòa nhà trong thực tế.
- **Kiến thức kỹ thuật (Đòi hỏi Thấp):** 
  - **KHÔNG YÊU CẦU** kiến thức về lập trình, đọc mã nguồn, hay quản trị cơ sở dữ liệu.
  - **KHÔNG YÊU CẦU** kiến thức kỹ sư xây dựng, đọc hiểu bản vẽ CAD chuyên sâu hay biết sử dụng các phần mềm vẽ kỹ thuật phức tạp (như AutoCAD, Revit, 3ds Max).
- **Thói quen sử dụng:** Mong muốn một công cụ "Kéo và Thả" (Drag & Drop) dễ nhìn, có sẵn giao diện trực quan thay vì phải cấu hình các thông số ẩn.
- **Yếu tố kiên nhẫn:** Đòi hỏi sửa sai nhanh (Undo/Redo), dễ nản chí nếu phải đồ lại (vẽ lại) viền phòng thủ công quá lâu, do đó chức năng "Magic Wand (Tự bắt dính màu nền)" là tính năng trọng yếu hỗ trợ nhóm người dùng này.

**Yêu cầu của dự án đối với người dùng này (Pre-requisites & Supported Platforms):** 
- **Nền tảng Phần cứng (Hardware Platform):** Bắt buộc sử dụng Máy tính để bàn (PC) hoặc Laptop cá nhân. Hệ thống **KHÔNG TỐI ƯU** để vẽ trên Điện thoại thông minh (Smartphone) hay Máy tính bảng (Tablet) do các thao tác vẽ đa giác (Polygon), chỉnh sửa đỉnh, và nối các điểm chỉ đường (Path Nodes) đòi hỏi độ chính xác tuyệt đối của con trỏ chuột.
- **Hệ điều hành (Cross-platform OS):** Hoạt động độc lập với nền tảng phần cứng. Quản trị viên có thể vẽ trên mọi hệ điều hành phổ biến: **Windows, macOS, hoặc Linux**.
- **Môi trường Phần mềm (Software Environment):** Vì Web Map Editor là một Web-App (Ứng dụng nền Web), người dùng chỉ cần một Trình duyệt web hiện đại (Google Chrome, Microsoft Edge, Apple Safari, Mozilla Firefox). Mọi thao tác vẽ đồ họa đều được xử lý cục bộ trên nền tảng `HTML5 Canvas` của trình duyệt mà không cần cài đặt thêm bất kỳ phần mềm bên thứ ba nào (như AutoCAD, Java Runtime hay Flash).
- Cần chuẩn bị sẵn tệp hình ảnh mặt bằng của khu vực cần vẽ (định dạng ảnh phổ biến như JPG/PNG).

**Yêu cầu Đào tạo (Training & Onboarding):**
- **Không yêu cầu khóa đào tạo tập trung kéo dài:** Vì giao diện được thiết kế theo chuẩn kéo thả trực quan (như Paint/Figma cơ bản), người dùng thao tác qua các biểu tượng công cụ quen thuộc (Hình chữ nhật, Đa giác, Nút Undo/Redo).
- **Phạm vi học hỏi ngắn hạn:** Chỉ cần cung cấp một cuốn **Tài liệu Hướng dẫn Sử dụng (User Manual)** từ 5 - 10 trang kèm hình minh họa quy trình: *(1) Tải ảnh nền -> (2) Kéo vẽ viền phòng -> (3) Đặt Icon cửa, WC -> (4) Kéo rải Path rễ cây ngoài hành lang -> (5) Bấm Download JSON*.
- Thời gian dự kiến để Quản trị viên làm quen và có thể tự dựng bản đồ một tầng lầu có độ phức tạp trung bình là **dưới 30 phút**.

**Tại sao hệ thống vẫn CẦN BẮT BUỘC một vai trò Quản trị viên chuyên biệt?**
Mặc dù bạn có thể lập luận "Bản đồ tòa nhà xây xong thì ít khi thay đổi tường / hành lang", tuy nhiên vai trò Quản trị viên nội bộ vẫn sống còn vì:
1. **Sự thay đổi về công năng (POI):** Dù bức tường không dời đi, nhưng *công năng* phòng chức năng luôn thay đổi. Hôm nay là "Phòng họp A", tháng sau đổi thành "Phòng Giám đốc", khu vực góc bị đập đi xây "Máy ATM" mới. Quản trị viên cần công cụ map editor để vào sửa đổi (Edit) Meta-data của POI/Phòng bất kỳ lúc nào mà không cần phải gọi thợ lập trình viết lại app.
2. **Cập nhật đồ thị dẫn đường (Rerouting):** Khi tòa nhà bảo trì hành lang A, Quản trị viên cần vào xóa tạm thời Path Edge (đoạn đường) đó, xuất lại file JSON để người dùng App không bị dẫn vào khu bảo trì.
3. **Mở rộng theo quy mô (Scalability):** Tòa nhà có thể cơi nới thêm Tầng 3, Tầng 4. Quản trị viên sẽ là người mở thêm Project mới để vẽ tiếp bản đồ cho các tầng mới này một cách độc lập.

**Mong muốn cốt lõi:** Một công cụ thao tác nhanh, đồ họa trực quan, có khả năng giảm mức độ làm việc thủ công (manual work).

**Yêu cầu chức năng chi tiết (Hệ thống cần đáp ứng):**
| Mã YC | Chức năng (Feature) | Mô tả & Chấp nhận hiệu suất (Acceptance) |
|---|---|---|
| REQ-W-01 | Quản lý mặt bằng | Tải lên ảnh mặt bằng không gian. Có chức năng zoom/pan canvas không giật lag. |
| REQ-W-02 | Công cụ tạo khối (Rooms/Areas) | Gồm công cụ hình chữ nhật, hình tròn, đa giác (Polygon). Được phép đặt đỉnh đa giác tự do tùy chỉnh, không giới hạn snap. |
| REQ-W-03 | Magic Wand Auto-detect (Phân tích ảnh màu) | Người dùng nhấp chuột vào không gian trong ảnh mặt bằng nhiều màu → Hệ thống tự khoanh vùng ranh giới hình học tương đối của phòng đó. |
| REQ-W-04 | Sửa đổi cấp tốc (Undo/Redo/Edit) | Quản trị có thể hoàn tác vô hạn số bước. Có thể click vào thuộc tính phòng/POI để đổi tên, chọn màu nền nhanh thông qua bảng Properties. |
| REQ-W-05 | Định tuyến lối đi (Path Maker) | Công cụ thả Node tại hành lang; Nối các Node bằng Edge tạo thành một đồ thị. |
| REQ-W-06 | Điểm chức năng (POIs & Doors) | Gắn cửa sổ, lối ra vào lên sát rìa phòng. Thả điểm POI (WC, ATM, Thang gác) trên canvas và gắn nhãn loại POI. |
| REQ-W-07 | Định dạng tập tin | Nút lưu (Save) tạo ra file `.json` nhẹ gọn tải về máy cục bộ. Nút tải (Open) đọc `.json` khôi phục lại Canvas đồ họa chính xác tuyệt đối. |

### 2.2. Người dùng cuối (Người dùng Android App)
**Phạm vi đối tượng:** Khách tham quan, sinh viên, bệnh nhân, người giao hàng,... đến thăm tòa nhà lần đầu hoặc không rành đường bộ nội khu, cần chỉ dẫn để tìm một đích đến cụ thể (phòng ban, nhà vệ sinh, thang máy).

**Yêu cầu của dự án đối với người dùng này (Pre-requisites):**
- Sở hữu điện thoại thông minh chạy hệ điều hành **Android**.
- Thiết bị bắt buộc phải có **Camera** hoạt động bình thường (để quét mã QR mốc tọa độ).
- Thiết bị bắt buộc phải có các cảm biến vật lý cơ bản: **Cảm biến gia tốc (Accelerometer)** và **Cảm biến từ trường/La bàn (Magnetometer)**. (Thực tế >95% smartphone hiện đại đều trang bị để la bàn hoạt động).
- Phải cấp quyền truy cập Camera cho ứng dụng trong lúc quét QR.
- (Không yêu cầu bật kết nối mạng Internet 3G/4G/Wifi hay GPS khi sử dụng).

**Mong muốn cốt lõi:** Ứng dụng chỉ đường tối giản, chính xác, không bắt buộc tải data hay phụ thuộc vào kết nối mạng chập chờn lõi bê tông.

**Yêu cầu chức năng chi tiết (Hệ thống cần đáp ứng):**
| Mã YC | Chức năng (Feature) | Mô tả & Chấp nhận hiệu suất (Acceptance) |
|---|---|---|
| REQ-A-01 | Quét mốc (Localization) | App mở camera (sử dụng ML Kit thư viện nhẹ) quét QR Code 1 giây để xác định Điểm Xuất Phát (Ví dụ: Đang đứng ở Cửa thang máy Tầng 1). |
| REQ-A-02 | Search POI/Room (Tìm kiếm) | Một công cụ tìm kiếm có autocomplete (gõ "Phòn", hiện "Phòng vệ sinh", "Phòng 301"). Không phân biệt HOA/thường chữ Việt. |
| REQ-A-03 | Lộ trình A* (Pathfinding) | Vẽ mảng đường đi có màu sắc phản quang rõ rệt chiếu từ Vị trí xuất phát tới Điểm Đích trên Map. Tính toán tức thời (< 1 giây). |
| REQ-A-04 | Khởi chạy PDR (Đồng bộ di chuyển) | Hệ thống theo dõi thông qua cảm biến nội tại (Inertial Sensors):<br>- **Gia tốc kế (Accelerometer):** Thuật toán phát hiện đỉnh sóng để nhận biết khi nào người dùng vừa bước xong 1 bước, quy đổi ra `~0.6m - 0.7m`.<br>- **La bàn (Magnetometer):** Nhận diện góc quay của thiết bị (heading) để biết người dùng đang hướng về đâu (Ví dụ: Quay góc 90 độ sang trái).<br>=> Từ đó app tự động tịnh tiến chấm xanh vị trí trên màn hình bản đồ tương ứng với thế giới thực. |
| REQ-A-05 | Hướng dẫn chặng (Turn-by-turn Navigation)| Cắt lộ trình đường cong thành các đoạn thẳng, chỉ rõ cho người dùng tại các khúc cua. Ví dụ: *"Đi thẳng 10 bước nữa"*, *"Rẽ trái tại giao lộ tiếp theo"*. |
| REQ-A-06 | Sai số và Sửa lỗi (Check-in/Re-route) | Vì PDR có sự tích lũy sai số (drift) sau khi đi một quãng đường quá dài (ví dụ > 50m). Nếu dạo diện chấm xanh bay xuyên tường hoặc người dùng cảm thấy đi sai đường, app cho phép bấm nút "Quét lại QR gần nhất" để sửa lỗi tọa độ hiện tại và vẽ lại đường đi mới. |
| REQ-A-07 | Đổi tầng thông minh | Thiết lập cơ chế Node "Cầu thang/Thang máy" liên kết 2 tầng. Ứng dụng sẽ dẫn người dùng tới thang máy tầng hiện tại, yêu cầu người dùng xác nhận "Tôi đã lên phòng Tầng 2", sau đó app lập tức chuyển sang bản đồ Tầng 2 và tiếp tục dẫn đến đích. |

---

## 3. YÊU CẦU PHI CHỨC NĂNG (NON-FUNCTIONAL REQUIREMENTS)

### 3.1. Hiệu suất & Tối ưu (Performance)
- **Web Editor:** Thuật toán Magic Wand trích xuất màu trên hình ảnh phân giải <=4K chịu độ trễ chấp nhận được dưới 2 giây. Thao tác vẽ có Undo/Redo phản hồi dưới `100ms`.
- **Android App:** Kích thước gói cài đặt APK nhỏ (<50MB). Chỉ số tìm đường với ~500 điểm Nodes phải trả về liên tục dưới `0.5s`, tránh để lộ trình bị vẽ chậm sau khi chọn đích.
- **Năng lượng:** Quá trình PDR sử dụng luồng (Thread) ngầm cảm biến, cần Sleep khi không di chuyển nhằm kiểm soát pin hiệu quả trên các thiết bị trung bình yếu.

### 3.2. Tính khả dụng (Usability & Thiết kế)
- Giao diện chia rõ 3 phần: Thanh Công Cụ (trái), Khu vực thiết kế (giữa), Bảng thuộc tính (phải) tuân chuẩn editor hiện đại.
- Ứng dụng Andoid đơn giản tới mức "Mở ra → Quét QR → Đi", tuân thủ quy chuẩn thiết kế Material Design 3 của Google.

### 3.3. Bảo mật & Triển khai
- Không yêu cầu cung cấp quyền định vị vị trí toàn cầu (GPS) nguy hiểm. File JSON truyền vào cấu trúc dự án offline dưới định dạng mã hóa hoặc raw Asset nội bộ bảo vệ dữ liệu sơ đồ an ninh của trụ sở (Khu tránh đột nhập).

---

## 4. ĐẶC TẢ HỆ THỐNG (SYSTEM SPECIFICATIONS)

Dựa trên các yêu cầu đã phân tích, hệ thống được đặc tả thành các Ca sử dụng (Use Cases) cốt lõi như sau:

### 4.1. Tác nhân hệ thống (Actors)
Hệ thống bao gồm 2 tác nhân chính:
1. **Admin (Quản trị viên):** Người tương tác với Web Map Editor để khởi tạo và phân phối dữ liệu không gian.
2. **End-User (Người dùng cuối):** Người tương tác với Android App để nhận chỉ đường trong không gian thực.

### 4.2. Đặc tả Use Case cho Web Map Editor (Admin)

| Use Case ID | Tên Use Case | Mô tả ngắn gọn | Luồng sự kiện chính (Main Flow) |
|-------------|--------------|-----------------|----------------------------------|
| `UC-W01` | **Tải ảnh mặt bằng** | Khởi tạo dự án hoặc thay đổi nền bản đồ. | 1. Chọn "Upload Image". <br> 2. Hệ thống load ảnh lên Canvas 2D. |
| `UC-W02` | **Vẽ Đa giác phòng (Polygon)** | Vẽ ranh giới phòng tự do không phụ thuộc lưới. | 1. Chọn công cụ "Polygon". <br> 2. Click tuần tự tạo các đỉnh. <br> 3. Double-click để chốt hình. |
| `UC-W03` | **Khoanh vùng thông minh (Magic Wand)** | Tự động tạo Polygon dựa vào màu sắc vùng chọn. | 1. Bật công cụ "Magic Wand". <br> 2. Click vào khoảng trống màu của phòng. <br> 3. Thuật toán Flood-fill bám viền và sinh ra khối đa giác tương ứng. |
| `UC-W04` | **Phục hồi thao tác (Undo/Redo)** | Sửa sai khi lỡ tay vẽ nhầm. | 1. Bấm tổ hợp `Ctrl+Z` (Undo). <br> 2. Trạng thái Canvas lùi lại 1 bước trong Stack. |
| `UC-W05` | **Quản lý Thuộc tính (Properties)** | Đặt tên, màu sắc, loại phòng. | 1. Click chọn một Polygon/POI bất kỳ. <br> 2. Sửa thông tin ở Panel bên tay phải. |
| `UC-W06` | **Thiết lập Đồ thị (Path Nodes/Edges)**| Vẽ mạng lưới dẫn đường cho App. | 1. Chọn công cụ "Path Mode". <br> 2. Click tạo Node. <br> 3. Kéo chuột nối 2 Node thành Edge. |
| `UC-W07` | **Xuất / Nhập JSON (Export/Import)** | Lưu trữ bản đồ thành file cài đặt cho App. | 1. Chọn "Export JSON". <br> 2. Trình duyệt tải tệp `map_data.json` chứa tọa độ các mảng dữ liệu. |

### 4.3. Đặc tả Use Case cho Android App (End-User)

| Use Case ID | Tên Use Case | Mô tả ngắn gọn | Luồng sự kiện chính (Main Flow) |
|-------------|--------------|-----------------|----------------------------------|
| `UC-A01` | **Quét QR khởi tạo (QR Check-in)** | Xác định vị trí và tầng hiện tại. | 1. Mở App, đưa camera quét mã QR dán trên tường. <br> 2. App đối chiếu ID QR để hiện chấm Start Point (Xuất phát). |
| `UC-A02` | **Tìm kiếm Đích đến (Search Destination)**| Chọn nơi muốn đến qua thanh gõ chữ. | 1. Gõ ký tự vào ô tìm kiếm. <br> 2. App lọc danh sách các POI/Phòng. <br> 3. Người dùng chọn 1 kết quả làm Target. |
| `UC-A03` | **Tính toán A* (Navigate)** | Vẽ lộ trình tối ưu trên màn hình. | 1. App gọi hàm `A_Star_Search(Start, Target)`. <br> 2. Trả về mảng các Node ngắn nhất nối liền 2 điểm. |
| `UC-A04` | **Định vị bước chân (PDR Tracking)** | Tịnh tiến biểu tượng người dùng di chuyển. | 1. Bắt đầu đi bộ. <br> 2. Cảm biến đếm bước (Accelerometer) và đo hướng (Magnetometer) cập nhật liên tục biến X, Y. <br> 3. Chấm xanh nhích lên theo tỷ lệ map. |
| `UC-A05` | **Đổi Tầng (Floor Transition)** | Định tuyến qua thang máy. | 1. Hệ thống phát hiện Target khác tầng. <br> 2. Lộ trình dẫn đến Thang máy gần nhất. <br> 3. App hiện Box xác nhận: "Đã lên tầng 2?". <br> 4. Load map tầng 2 và dẫn tiếp. |

### 4.4. Cơ chế Tính tỷ lệ Bản đồ (Map Scale Ratio)
Để hệ thống PDR (Đếm bước chân ngoài đời thực bằng **mét**) có thể dịch chuyển chính xác dấu chấm trên màn hình điện thoại (đơn vị **pixel**), hệ thống bắt buộc phải tính toán hệ số quy đổi `scale_ratio`.

**Công thức quy đổi cốt lõi:**
`1 Pixel trên Web Canvas = X Mét ngoài đời thực`

**Cách hệ thống lấy được hệ số `scale_ratio` này:**
1. **Trên Web Map Editor (Admin thao tác một lần duy nhất):**
   * Quản trị viên upload ảnh mặt bằng (Ví dụ ảnh kích thước `1000px * 800px`).
   * Quản trị viên dùng công cụ "Thước đo" (Ruler Tool) vẽ một đoạn thẳng nối 2 điểm mà họ *biết chắc chắn khoảng cách ngoài đời*. 
   * *Ví dụ:* Kéo một đường dọc theo chiều dài một đoạn hành lang dài `200 pixel` trên màn hình. Sau đó Web yêu cầu nhập khoảng cách thực tế. Admin gõ vào `"10 mét"`.
   * Web tự động tính khoảng cách tỷ lệ: `Scale_Ratio = 10 (mét) / 200 (pixel) = 0.05 mét/pixel`. Cứ 1 pixel = 5 centimet.
   * Hệ số `0.05` này được đóng gói cứng vào file `building_data.json`.

2. **Trên Android App (App chạy realtime):**
   * App đọc JSON và nhớ hệ số `scale_ratio = 0.05`.
   * Người dùng cầm điện thoại bắt đầu đi. Cảm biến gia tốc phát hiện người dùng vừa đi được 1 bước (khoảng `0.6 mét`).
   * App tính toán độ dời trên tọa độ màn hình: `0.6 mét / 0.05 = 12 pixels`.
   * La bàn báo người dùng đang đi lệch góc `45 độ` so với hướng Bắc.
   * => Chấm xanh lam trên màn hình điện thoại sẽ tự động dịch chuyển **12 pixels** theo góc **45 độ**.

### 4.5. Đặc tả Cấu trúc Dữ liệu Cốt lõi (JSON Schema)
Sợi dây liên kết duy nhất giữa Web Editor và App là cục dữ liệu JSON được thiết kế nhỏ gọn để xử lý ở Edge-device.

**Cấu trúc tệp `building_data.json` bao gồm:**
```json
{
  "settings": {
    "scale_ratio": 0.05, // 1 pixel = 0.05 mét thực tế
    "bg_image": "base64_string_or_path" 
  },
  "rooms": [
    { "id": "r1", "name": "Phòng 301", "color": "#FF5733", "type": "polygon", "points": [ {"x":10, "y":20}, {"x":50, "y":20}, ... ] }
  ],
  "pois": [
    { "id": "p1", "type": "wc_male", "x": 100, "y": 150 }
  ],
  "path_nodes": [
    { "id": "n1", "x": 50, "y": 60, "is_elevator": false }
  ],
  "path_edges": [
    { "source": "n1", "target": "n2", "distance": 15.5 } // Khoảng cách giữa 2 node
  ]
}
```
*(Cấu trúc này cho phép App trên Android parse trực tiếp thành Obj và đưa vào giải thuật A* với mảng `path_nodes` và `path_edges` ngay lập tức).*
