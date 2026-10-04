/**
 * Fast Mini Landing Page & Zalo/Messenger Share Card Generator.
 *
 * Implements Stage 4.3 of Master Plan:
 * - Ultra-fast responsive mobile preview for Zalo / Messenger sharing: /p/:slug
 * - Optimized OpenGraph tags for rich chat card previews
 * - Instant Call / Zalo Chat buttons and Viewing Appointment booking
 */

import type { Property, AppSettings } from '../../../src/types';
import { escapeHtml } from './seoPublicRoutes';

export function renderMiniLandingPage(input: {
  property: Property;
  settings: AppSettings;
  origin: string;
  shareUrl: string;
}): string {
  const { property, settings, origin, shareUrl } = input;

  const title = property.title || 'Bất động sản House & Life Đà Nẵng';
  const priceDisplay = property.price ? `${property.price} tỷ` : 'Thỏa thuận';
  const areaDisplay = property.area ? `${property.area} m²` : '';
  const locationDisplay = property.location || 'Đà Nẵng';
  const typeDisplay = property.type || 'Bất động sản';
  const directionDisplay = property.direction || 'Đang cập nhật';
  const legalDisplay = property.legal_status || 'Sổ hồng sẵn sàng';
  const hotline = settings.hotline || settings.phone || '0905777594';
  const zaloPhone = settings.zalo_phone || hotline;
  const hotlineClean = hotline.replace(/\D/g, '');
  const zaloClean = zaloPhone.replace(/\D/g, '');

  const heroImage =
    property.images ||
    property.gallery_images?.[0] ||
    `${origin}/logo_hl.png`;

  const description =
    property.description ||
    property.rich_description ||
    `${typeDisplay} tại ${locationDisplay}. Diện tích: ${areaDisplay}, Giá: ${priceDisplay}. Pháp lý: ${legalDisplay}. Liên hệ tư vấn trực tiếp House & Life.`;

  const sellingPoints = Array.isArray(property.selling_points) ? property.selling_points : [];

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>${escapeHtml(title)} | House & Life</title>
  
  <!-- Zalo & Facebook OpenGraph Meta Tags -->
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="Giá: ${escapeHtml(priceDisplay)} | DT: ${escapeHtml(areaDisplay)} | ${escapeHtml(locationDisplay)}" />
  <meta property="og:image" content="${escapeHtml(heroImage)}" />
  <meta property="og:url" content="${escapeHtml(shareUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="House & Life - BĐS Đà Nẵng" />
  
  <link rel="icon" type="image/png" href="${origin}/logo_hl.png" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    body { background: #f8fafc; color: #1e293b; line-height: 1.5; padding-bottom: 90px; }
    .header { background: #ffffff; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; }
    .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #0f172a; font-size: 16px; }
    .brand img { height: 28px; width: auto; }
    .badge-hl { background: #eff6ff; color: #2563eb; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; }
    .hero-img { width: 100%; height: 260px; object-fit: cover; background: #e2e8f0; }
    .container { padding: 16px; max-width: 600px; margin: 0 auto; }
    .price-box { display: flex; align-items: baseline; justify-content: space-between; margin-top: 8px; }
    .price { font-size: 26px; font-weight: 800; color: #dc2626; }
    .title { font-size: 19px; font-weight: 700; color: #0f172a; margin-top: 8px; line-height: 1.35; }
    .specs-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 16px 0; }
    .spec-item { background: #ffffff; padding: 12px; border-radius: 10px; border: 1px solid #e2e8f0; }
    .spec-label { font-size: 12px; color: #64748b; font-weight: 500; }
    .spec-val { font-size: 14px; color: #0f172a; font-weight: 700; margin-top: 2px; }
    .card { background: #ffffff; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 14px; }
    .card-title { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
    .desc { font-size: 14px; color: #334155; white-space: pre-line; line-height: 1.6; }
    .points { list-style: none; }
    .points li { font-size: 13.5px; color: #1e293b; padding: 4px 0; display: flex; align-items: center; gap: 6px; }
    .points li::before { content: "✓"; color: #16a34a; font-weight: 700; }
    
    /* Sticky action bar */
    .action-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #ffffff; border-top: 1px solid #e2e8f0; padding: 10px 16px; display: flex; gap: 10px; z-index: 100; box-shadow: 0 -4px 12px rgba(0,0,0,0.06); max-width: 600px; margin: 0 auto; }
    .btn { flex: 1; padding: 12px; border-radius: 10px; font-size: 14.5px; font-weight: 700; text-align: center; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 6px; border: none; cursor: pointer; }
    .btn-call { background: #dc2626; color: #ffffff; }
    .btn-zalo { background: #0068ff; color: #ffffff; }
    .btn-book { background: #059669; color: #ffffff; }
    
    /* Appointment modal/section */
    .apt-form { margin-top: 10px; }
    .apt-input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 8px; font-size: 13.5px; }
    .btn-submit { width: 100%; background: #059669; color: #ffffff; padding: 11px; border-radius: 8px; border: none; font-weight: 700; font-size: 14px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <img src="${origin}/logo_hl.png" alt="House & Life" />
      <span>House & Life</span>
    </div>
    <span class="badge-hl">BĐS Chọn Lọc</span>
  </div>

  <img class="hero-img" src="${escapeHtml(heroImage)}" alt="${escapeHtml(title)}" />

  <div class="container">
    <div class="price-box">
      <div class="price">${escapeHtml(priceDisplay)}</div>
      <div style="font-size: 13px; color: #64748b; font-weight: 600;">${escapeHtml(typeDisplay)}</div>
    </div>

    <h1 class="title">${escapeHtml(title)}</h1>

    <div class="specs-grid">
      <div class="spec-item">
        <div class="spec-label">Vị trí</div>
        <div class="spec-val">${escapeHtml(locationDisplay)}</div>
      </div>
      <div class="spec-item">
        <div class="spec-label">Diện tích</div>
        <div class="spec-val">${escapeHtml(areaDisplay || 'Đang cập nhật')}</div>
      </div>
      <div class="spec-item">
        <div class="spec-label">Hướng nhà/đất</div>
        <div class="spec-val">${escapeHtml(directionDisplay)}</div>
      </div>
      <div class="spec-item">
        <div class="spec-label">Pháp lý</div>
        <div class="spec-val">${escapeHtml(legalDisplay)}</div>
      </div>
    </div>

    ${
      sellingPoints.length > 0
        ? `<div class="card">
      <div class="card-title">Ưu điểm nổi bật</div>
      <ul class="points">
        ${sellingPoints.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
      </ul>
    </div>`
        : ''
    }

    <div class="card">
      <div class="card-title">Thông tin chi tiết</div>
      <div class="desc">${escapeHtml(description)}</div>
    </div>

    <div class="card">
      <div class="card-title">Đặt lịch xem thực tế</div>
      <form class="apt-form" id="aptForm" onsubmit="submitAppointment(event)">
        <input class="apt-input" type="text" id="custName" placeholder="Họ và tên của bạn *" required />
        <input class="apt-input" type="tel" id="custPhone" placeholder="Số điện thoại Zalo/di động *" required />
        <input class="apt-input" type="datetime-local" id="custTime" required />
        <button type="submit" class="btn-submit">Xác nhận hẹn xem BĐS</button>
      </form>
      <div id="aptMsg" style="display:none; font-size: 13px; color: #059669; font-weight: 600; margin-top: 8px;"></div>
    </div>

    <div style="text-align: center; margin-top: 14px;">
      <a href="${origin}" style="font-size: 13px; color: #64748b; text-decoration: none;">Xem thêm giỏ hàng tại bdsdanang.site →</a>
    </div>
  </div>

  <div class="action-bar">
    <a href="tel:${hotlineClean}" class="btn btn-call">📞 Gọi ngay</a>
    <a href="https://zalo.me/${zaloClean}" target="_blank" class="btn btn-zalo">💬 Chat Zalo</a>
  </div>

  <script>
    async function submitAppointment(e) {
      e.preventDefault();
      const name = document.getElementById('custName').value.trim();
      const phone = document.getElementById('custPhone').value.trim();
      const time = document.getElementById('custTime').value;
      if (!name || !phone || !time) return;

      try {
        const res = await fetch('/api/public/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: name,
            customerPhone: phone,
            appointmentTime: new Date(time).toISOString(),
            propertyId: "${escapeHtml(property.id)}",
            propertyTitle: "${escapeHtml(title)}",
            notes: "Đặt qua Fast Mini Landing Page"
          })
        });
        const json = await res.json();
        const msg = document.getElementById('aptMsg');
        msg.style.display = 'block';
        if (json.status === 'success') {
          msg.textContent = '✓ ' + json.message;
          document.getElementById('aptForm').reset();
        } else {
          msg.textContent = '✕ ' + (json.message || 'Lỗi đặt lịch');
          msg.style.color = '#dc2626';
        }
      } catch (err) {
        alert('Lỗi kết nối. Vui lòng bấm Gọi ngay để được hỗ trợ.');
      }
    }
  </script>
</body>
</html>`;
}
