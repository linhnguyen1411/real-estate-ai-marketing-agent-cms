import { Link, useLocation } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import ContentPageHero from '../components/layout/ContentPageHero';
import LegalSidebar from '../components/layout/LegalSidebar';
import { CONTACT, SITE, BRAND_FOCUS } from '../seo/siteConfig';
import { buildBreadcrumbSchema, buildDefaultPageSchemas } from '../seo/schemas';
import { getPageMetaByPath } from '../seo/pageMeta';
import { getSiteOrigin } from '../seo/siteConfig';

const LEGAL_INTRO =
  `${SITE.name}, vận hành tại ${SITE.brand}. ` +
  `Website cung cấp dữ liệu thị trường, phân tích khu vực, danh mục BĐS và hỗ trợ nhà đầu tư tìm hiểu cơ hội tại Đà Nẵng — ${BRAND_FOCUS.inventorySummary}`;

const LEGAL_CONTENT: Record<string, { title: string; sections: { heading: string; body: string }[] }> = {
  'chinh-sach-bao-mat': {
    title: 'Chính sách bảo mật',
    sections: [
      {
        heading: '1. Phạm vi áp dụng',
        body: LEGAL_INTRO + ' Chính sách này mô tả cách chúng tôi thu thập, sử dụng và bảo vệ thông tin cá nhân khi bạn truy cập website, điền form tư vấn, chat trực tuyến hoặc liên hệ qua các kênh chính thức của chúng tôi.',
      },
      {
        heading: '2. Thông tin chúng tôi thu thập',
        body:
          'Chúng tôi có thể thu thập: họ tên, số điện thoại, email, khu vực quan tâm, ngân sách đầu tư, loại tài sản mong muốn (căn hộ, đất nền, nhà phố, shophouse) và nội dung trao đổi khi bạn yêu cầu tư vấn hoặc nhận tài liệu đầu tư. ' +
          'Dữ liệu kỹ thuật như địa chỉ IP, loại thiết bị và hành vi duyệt trang có thể được ghi nhận qua cookie phân tích (xem Chính sách cookie). Chúng tôi không yêu cầu thông tin tài chính nhạy cảm (số tài khoản, mật khẩu ngân hàng) qua website.',
      },
      {
        heading: '3. Mục đích sử dụng',
        body:
          'Thông tin được dùng để: (i) tư vấn sản phẩm bất động sản phù hợp nhu cầu; (ii) gửi danh sách cơ hội, báo cáo thị trường hoặc tài liệu bạn đăng ký nhận; (iii) liên hệ xác nhận lịch xem nhà hoặc hẹn tư vấn; (iv) cải thiện nội dung website và trải nghiệm người dùng. ' +
          'Chúng tôi không bán, cho thuê hoặc trao đổi dữ liệu cá nhân với bên thứ ba vì mục đích marketing của họ.',
      },
      {
        heading: '4. Kênh liên lạc chính thức',
        body:
          `Các kênh sau là phương thức liên lạc chính thức của ${CONTACT.companyName}, không phải liên kết ngẫu nhiên đến dịch vụ bên ngoài: ` +
          `Facebook (${CONTACT.facebook}), Messenger (${CONTACT.messenger}), Zalo (${CONTACT.zalo}), email (${CONTACT.email}), hotline (${CONTACT.phoneDisplay}) ` +
          `và vị trí trên Google Maps (${CONTACT.mapLink}). Khi bạn chủ động liên hệ qua các kênh này, thông tin trao đổi có thể được lưu để phục vụ tư vấn và chăm sóc khách hàng.`,
      },
      {
        heading: '5. Lưu trữ và bảo mật',
        body:
          'Dữ liệu được lưu trên hệ thống có kiểm soát truy cập, chỉ nhân sự được phân quyền mới xử lý thông tin khách hàng. Chúng tôi áp dụng biện pháp hợp lý để hạn chế truy cập trái phép; tuy nhiên, không có hệ thống nào an toàn tuyệt đối trên internet.',
      },
      {
        heading: '6. Quyền của bạn',
        body:
          'Bạn có quyền yêu cầu truy cập, chỉnh sửa hoặc xóa thông tin cá nhân đã cung cấp, và có thể từ chối nhận tin tư vấn bất cứ lúc nào. Gửi yêu cầu qua email ' +
          CONTACT.email +
          ' hoặc Zalo ' +
          CONTACT.phoneDisplay +
          '. Chúng tôi phản hồi trong thời gian hợp lý theo quy định pháp luật Việt Nam.',
      },
      {
        heading: '7. Cookie và phân tích',
        body:
          'Website sử dụng cookie cần thiết và cookie phân tích (Google Analytics, Google Tag Manager) để đo lường lượt truy cập và cải thiện nội dung. Chi tiết xem tại trang Chính sách cookie.',
      },
    ],
  },
  'dieu-khoan-su-dung': {
    title: 'Điều khoản sử dụng',
    sections: [
      {
        heading: '1. Chấp nhận điều khoản',
        body:
          LEGAL_INTRO +
          ` Bằng việc truy cập và sử dụng ${SITE.brand}, bạn xác nhận đã đọc, hiểu và đồng ý với các điều khoản dưới đây. Nếu không đồng ý, vui lòng ngừng sử dụng website.`,
      },
      {
        heading: '2. Bản chất thông tin trên website',
        body:
          'Mọi mô tả tài sản, phân tích khu vực, bài viết tin tức, báo cáo thị trường và nội dung tư vấn trên website mang tính tham khảo tại thời điểm đăng tải. ' +
          'Thông tin không cấu thành cam kết về giá, lợi nhuận, tỷ suất cho thuê, thanh khoản hay kết quả đầu tư. Nội dung phân tích không phải khuyến nghị tài chính, khuyến nghị đầu tư có giá trị pháp lý hay lời mời chào mua chứng khoán.',
      },
      {
        heading: '3. Trách nhiệm của nhà đầu tư',
        body:
          'Quyết định mua, bán, đặt cọc hoặc ký hợp đồng bất động sản là trách nhiệm của bạn. Trước khi giao dịch, nhà đầu tư cần tự kiểm tra pháp lý (quy hoạch, sổ đỏ, tranh chấp, thế chấp), khảo sát hiện trạng, xác minh giá thị trường và đánh giá khả năng tài chính độc lập. ' +
          'Chúng tôi khuyến nghị làm việc với luật sư, công chứng và đơn vị thẩm định độc lập khi cần thiết.',
      },
      {
        heading: '4. Giá, tình trạng và nguồn cung tài sản',
        body:
          'Giá rao bán, diện tích, hướng căn, pháp lý, tình trạng bàn giao và khả năng còn hàng của từng tài sản có thể thay đổi theo thời điểm mà không cần báo trước trên website. ' +
          'Thông tin chính xác nhất tại thời điểm quan tâm sẽ được xác nhận qua hotline, Zalo hoặc buổi tư vấn trực tiếp. Hình ảnh minh họa có thể khác hiện trạng thực tế; khách nên xem trực tiếp hoặc yêu cầu ảnh/video cập nhật trước khi quyết định.',
      },
      {
        heading: '5. Quyền sở hữu trí tuệ',
        body:
          `Nội dung văn bản, hình ảnh, biểu đồ, logo và tài liệu phân tích trên ${SITE.brand} thuộc quyền ${CONTACT.companyName} hoặc được cấp phép hợp pháp. ` +
          'Nghiêm cấm sao chép, phát tán hoặc khai thác thương mại khi chưa có sự đồng ý bằng văn bản.',
      },
      {
        heading: '6. Kênh truyền thông chính thức',
        body:
          'Liên kết đến Facebook, Messenger, Zalo và Google Maps trên website là kênh truyền thông và định vị chính thức của doanh nghiệp, phục vụ tư vấn và chăm sóc khách hàng. ' +
          'Nội dung bạn trao đổi trên các kênh này tuân theo chính sách của từng nền tảng; chúng tôi không chịu trách nhiệm cho sự cố kỹ thuật phát sinh từ phía nhà cung cấp dịch vụ mạng xã hội hoặc bản đồ.',
      },
      {
        heading: '7. Giới hạn trách nhiệm',
        body:
          'Trong phạm vi pháp luật cho phép, chúng tôi không chịu trách nhiệm đối với thiệt hại trực tiếp hoặc gián tiếp phát sinh từ việc dựa hoàn toàn vào thông tin website mà không qua xác minh độc lập hoặc tư vấn phù hợp. ' +
          'Website có thể tạm ngừng truy cập để bảo trì; chúng tôi nỗ lực duy trì thông tin cập nhật nhưng không đảm bảo website luôn không lỗi hoặc luôn phản ánh giao dịch mới nhất.',
      },
      {
        heading: '8. Thay đổi điều khoản',
        body:
          'Chúng tôi có thể cập nhật điều khoản khi mở rộng dịch vụ hoặc thay đổi quy định pháp luật. Phiên bản mới có hiệu lực khi đăng trên trang này. Việc tiếp tục sử dụng website sau khi cập nhật được hiểu là bạn chấp nhận điều khoản mới.',
      },
    ],
  },
  'chinh-sach-cookie': {
    title: 'Chính sách cookie',
    sections: [
      {
        heading: '1. Cookie là gì?',
        body:
          'Cookie là tệp văn bản nhỏ lưu trên trình duyệt hoặc thiết bị khi bạn truy cập website. Cookie giúp ghi nhớ phiên làm việc, tùy chọn hiển thị và hỗ trợ đo lường hiệu quả nội dung — ví dụ trang nào về đất nền Nam Đà Nẵng, căn hộ Sun Group hay review khu vực được quan tâm nhiều hơn.',
      },
      {
        heading: '2. Cookie chúng tôi sử dụng',
        body:
          'Cookie cần thiết: duy trì phiên đăng nhập (nếu có), bảo mật form và chức năng cơ bản của website. ' +
          'Cookie phân tích: Google Analytics 4 và Google Tag Manager ghi nhận lượt truy cập, nguồn traffic, thời gian trên trang và hành vi chuyển đổi (ví dụ gửi form tư vấn). Dữ liệu này dùng để cải thiện nội dung bất động sản và trải nghiệm người dùng, không dùng để bán hồ sơ cá nhân.',
      },
      {
        heading: '3. Cookie từ kênh chính thức của doanh nghiệp',
        body:
          'Khi bạn nhấp liên kết đến Facebook, Messenger, Zalo hoặc Google Maps từ website, các nền tảng đó có thể đặt cookie riêng theo chính sách của họ. ' +
          'Đây là kênh truyền thông chính thức của ' +
          CONTACT.companyName +
          '; chúng tôi khuyến nghị bạn đọc chính sách cookie của từng nền tảng nếu tiếp tục sử dụng sau khi rời website.',
      },
      {
        heading: '4. Quản lý cookie',
        body:
          'Bạn có thể xóa hoặc chặn cookie trong cài đặt trình duyệt (Chrome, Safari, Firefox, Edge). Tắt cookie phân tích không ảnh hưởng việc đọc nội dung công khai, nhưng một số tính năng (ghi nhớ tùy chọn, đo lường chuyển đổi) có thể hoạt động không đầy đủ. ' +
          'Để từ chối theo dõi Google Analytics, bạn có thể cài tiện ích chặn do Google cung cấp.',
      },
      {
        heading: '5. Liên hệ',
        body:
          'Mọi thắc mắc về cookie và dữ liệu cá nhân: ' +
          CONTACT.email +
          ' · ' +
          CONTACT.phoneDisplay +
          '. Xem thêm Chính sách bảo mật để biết cách chúng tôi xử lý thông tin tư vấn bất động sản.',
      },
    ],
  },
  'mien-tru-trach-nhiem': {
    title: 'Miễn trừ trách nhiệm',
    sections: [
      {
        heading: '1. Mục đích website',
        body:
          LEGAL_INTRO +
          ' Nội dung được biên soạn nhằm hỗ trợ nhà đầu tư tìm hiểu thị trường, so sánh khu vực và liên hệ tư vấn — không thay thế hợp đồng mua bán, thẩm định pháp lý chuyên nghiệp hay tư vấn tài chính cá nhân.',
      },
      {
        heading: '2. Thông tin mang tính tham khảo',
        body:
          'Mọi mô tả tài sản (đất nền, nhà phố Nam Đăng Chơn, căn hộ Sun Group ven sông Hàn, giỏ ký gửi…), phân tích khu vực (có thể đề cập FPT City như bối cảnh thị trường), dự báo dòng tiền và bài viết review trên website chỉ mang tính tham khảo tại thời điểm công bố. ' +
          'Chúng tôi nỗ lực cập nhật dữ liệu từ thực tế thị trường và danh mục BĐS, nhưng không đảm bảo thông tin luôn đầy đủ, kịp thời hoặc không có sai sót.',
      },
      {
        heading: '3. Không cam kết lợi nhuận đầu tư',
        body:
          'Chúng tôi không cam kết, không bảo đảm và không hàm ý về mức tăng giá, tỷ suất lợi nhuận, thời gian hoàn vốn hay khả năng thanh khoản của bất kỳ tài sản nào. ' +
          'Các con số minh họa (giá thuê, yield, biên độ tăng giá) — nếu có — là giả định tham khảo, phụ thuộc điều kiện thị trường, pháp lý và năng lực vận hành của từng nhà đầu tư.',
      },
      {
        heading: '4. Nhà đầu tư tự kiểm tra pháp lý',
        body:
          'Trước khi đặt cọc hoặc ký hợp đồng, nhà đầu tư có trách nhiệm tự xác minh: quy hoạch, mục đích sử dụng đất, tình trạng sổ đỏ, tranh chấp, nợ thế chấp, điều kiện chuyển nhượng và các khoản phí liên quan. ' +
          'Chúng tôi có thể hỗ trợ cung cấp hồ sơ do chủ tài sản cung cấp, nhưng không thay thế ý kiến của cơ quan nhà nước, công chứng viên hoặc luật sư độc lập.',
      },
      {
        heading: '5. Giá và tình trạng tài sản thay đổi theo thời điểm',
        body:
          'Giá chào bán, chiết khấu, quà tặng, chính sách thanh toán và tình trạng còn hàng của từng căn hộ, lô đất hoặc nhà phố có thể thay đổi mà không cập nhật kịp trên website. ' +
          'Vui lòng liên hệ hotline ' +
          CONTACT.phoneDisplay +
          ' hoặc Zalo chính thức để nhận báo giá và tình trạng mới nhất trước khi quyết định.',
      },
      {
        heading: '6. Không phải khuyến nghị tài chính',
        body:
          'Nội dung phân tích thị trường, báo cáo khu vực, checklist đầu tư và tài liệu tải về không cấu thành khuyến nghị đầu tư, khuyến nghị tài chính hay lời mời giao dịch có giá trị ràng buộc. ' +
          'Bạn nên cân nhắc mục tiêu tài chính, khẩu vị rủi ro và tư vấn độc lập trước khi phân bổ vốn vào bất động sản.',
      },
      {
        heading: '7. Kênh truyền thông chính thức',
        body:
          'Facebook, Messenger, Zalo và Google Maps được sử dụng là kênh liên lạc và định vị chính thức của ' +
          CONTACT.companyName +
          '. Chúng không phải liên kết quảng cáo ngẫu nhiên đến bên thứ ba. Nội dung đăng trên các kênh này cũng mang tính tham khảo; giao dịch chính thức cần được xác nhận qua hợp đồng và thủ tục pháp lý phù hợp.',
      },
      {
        heading: '8. Giới hạn trách nhiệm pháp lý',
        body:
          'Trong phạm vi luật pháp Việt Nam cho phép, ' +
          CONTACT.companyName +
          ' và đội ngũ tư vấn không chịu trách nhiệm về thiệt hại kinh tế, mất lợi nhuận kỳ vọng hoặc tranh chấp phát sinh từ quyết định đầu tư dựa trên nội dung website khi chưa có xác minh độc lập. ' +
          'Mọi tranh chấi giao dịch bất động sản giữa khách hàng và chủ tài sản hoặc bên liên quan thuộc phạm vi trách nhiệm của các bên trong hợp đồng.',
      },
    ],
  },
};

