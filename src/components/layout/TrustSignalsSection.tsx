import { Link } from 'react-router-dom';
import { BarChart3, BookOpen, Building2, FileText, MapPin, TrendingUp } from 'lucide-react';
import { AUTHOR, SITE } from '../../seo/siteConfig';

const WHY_ITEMS = [
  {
    icon: TrendingUp,
    title: 'Tăng trưởng dài hạn',
    description: 'Hạ tầng, sân bay và khu công nghệ thúc đẩy nhu cầu ở và đầu tư tại Nam Đà Nẵng.',
  },
  {
    icon: MapPin,
    title: 'Vị trí chiến lược',
    description: 'Cửa ngõ miền Trung, kết nối liên vùng Bắc — Trung — Nam, thuận lợi cho nhà đầu tư trung và dài hạn.',
  },
  {
    icon: Building2,
    title: 'Dự án quy hoạch rõ',
    description: 'FPT City, Sun Group và các khu đô thị mới có master plan công khai, dễ thẩm định.',
  },
  {
    icon: BarChart3,
    title: 'Dòng tiền cho thuê',
    description: 'Nhu cầu thuê từ chuyên gia, du lịch và sinh viên tạo cơ sở đánh giá yield thực tế.',
  },
];

const RESOURCE_LINKS = [
  { href: '/nha-dau-tu', label: 'Dữ liệu thị trường', icon: BarChart3 },
  { href: '/phan-tich', label: 'Phân tích chuyên sâu', icon: TrendingUp },
  { href: '/tai-lieu-dau-tu', label: 'Danh mục đầu tư', icon: FileText },
  { href: '/tin-tuc', label: 'Case study & tin tức', icon: BookOpen },
];

export default function TrustSignalsSection() {
  return (
    <section className="section-alt border-y border-invest-border py-16 md:py-20" aria-labelledby="trust-heading">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-3xl text-center">
          <p className="label-section">Trung tâm thông tin đầu tư</p>
          <h2 id="trust-heading" className="heading-section mt-3">
            Tại sao nhà đầu tư chọn Nam Đà Nẵng?
          </h2>
          <p className="text-body-lg mt-4 text-invest-muted">
            Dữ liệu thị trường, phân tích dự án và danh mục tài sản được trình bày minh bạch — phục vụ quyết định đầu tư có căn cứ.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {WHY_ITEMS.map(item => (
            <div key={item.title} className="invest-card p-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-invest-blue-muted text-invest-blue">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-invest-text">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-invest-muted">{item.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RESOURCE_LINKS.map(item => (
            <Link
              key={item.href}
              to={item.href}
              className="invest-card flex items-center gap-3 p-4 font-semibold text-invest-blue hover:text-invest-blue-light"
            >
              <item.icon className="h-5 w-5 shrink-0 text-invest-gold" />
              {item.label}
            </Link>
          ))}
        </div>

        <div className="mt-14 invest-card mx-auto max-w-3xl p-6 md:flex md:items-center md:gap-6 md:p-8">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-invest-blue text-xl font-extrabold text-white">
            LN
          </div>
          <div className="mt-4 md:mt-0">
            <p className="text-xs font-bold uppercase tracking-wide text-invest-gold">Biên tập & tư vấn</p>
            <h3 className="mt-1 text-xl font-extrabold text-invest-text">{AUTHOR.name}</h3>
            <p className="mt-1 font-medium text-invest-blue">{AUTHOR.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-invest-muted">
              Nội dung và dữ liệu trên {SITE.brand} được biên soạn nhằm hỗ trợ nhà đầu tư đánh giá cơ hội tại Nam Đà Nẵng.
            </p>
            <Link to="/tac-gia/nguyen-phan-hoang-linh" className="mt-3 inline-block text-sm font-bold text-invest-cta hover:underline">
              Xem hồ sơ tác giả →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
