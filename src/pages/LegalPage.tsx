import { useLocation, Link } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import Breadcrumbs from '../components/seo/Breadcrumbs';
import { CONTACT, SITE } from '../seo/siteConfig';
import { buildBreadcrumbSchema, buildDefaultPageSchemas } from '../seo/schemas';
import { getPageMetaByPath } from '../seo/pageMeta';
import { getSiteOrigin } from '../seo/siteConfig';

const LEGAL_CONTENT: Record<string, { title: string; sections: { heading: string; body: string }[] }> = {
  'chinh-sach-bao-mat': {
    title: 'Chính sách bảo mật',
    sections: [
      {
        heading: '1. Thu thập thông tin',
        body: `${SITE.brand} thu thập họ tên, số điện thoại, email và nhu cầu bất động sản khi khách điền form liên hệ, chat hoặc gọi hotline. Mục đích: tư vấn sản phẩm phù hợp và gửi danh sách cơ hội đầu tư theo yêu cầu.`,
      },
      {
        heading: '2. Sử dụng thông tin',
        body: 'Thông tin chỉ dùng cho mục đích tư vấn, chăm sóc khách hàng và cải thiện dịch vụ. Chúng tôi không bán dữ liệu cho bên thứ ba.',
      },
      {
        heading: '3. Bảo mật',
        body: 'Dữ liệu được lưu trữ trên hệ thống có kiểm soát truy cập. Khách có quyền yêu cầu xóa hoặc chỉnh sửa thông tin qua email ' + CONTACT.email + '.',
      },
      {
        heading: '4. Cookie',
        body: 'Website sử dụng cookie phân tích (Google Analytics/GTM). Xem thêm Chính sách cookie.',
      },
    ],
  },
  'dieu-khoan-su-dung': {
    title: 'Điều khoản sử dụng',
    sections: [
      {
        heading: '1. Chấp nhận điều khoản',
        body: `Khi truy cập ${SITE.brand}, bạn đồng ý với các điều khoản này. Nếu không đồng ý, vui lòng không sử dụng website.`,
      },
      {
        heading: '2. Nội dung website',
        body: 'Thông tin BĐS mang tính tham khảo tại thời điểm đăng. Giá, pháp lý và tình trạng có thể thay đổi. Khách cần xác minh trước khi giao dịch.',
      },
      {
        heading: '3. Quyền sở hữu trí tuệ',
        body: 'Nội dung, hình ảnh và thương hiệu thuộc quyền ' + SITE.name + ' hoặc đối tác được cấp phép. Cấm sao chép trái phép.',
      },
      {
        heading: '4. Giới hạn trách nhiệm',
        body: 'Chúng tôi không chịu trách nhiệm cho thiệt hại phát sinh từ quyết định đầu tư dựa hoàn toàn vào thông tin website mà không tư vấn trực tiếp.',
      },
    ],
  },
  'chinh-sach-cookie': {
    title: 'Chính sách cookie',
    sections: [
      {
        heading: 'Cookie là gì?',
        body: 'Cookie là tệp nhỏ lưu trên thiết bị giúp website ghi nhớ tùy chọn và đo lường lượt truy cập.',
      },
      {
        heading: 'Cookie chúng tôi dùng',
        body: 'Cookie cần thiết (phiên làm việc), cookie phân tích (Google Analytics 4, Google Tag Manager) để hiểu hành vi người dùng và cải thiện trải nghiệm.',
      },
      {
        heading: 'Quản lý cookie',
        body: 'Bạn có thể tắt cookie trong cài đặt trình duyệt. Một số tính năng có thể không hoạt động đầy đủ.',
      },
    ],
  },
  'mien-tru-trach-nhiem': {
    title: 'Miễn trừ trách nhiệm (Disclaimer)',
    sections: [
      {
        heading: 'Thông tin đầu tư',
        body: 'Nội dung trên ' + SITE.brand + ' không phải lời khuyên đầu tư có giá trị pháp lý. Mọi quyết định mua bán BĐS là trách nhiệm của khách hàng sau khi tự kiểm tra pháp lý và tài chính.',
      },
      {
        heading: 'Giá và sản phẩm',
        body: 'Giá, diện tích và pháp lý có thể đã thay đổi kể từ ngày đăng. Vui lòng liên hệ hotline để nhận thông tin mới nhất.',
      },
      {
        heading: 'Liên kết bên thứ ba',
        body: 'Website có thể chứa liên kết Facebook, Zalo, Google Maps. Chúng tôi không kiểm soát nội dung các trang đó.',
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
      <article className="mx-auto max-w-3xl px-4 py-10 prose prose-slate max-w-none">
        <Breadcrumbs items={breadcrumbs} className="mb-6 not-prose" />
        <h1>{content.title}</h1>
        <p className="text-slate-500 text-sm">Cập nhật: tháng 1/2026 · {SITE.brand}</p>
        {content.sections.map(section => (
          <section key={section.heading} className="mt-8">
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </section>
        ))}
        <p className="mt-10 text-sm text-slate-500">
          Liên hệ: {CONTACT.email} · {CONTACT.phoneDisplay}
        </p>
      </article>
    </>
  );
}