const PATH_TO_SLUG: Record<string, string> = {
  '/chinh-sach-bao-mat': 'chinh-sach-bao-mat',
  '/dieu-khoan-su-dung': 'dieu-khoan-su-dung',
  '/chinh-sach-cookie': 'chinh-sach-cookie',
  '/mien-tru-trach-nhiem': 'mien-tru-trach-nhiem',
};

export default function LegalPage() {
  const { pathname } = useLocation();
  const legalSlug = PATH_TO_SLUG[pathname];
  const path = pathname;
  const content = LEGAL_CONTENT[legalSlug || ''];
  const meta = getPageMetaByPath(path);
  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: content?.title || 'Pháp lý', path },
  ];
  const origin = getSiteOrigin();

  if (!content) {
    return <div className="p-10 text-center">Không tìm thấy trang.</div>;
  }

  return (
    <>
      <SeoHead
        title={meta?.title || content.title}
        description={meta?.description || content.title}
        path={path}
        schemas={[
          ...buildDefaultPageSchemas(breadcrumbs, origin),
          buildBreadcrumbSchema(breadcrumbs, origin),
        ]}
      />

      <ContentPageHero
        breadcrumbs={breadcrumbs}
        title={content.title}
        description={`Tài liệu pháp lý của ${SITE.name}.`}
        meta={
          <>
            <span className="rounded-full bg-white px-3 py-1 shadow-sm">Cập nhật: tháng 6/2026</span>
            <span className="rounded-full bg-white px-3 py-1 shadow-sm">{CONTACT.companyName}</span>
          </>
        }
      />

      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,220px)_1fr] lg:gap-10">
          <aside className="lg:order-1">
            <LegalSidebar />
          </aside>

          <div className="min-w-0 space-y-5 lg:order-2">
            {content.sections.map((section, index) => (
              <section
                key={section.heading}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
              >
                <div className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-invest-blue-muted text-sm font-extrabold text-invest-blue">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-slate-950 sm:text-xl">{section.heading.replace(/^\d+\.\s*/, '')}</h2>
                    <p className="mt-3 text-base leading-relaxed text-slate-700">{section.body}</p>
                  </div>
                </div>
              </section>
            ))}

            <div className="rounded-2xl border border-invest-blue/20 bg-gradient-to-br from-invest-blue-muted to-white p-6 sm:p-8">
              <h2 className="text-lg font-bold text-slate-950">Cần hỗ trợ thêm?</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Mọi thắc mắc về quyền riêng tư, điều khoản hoặc miễn trừ trách nhiệm, vui lòng liên hệ qua kênh chính thức.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={`mailto:${CONTACT.email}`}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-invest-blue/30"
                >
                  {CONTACT.email}
                </a>
                <a
                  href={`tel:${CONTACT.phoneTel}`}
                  className="rounded-lg bg-invest-blue px-4 py-2 text-sm font-bold text-white hover:bg-invest-blue-light"
                >
                  Hotline {CONTACT.phoneDisplay}
                </a>
                <Link
                  to="/lien-he"
                  className="rounded-lg border border-invest-blue/30 px-4 py-2 text-sm font-semibold text-invest-blue hover:bg-invest-blue-muted"
                >
                  Form liên hệ
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
