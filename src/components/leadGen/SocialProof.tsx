import { Quote } from 'lucide-react';

const CASE_STUDIES = [
  {
    name: 'Nhà đầu tư trung hạn — FPT City',
    story: 'Căn 2PN cho thuê, yield ổn định',
    quote: 'Cần dữ liệu thực tế về giá và nhu cầu thuê trước khi xuống tiền — không mua theo cảm tính.',
  },
  {
    name: 'Chủ doanh nghiệp — Nam Đà Nẵng',
    story: 'Đất nền ven sông, tích lũy 3–5 năm',
    quote: 'Quan trọng là pháp lý rõ và so sánh được với các lô cùng khu — tránh mua theo lời mời gọi.',
  },
  {
    name: 'Nhà đầu tư TP.HCM — Sun Cosmo',
    story: 'Căn hộ view biển, kết hợp nghỉ dưỡng',
    quote: 'Đánh giá dựa trên thanh khoản và chi phí sở hữu, không chỉ cam kết lợi nhuận.',
  },
];

export default function SocialProof() {
  return (
    <section className="section-alt border-y border-invest-border py-16" aria-labelledby="social-proof-heading">
      <div className="mx-auto max-w-7xl px-4">
        <p className="label-section">Case study thực tế</p>
        <h2 id="social-proof-heading" className="heading-section mt-2">
          Nhà đầu tư đánh giá như thế nào?
        </h2>
        <p className="text-body mt-3 max-w-2xl text-invest-muted">
          Các tình huống minh họa cách nhà đầu tư thẩm định trước khi quyết định tại Nam Đà Nẵng.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {CASE_STUDIES.map(item => (
            <article
              key={item.name}
              className="invest-card p-6"
            >
              <h3 className="font-bold text-invest-text">{item.name}</h3>
              <p className="text-sm font-semibold text-invest-gold">{item.story}</p>
              <blockquote className="mt-4 flex gap-2 text-sm leading-relaxed text-invest-muted">
                <Quote className="h-4 w-4 shrink-0 text-invest-gold" />
                {item.quote}
              </blockquote>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
