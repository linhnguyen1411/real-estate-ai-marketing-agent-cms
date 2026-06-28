import type { InvestmentReportContent } from '../types/leadMagnetContent';

export const INVESTMENT_REPORT_2026: Omit<InvestmentReportContent, 'source' | 'sourceLabel'> = {
  type: 'investment-report',
  edition: 'Ấn bản Q2 · 2026',
  publisher: 'Estoria Research · Nam Đà Nẵng',
  chapters: [
    {
      number: 1,
      title: 'Thị trường Nam Đà Nẵng đang dịch chuyển đi đâu?',
      blocks: [
        {
          kind: 'prose',
          id: 'ch1-intro',
          paragraphs: [
            'Trong mười năm qua, trọng tâm phát triển đô thị Đà Nẵng đã lệch rõ về phía Nam. Không còn là vùng ven ngoại ô — Nam Hòa Xuân, Hòa Quý, Mai Đăng Chơn và hành lang FPT City đã hình thành chuỗi dân cư, giáo dục và việc làm có thể đo được bằng số hộ nhận nhà, lưu lượng xe buýt và mật độ kinh doanh ban đêm.',
            'Dòng người vào khu vực này không chỉ từ nội thành cũ. Cán bộ, kỹ sư và chủ doanh nghiệp vừa chuyển về từ Hà Nội, TP.HCM hoặc nước ngoài thường chọn Nam vì giá vào thấp hơn trung tâm, hạ tầng mới và khoảng cách tới sân bay ngắn. Dòng vốn theo sau: mua để ở, mua cho thuê dài hạn hoặc giữ đất chờ hạ tầng — mỗi nhóm có chu kỳ và thanh khoản khác nhau.',
          ],
        },
        {
          kind: 'zone-focus',
          id: 'ch1-nam-hoa-xuan',
          zone: 'Nam Hòa Xuân',
          paragraphs: [
            'Nam Hòa Xuân là phân khu đã có cư dư ở thực: đường nội bộ thông, siêu thị mini và trường học hoạt động. Giá đất nền và nhà phố tại đây phản ánh phần lớn tiến độ dân cư — không còn là kỳ vọng trên bản đồ quy hoạch.',
            'Điểm cần theo dõi: tốc độ bàn giao các phân khu còn lại, mức chênh giá giữa lô mặt tiền và lô hẻm, và số giao dịch thứ cấp thực tế mỗi quý (không chỉ tin đăng).',
          ],
        },
        {
          kind: 'zone-focus',
          id: 'ch1-hoa-quy',
          zone: 'Hòa Quý',
          paragraphs: [
            'Hòa Quý nối Nam Hòa Xuân với ven biển và trục Võ Chí Công. Khu tái định cư Bá Tùng, Làng Đại học và các khu công nghiệp nhẹ tạo lớp lao động trẻ — nhu cầu thuê nhà phố và căn hộ dịch vụ ổn định hơn vùng chỉ có đất trống.',
            'Cơ quan hành chính và doanh nghiệp lớn dần chuyển văn phòng hoặc chi nhánh về Nam khiến nhân viên trung cấp tìm nhà trong bán kính 15 phút lái xe. Đây là lớp khách thuê ít biến động theo mùa du lịch.',
          ],
        },
        {
          kind: 'zone-focus',
          id: 'ch1-mai-dang-chon',
          zone: 'Mai Đăng Chơn',
          paragraphs: [
            'Mai Đăng Chơn ven sông Cổ Cò là trục đô thị mới với shophouse, mặt tiền kinh doanh và đất nền ven sông. Tiến độ từng block khác nhau — mua theo block đã có điện nước và ít nhất một hàng shophouse khai trương an toàn hơn mua theo slide tổng thể.',
            'Footfall cuối tuần tại các tuyến phố đã mở là chỉ số sống động thực, quan trọng hơn render 3D.',
          ],
        },
        {
          kind: 'zone-focus',
          id: 'ch1-fpt',
          zone: 'FPT City & Làng Đại học',
          paragraphs: [
            'FPT City và cụm Làng Đại học tạo nhu cầu thuê ổn định từ sinh viên, giảng viên và nhân sự công nghệ. Căn hộ ven sông Hàn và các phân khu Sun Group phục vụ tệp này — nhưng yield phải trừ phí quản lý và tỷ lệ trống phòng mùa hè.',
            'Chợ đầu mối Hòa Cường và các trung tâm logistics phía Nam hỗ trợ việc làm phi nông nghiệp — gắn với nhu cầu nhà ở xã hội và nhà phố cho thuê gia đình.',
          ],
        },
        {
          kind: 'prose',
          id: 'ch1-infra',
          heading: 'Hạ tầng và trục giao thông',
          paragraphs: [
            'Các tuyến Võ Chí Công, Nguyễn Tất Thành mở rộng và cầu vượt nối Nam với trung tâm đã giảm thời gian di chuyển thực tế. Quy hoạch metro Đà Nẵng (nếu được phê duyệt và khởi công theo lộ trình chính thức) sẽ ảnh hưởng mạnh tới giá đất ven ga — hiện tại chỉ nên dùng làm kịch bản dài hạn, không định giá như đã có ga.',
            'Sân bay Quốc tế cách Nam khoảng 15–20 phút ô tô — lợi thế cho khách làm việc bay thường xuyên và cho thuê ngắn hạn có kiểm soát.',
          ],
        },
      ],
    },
    {
      number: 2,
      title: 'Căn hộ Sun Group',
      blocks: [
        {
          kind: 'prose',
          id: 'ch2-intro',
          paragraphs: [
            'Sun Group chi phối phân khúc căn hộ cao cấp ven biển và ven sông Hàn tại Đà Nẵng. Dưới đây là đánh giá theo từng dòng sản phẩm — tách khách mua ở, khách mua cho thuê, thanh khoản thứ cấp và hạn chế vận hành. Không liệt kê tiện ích marketing.',
          ],
        },
        {
          kind: 'product-segment',
          id: 'ch2-symphony',
          name: 'Sun Symphony',
          buyerProfile:
            'Gia đình trung lưu muốn căn lớn ven sông, ưu tiên không gian và thương hiệu chủ đầu tư. Thường mua để ở hoặc giữ 5–7 năm.',
          renterProfile:
            'Chuyên gia nước ngoài, giám đốc chi nhánh, gia đình có con học trường quốc tế — thuê dài hạn, ít nhạy giá 1–2 triệu/tháng.',
          liquidity:
            'Thanh khoản thứ cấp trung bình: vòng bán 4–9 tháng nếu giá trong nhóm 25% thấp nhất các tin tương đương. Căn view sông bán nhanh hơn căn hướng nội.',
          strengths:
            'Vị trí ven sông Hàn, quy mô quần thể, pháp lý sổ hồng khi đã bàn giao. Giá giữ tốt hơn phân khúc thấp khi thị trường điều chỉnh.',
          limitations:
            'Giá vào cao, phí quản lý resort ăn yield. Cung chuyển nhượng dày khiến giá thuê khó tăng nhanh.',
          strategyFit:
            'Tích lũy kèm ở thực; cho thuê chỉ khi đã có số liệu thuê 3 căn tương đương trong cùng tòa.',
        },
        {
          kind: 'product-segment',
          id: 'ch2-slight',
          name: 'Sun S-Light',
          buyerProfile:
            'Nhà đầu tư vốn 2–4 tỷ tìm căn nhỏ ven biển hoặc ven đô thị Sun, chấp nhận diện tích compact.',
          renterProfile:
            'Lao động trẻ FPT, cặp đôi làm việc tại khu công nghệ — thuê 6–12 tháng, nhạy giá.',
          liquidity:
            'Thanh khoản cao hơn Symphony nhờ tổng giá thấp. Bán lại 3–6 tháng nếu pricing đúng comps.',
          strengths:
            'Vốn vào thấp nhất trong hệ Sun, dễ cho thuê studio/1PN. Phù hợp thử nghiệm dòng tiền.',
          limitations:
            'Biên lợi nhuận mỏng sau phí quản lý. Cạnh tranh homestay và căn second-hand cùng tòa.',
          strategyFit:
            'Dòng tiền ngắn hạn; không kỳ vọng tăng giá mạnh như đất nền Nam.',
        },
        {
          kind: 'product-segment',
          id: 'ch2-cora',
          name: 'Sun Cora',
          buyerProfile:
            'Khách muốn căn 2PN–3PN trong hệ sinh thái Sun, cân bằng giữa ở và cho thuê gia đình.',
          renterProfile:
            'Gia đình nhỏ, giáo viên, nhân viên ngân hàng — hợp đồng thuê 12–24 tháng.',
          liquidity:
            'Thị trường thứ cấp sôi động nhất trong các dòng Sun tầm trung. Median days-on-market thấp hơn Symphony.',
          strengths:
            'Cân bằng diện tích/giá, nhu cầu thuê gia đình ổn định. Dễ so sánh comps.',
          limitations:
            'Nhiều đợt bàn giao tạo áp lực cung thuê. View và tầng ảnh hưởng mạnh giá chào.',
          strategyFit:
            'Buy-to-rent có quản lý chuyên nghiệp; kiểm tra phí quản lý trước khi tính yield ròng.',
        },
        {
          kind: 'product-segment',
          id: 'ch2-fours',
          name: 'Sun FourS / Fours',
          buyerProfile:
            'Tệp trẻ, single hoặc đôi, mua căn view đẹp để ở hoặc flip ngắn trong chu kỳ thị trường ấm.',
          renterProfile:
            'Khách thuê ngắn hạn và lao động khu ven sông — biến động theo mùa.',
          liquidity:
            'Thanh khoản tốt khi thị trường sôi; chậm lại rõ khi cung second-hand tăng.',
          strengths:
            'Thiết kế hiện đại, thu hút khách thuê trẻ. Giá/m² trung bình trong hệ Sun.',
          limitations:
            'Chính sách cho thuê ngắn hạn từng tòa khác nhau — phải đọc nội quy trước mua.',
          strategyFit:
            'Lướt sóng ngắn (6–18 tháng) chỉ khi có comps và vốn không gắn đòn bẩy cao.',
        },
        {
          kind: 'product-segment',
          id: 'ch2-spana',
          name: 'Sun Spana',
          buyerProfile:
            'Khách tìm căn premium, view biển hoặc view pháo hoa, ngân sách trên 5 tỷ.',
          renterProfile:
            'Khách thuê cao cấp, expat, staycation — thuê ngắn và dài đều có, phụ thuộc quy chế tòa.',
          liquidity:
            'Thanh khoản thấp hơn Cora/S-Light do giá cao. Bán gấp thường phải chiết khấu 5–10%.',
          strengths:
            'View biển hoặc pháo hoa khó thay thế trong phân khúc luxury local.',
          limitations:
            'Vốn khóa lâu; chi phí nội thất và bảo trì cao. Yield ròng thường thấp hơn slide bán hàng.',
          strategyFit:
            'Giữ dài hạn hoặc vận hành lưu trú chuyên nghiệp — không mua theo mô hình thuê 12 tháng đơn giản.',
        },
        {
          kind: 'product-segment',
          id: 'ch2-riverside',
          name: 'Căn hộ ven sông Hàn',
          buyerProfile:
            'Khách ưu tiên giao thông nội đô, đi bộ ven sông, làm việc trung tâm.',
          renterProfile:
            'Chuyên gia, nhân viên khách sạn trung tâm, giáo viên — thuê dài hạn.',
          liquidity:
            'Ổn định; giá ít biến động đột ngột hơn ven biển Nam.',
          strengths:
            'Kết nối trung tâm, hạ tầng đã trưởng thành, cho thuê quanh năm.',
          limitations:
            'Biên tăng giá hẹp hơn đất Nam. Căn cũ cần chi phí cải tạo.',
          strategyFit:
            'Dòng tiền ổn định, rủi ro thấp hơn đất nền — phù hợp danh mục phòng thủ.',
        },
        {
          kind: 'product-segment',
          id: 'ch2-fireworks',
          name: 'Căn view pháo hoa / sông Hàn trung tâm',
          buyerProfile:
            'Khách mua cảm xúc view + thương hiệu, ít tính yield.',
          renterProfile:
            'Khách thuê sự kiện, Tết, mùa du lịch — biến động cao.',
          liquidity:
            'Phụ thuộc thời điểm: bán tốt khi thị trường có narrative du lịch.',
          strengths:
            'Độc đáo, khó thay thế cùng view.',
          limitations:
            'Giá đã premium; thuê off-season yếu. Không phù hợp mô hình thuê 12 tháng đơn giản.',
          strategyFit:
            'Tích lũy hoặc vận hành lưu trú chuyên nghiệp — không mua theo slide yield.',
        },
        {
          kind: 'product-segment',
          id: 'ch2-shophouse',
          name: 'Shophouse thương mại & khối đế',
          buyerProfile:
            'Nhà đầu tư tìm dòng tiền kinh doanh, mặt tiền Sun hoặc shophouse khối đế chung cư.',
          renterProfile:
            'Hộ kinh doanh F&B, spa, văn phòng nhỏ — thuê 3–5 năm nếu vị trí đông.',
          liquidity:
            'Chậm hơn căn hộ; bán theo dòng tiền thực tế của mặt bằng.',
          strengths:
            'Doanh thu thuê m² cao hơn căn hộ thuần nếu vị trí đúng.',
          limitations:
            'Trống shop 12 tháng đầu phổ biến ở phân khu mới. Cần vốn dự phòng vận hành.',
          strategyFit:
            'Dòng tiền kinh doanh; khảo sát footfall trước khi trả giá.',
        },
      ],
    },
    {
      number: 3,
      title: 'Đất nền và nhà phố Nam Đà Nẵng',
      blocks: [
        {
          kind: 'prose',
          id: 'ch3-intro',
          paragraphs: [
            'Đất nền và nhà phố Nam không chạy theo logic căn hộ Sun: chu kỳ gắn dân cư thực, quy hoạch và sổ đất. Phân tích dưới đây tập trung từng vùng — không mở rộng ra Sơn Trà hay trung tâm cũ.',
          ],
        },
        {
          kind: 'zone-focus',
          id: 'ch3-mai-dang-chon',
          zone: 'Mai Đăng Chơn',
          paragraphs: [
            'Vì sao theo dõi: ven sông Cổ Cò, master plan shophouse và đất nền đã có giao dịch thứ cấp đo được. Điều đang thay đổi: từng block hạ tầng hoàn thiện lệch nhau 12–24 tháng — giá block đã thông điện cao hơn block mới san lấp.',
            'Điểm mạnh: mặt tiền kinh doanh khi dân cư về. Điểm yếu: shophouse pioneer trống, chi phí fit-out. Phù hợp: vốn 5–15 tỷ, nắm giữ 5 năm+, có người tại Đà Nẵng giám sát.',
          ],
        },
        {
          kind: 'zone-focus',
          id: 'ch3-hoa-quy',
          zone: 'Hòa Quý & Bá Tùng',
          paragraphs: [
            'Giá nhà phố 3 tầng tại Bá Tùng đang giao dịch theo mức “xây sẵn — sổ riêng — vào ở”, thường chênh 15–25% so lô đất trống cùng tuyến. Khách mua từ Hà Nội hay TP.HCM hay so sánh Bá Tùng với Nam Hòa Xuân: Bá Tùng có sản phẩm nhà ở hoàn thiện; Nam Hòa Xuân mạnh đất nền đã có cư dân.',
            'Loại hình khớp vốn 4–8 tỷ: nhà phố đã có sổ và hộ ở thực. Tránh lô đất quy hoạch dài hạn nếu cần dòng tiền hoặc bán lại trong 24 tháng.',
          ],
        },
        {
          kind: 'zone-focus',
          id: 'ch3-nam-hoa-xuan',
          zone: 'Nam Hòa Xuân',
          paragraphs: [
            'Đất nền Nam Hòa Xuân có thanh khoản tốt hơn vùng mới san lấp nhờ cư dân đã về. Giá/m² dao động mạnh theo lô góc, lộ giới và tình trạng sổ.',
            'Đối tượng: người tích lũy 3–7 năm, chấp nhận xây hoặc bán lại khi sổ về. Rủi ro: mua lô chưa tách sổ, giá đã discount nhưng khó vay.',
          ],
        },
        {
          kind: 'zone-focus',
          id: 'ch3-dien-ngoc',
          zone: 'Điện Ngọc & ven biển Nam',
          paragraphs: [
            'Điện Ngọc gần Non Nước — lai giữa ở và nghỉ dưỡng. Thanh khoản theo mùa du lịch. Đất và nhà phố ven biển Nam phù hợp khách có tầm nhìn 7–10 năm, không cần bán gấp.',
          ],
        },
        {
          kind: 'zone-focus',
          id: 'ch3-fpt-co-co',
          zone: 'FPT City & ven sông Cổ Cò',
          paragraphs: [
            'FPT City: đất ven đô thị công nghệ — giá vào cao hơn vùng xa nhưng có narrative việc làm. Ven Cổ Cò: đất nền ven sông, phù hợp xây homestay/nhà vườn nếu pháp lý cho phép.',
            'Khách Hà Nội thường so sánh hai vùng này với Mai Đăng Chơn: FPT/Cổ Cò gần việc làm; Mai Đăng Chơn gần shophouse và mặt tiền kinh doanh.',
          ],
        },
      ],
    },
    {
      number: 4,
      title: 'Những yếu tố nhà đầu tư nên theo dõi',
      blocks: [
        {
          kind: 'factor',
          id: 'ch4-planning',
          factor: 'Quy hoạch',
          analysis:
            'Bản đồ quy hoạch 1/2000 và 1/500 quyết định mục đích sử dụng đất, lộ giới và hành lang điện. Một lô đẹp trên Google Maps có thể nằm trong hành lang thu hồi. Tra cứu tại cơ quan có thẩm quyền trước khi đặt cọc — không dựa vào mô tả môi giới.',
        },
        {
          kind: 'factor',
          id: 'ch4-infra',
          factor: 'Hạ tầng',
          analysis:
            'Đường nội bộ đã asphal, điện nước đồng bộ tới hộ, bus và taxi có tuyến qua — ba trong bốn tiêu chí đạt thì khu vực đủ sống được. Hạ tầng trên giấy chậm 1–2 năm làm giá đứng hoặc giảm nhẹ dù narrative vùng vẫn tốt.',
        },
        {
          kind: 'factor',
          id: 'ch4-population',
          factor: 'Dòng dân cư',
          analysis:
            'Đếm đèn nhà buổi tối thứ Sáu, hỏi ban quản lý số hộ đã nhận nhà, xem mật độ quán mở cửa — chỉ số cư dư ở thực. Đất trống giá đã tăng mà ít hộ ở là tín hiệu cảnh báo.',
        },
        {
          kind: 'factor',
          id: 'ch4-business',
          factor: 'Dòng doanh nghiệp',
          analysis:
            'Khu công nghệ FPT, chợ đầu mối Hòa Cường và các kho logistics tạo việc làm phi nông nghiệp — kéo theo thuê nhà phố và căn dịch vụ. Văn phòng chi nhánh dần dời về Nam làm tăng tệp thuê trung cấp ít biến động theo mùa du lịch.',
        },
        {
          kind: 'factor',
          id: 'ch4-transactions',
          factor: 'Giao dịch thực',
          analysis:
            'Lấy 5 văn bản công chứng hoặc hợp đồng chuyển nhượng cùng phân khúc 12 tháng — giá thật khác giá rao 10–20%. Không có giao dịch thứ cấp quanh khu vực thì thanh khoản chưa được xác nhận bằng số liệu.',
        },
        {
          kind: 'factor',
          id: 'ch4-liquidity',
          factor: 'Thanh khoản',
          analysis:
            'Căn Sun bán lại 3–9 tháng; đất nền Nam 12–24 tháng; shophouse pioneer có thể 18–36 tháng. Vốn cần luân chuyển gắn với loại hình thanh khoản cao hơn.',
        },
        {
          kind: 'factor',
          id: 'ch4-supply',
          factor: 'Nguồn cung',
          analysis:
            'Đợt mở bán đất nền mới hoặc bàn giao căn loạt tạo áp lực giá thuê và giá bán lại. Theo dõi tiến độ bàn giao 6–12 tháng tới trong bán kính 2 km.',
        },
      ],
    },
    {
      number: 5,
      title: 'Những việc phải kiểm tra trước khi đặt cọc',
      blocks: [
        {
          kind: 'prose',
          id: 'ch5-intro',
          paragraphs: [
            'Đặt cọc là điểm không thể rút dễ. Dưới đây là các bước bắt buộc — trình bày theo thứ tự thực tế mà chuyên gia pháp lý và môi giới độc lập tại Đà Nẵng thường làm với khách mua từ xa.',
          ],
        },
        {
          kind: 'due-diligence',
          id: 'ch5-red-book',
          topic: 'Sổ đỏ thật hay giả?',
          guidance:
            'Yêu cầu bản sao công chứng sổ gốc, đối chiếu số thửa, tờ bản đồ, tên chủ với CMND/CCCD. Kiểm tra tem, mộc, dấu giáp lai. Sổ mới cấp lại đang chờ — xác nhận tại Văn phòng đăng ký đất đai.',
        },
        {
          kind: 'due-diligence',
          id: 'ch5-mortgage',
          topic: 'Tình trạng thế chấp',
          guidance:
            'Tra cứu thế chấp ngân hàng trên sổ hoặc giấy xác nhận giải chấp có ngày hiệu lực. Không chuyển tiền lớn khi thế chấp chưa giải trừ rõ ràng trong hợp đồng.',
        },
        {
          kind: 'due-diligence',
          id: 'ch5-planning',
          topic: 'Quy hoạch',
          guidance:
            'Lấy bản đồ quy hoạch sử dụng đất, kiểm tra lộ giới, hành lang sông, đất nông nghiệp chuyển đổi. Lô ven đường lớn dễ dính lộ giới 20–25 m.',
        },
        {
          kind: 'due-diligence',
          id: 'ch5-dispute',
          topic: 'Tranh chấp',
          guidance:
            'Hỏi hàng xóm, UBND phường, luật sư địa phương về tranh chấp ranh giới, thừa kế, ly hôn chưa phân chia. Tranh chấp đang thi hành án — không ký cọc.',
        },
        {
          kind: 'due-diligence',
          id: 'ch5-co-owner',
          topic: 'Đồng sở hữu',
          guidance:
            'Tất cả đồng sở hữu phải ký hoặc có văn bản ủy quyền công chứng hợp lệ. Vợ/chồng trên sổ — cần chữ ký đủ bên.',
        },
        {
          kind: 'due-diligence',
          id: 'ch5-road-planning',
          topic: 'Đường quy hoạch',
          guidance:
            'Xác nhận đường trước mặt là đường thực hay đường quy hoạch chưa mở. Mua theo đường quy hoạch là kịch bản 5–10 năm, không phải giá trị hiện tại.',
        },
        {
          kind: 'due-diligence',
          id: 'ch5-land-use',
          topic: 'Mục đích sử dụng đất',
          guidance:
            'Đất ở, đất thương mại, đất dịch vụ — mỗi loại khác điều kiện xây và kinh doanh. Mục đích trên sổ phải khớp kế hoạch sử dụng của bạn.',
        },
        {
          kind: 'due-diligence',
          id: 'ch5-land-term',
          topic: 'Thời hạn sử dụng đất',
          guidance:
            'Sở hữu lâu dài hay 50 năm — ảnh hưởng giá bán lại và vay ngân hàng. Đất 50 năm gần hết hạn cần chi phí gia hạn trong mô hình tài chính.',
        },
        {
          kind: 'due-diligence',
          id: 'ch5-transfer-conditions',
          topic: 'Điều kiện chuyển nhượng',
          guidance:
            'Đọc HĐMB gốc và nội quy dự án: một số phân khu cấm chuyển nhượng trước bàn giao hoặc thu phí chuyển nhượng 1–2% giá trị. Căn hộ Sun cần xác nhận ban quản trị về cho thuê ngắn hạn.',
        },
        {
          kind: 'due-diligence',
          id: 'ch5-seller-identity',
          topic: 'Chủ sở hữu có đúng người ký?',
          guidance:
            'So khớp CMND, chữ ký mẫu, hô khẩu. Người bán là con, vợ/chồng, người được thừa kế — phải có căn cứ pháp lý đứng tên bán.',
        },
        {
          kind: 'due-diligence',
          id: 'ch5-seizure',
          topic: 'Kê biên thi hành án',
          guidance:
            'Tra cứu thông tin thi hành án và nợ thuế (nếu có kênh chính thống). Tài sản kê biên không công chứng được.',
        },
        {
          kind: 'due-diligence',
          id: 'ch5-recovery',
          topic: 'Dự án thu hồi',
          guidance:
            'Lô nằm trong khu quy hoạch thu hồi công cộng — bồi thường không bằng giá thị trường thương mại. Kiểm tra trên bản đồ quy hoạch chi tiết.',
        },
        {
          kind: 'due-diligence',
          id: 'ch5-site-visit',
          topic: 'Hiện trạng thực địa',
          guidance:
            'Đo ranh thửa, chụp ảnh/video có timestamp, kiểm tra lối đi, hàng xóm, ngập úng, điện nước kéo tới đâu. Hiện trạng khác sơ đồ sổ — không cọc.',
        },
        {
          kind: 'due-diligence',
          id: 'ch5-construction-permit',
          topic: 'Giấy phép xây dựng (nhà đã xây)',
          guidance:
            'Nhà xây trái phép hoặc vượt tầng — khó vay, khó bán. Yêu cầu GPXD, bản vẽ hoàn công nếu có.',
        },
      ],
    },
  ],
};
