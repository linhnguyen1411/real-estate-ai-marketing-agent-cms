import { Link } from 'react-router-dom';
import { BarChart3, BookOpen, Building2, FileText, MapPin, TrendingUp } from 'lucide-react';
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
    description: 'Đất nền, nhà phố Nam Đăng Chơn và khu đô thị mới có quy hoạch công khai, dễ thẩm định pháp lý.',
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
      </div>
    </section>  );
}
