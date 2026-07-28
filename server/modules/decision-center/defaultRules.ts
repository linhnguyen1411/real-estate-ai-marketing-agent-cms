/**
 * Default Rule Library seed (Admin can edit — not permanently hardcoded at runtime).
 *
 * H2.4.3: additive keywords only when live audit proved misses
 * (broker chứng chỉ / seller listing patterns / buyer VN variants).
 */

import type { DecisionRule } from './types';

function r(
  id: string,
  group: string,
  keyword: string,
  weight: number,
  category: DecisionRule['category'],
  priority = 100,
): DecisionRule {
  return { id, group, keyword, weight, category, enabled: true, priority };
}

export const DEFAULT_DECISION_RULES: DecisionRule[] = [
  // BUYER
  r('buyer_can_mua', 'Buyer', 'cần mua', 40, 'buyer', 10),
  r('buyer_muon_mua', 'Buyer', 'muốn mua', 38, 'buyer', 11),
  r('buyer_dang_tim', 'Buyer', 'đang tìm', 28, 'buyer', 20),
  r('buyer_tim_mua', 'Buyer', 'tìm mua', 36, 'buyer', 12),
  r('buyer_can_tim', 'Buyer', 'cần tìm', 34, 'buyer', 13),
  r('buyer_dang_can', 'Buyer', 'đang cần', 30, 'buyer', 15),
  r('buyer_ai_ban', 'Buyer', 'ai bán', 30, 'buyer', 18),
  r('buyer_ai_co_lo', 'Buyer', 'ai có lô', 30, 'buyer', 18),
  r('buyer_tai_chinh', 'Buyer', 'tài chính', 30, 'signal', 15),
  r('buyer_tam_tai_chinh', 'Buyer', 'tầm tài chính', 28, 'signal', 16),
  r('buyer_ngan_sach', 'Buyer', 'ngân sách', 28, 'signal', 16),
  r('buyer_bao_nhieu', 'Buyer', 'bao nhiêu', 18, 'signal', 30),
  r('buyer_xin_tu_van', 'Buyer', 'xin tư vấn', 26, 'buyer', 22),
  r('buyer_xin_gia', 'Buyer', 'xin giá', 26, 'buyer', 22),
  r('buyer_gui_thong_tin', 'Buyer', 'gửi thông tin', 24, 'buyer', 24),
  r('buyer_mua_nha', 'Buyer', 'mua nhà', 32, 'buyer', 14),
  r('buyer_mua_dat', 'Buyer', 'mua đất', 32, 'buyer', 14),
  r('buyer_tim_nha', 'Buyer', 'tìm nhà', 32, 'buyer', 14),
  r('buyer_tim_dat', 'Buyer', 'tìm đất', 32, 'buyer', 14),
  r('buyer_can_dat', 'Buyer', 'cần đất', 32, 'buyer', 14),
  r('buyer_mua_can_ho', 'Buyer', 'mua căn hộ', 32, 'buyer', 14),

  // SELLER (negative for buyer funnel)
  // Evidence H2.4.2: "Nhà kiệt… Chỉ hơn 3 tỷ", "Mình có lo 10 tỷ… có nhà", "SẮP RA MẮT"
  r('seller_can_ban', 'Seller', 'cần bán', -60, 'seller', 5),
  r('seller_ban_gap', 'Seller', 'bán gấp', -55, 'seller', 6),
  r('seller_chinh_chu', 'Seller', 'chính chủ', -35, 'seller', 25),
  r('seller_ra_hang', 'Seller', 'ra hàng', -40, 'seller', 20),
  r('seller_ky_gui', 'Seller', 'ký gửi', -45, 'seller', 18),
  r('seller_em_ban', 'Seller', 'em bán', -50, 'seller', 8),
  r('seller_minh_co_lo', 'Seller', 'mình có lô', -40, 'seller', 12),
  r('seller_minh_co', 'Seller', 'mình có', -28, 'seller', 26),
  r('seller_co_nha', 'Seller', 'có nhà', -30, 'seller', 16),
  r('seller_chi_hon', 'Seller', 'chỉ hơn', -25, 'seller', 28),
  r('seller_sap_ra_mat', 'Seller', 'sắp ra mắt', -40, 'seller', 12),
  r('seller_can_ho_hiem', 'Seller', 'căn hộ hiếm', -30, 'seller', 20),

  // BROKER
  // Evidence H2.4.2: "THU HỒ SƠ THI CHỨNG CHỈ HÀNH NGHỀ MÔI GIỚI…"
  r('broker_moi_gioi', 'Broker', 'môi giới', -45, 'broker', 8),
  r('broker_chung_chi', 'Broker', 'chứng chỉ hành nghề', -50, 'broker', 7),
  r('broker_thi_chung_chi', 'Broker', 'thi chứng chỉ', -45, 'broker', 8),
  r('broker_ib_em', 'Broker', 'ib em', -35, 'broker', 20),
  r('broker_zalo_em', 'Broker', 'zalo em', -35, 'broker', 20),
  r('broker_lien_he_em', 'Broker', 'liên hệ em', -30, 'broker', 22),
  r('broker_e_ho_tro', 'Broker', 'e hỗ trợ', -30, 'broker', 22),

  // RENT
  r('rent_thue', 'Rent', 'thuê', -25, 'rent', 30),
  r('rent_can_thue', 'Rent', 'cần thuê', -40, 'rent', 10),
  r('rent_tim_thue', 'Rent', 'tìm thuê', -38, 'rent', 12),
  r('rent_mat_bang', 'Rent', 'mặt bằng', -20, 'rent', 35),
  r('rent_cho_thue', 'Rent', 'cho thuê', -40, 'negative', 10),

  // SPAM
  r('spam_tuyen_dung', 'Spam', 'tuyển dụng', -80, 'spam', 1),
  r('spam_viec_lam', 'Spam', 'việc làm', -80, 'spam', 2),
  r('spam_tuyen', 'Spam', 'tuyển', -80, 'spam', 3),
  r('spam_xe', 'Spam', 'xe', -50, 'spam', 40),
  r('spam_dien_thoai', 'Spam', 'điện thoại', -60, 'spam', 15),
  r('spam_livestream', 'Spam', 'livestream', -70, 'spam', 8),
  r('spam_game', 'Spam', 'game', -70, 'spam', 8),
  r('spam_giveaway', 'Spam', 'giveaway', -80, 'spam', 5),

  // LOCATION / CAMPAIGN signals
  r('loc_mai_dang_chon', 'Location', 'mai đăng chơn', 20, 'location', 20),
  r('loc_ngu_han_son', 'Location', 'ngũ hành sơn', 15, 'location', 22),
  r('loc_hoa_xuan', 'Location', 'hòa xuân', 18, 'location', 21),
  r('loc_son_tra', 'Location', 'sơn trà', 12, 'location', 25),
  r('sig_so', 'Signal', 'sổ', 10, 'signal', 40),
  r('sig_so_do', 'Signal', 'sổ đỏ', 14, 'signal', 35),
  r('sig_phap_ly', 'Signal', 'pháp lý', 12, 'research', 35),

  // INVESTOR / RESEARCH
  r('inv_dau_tu', 'Investor', 'đầu tư', 22, 'investor', 25),
  r('res_tim_hieu', 'Research', 'tìm hiểu', 10, 'research', 40),
  r('res_tham_khao', 'Research', 'tham khảo', 8, 'research', 42),

  // Campaign match helpers
  r('camp_mdc', 'Campaign', 'mai đăng chơn', 5, 'campaign', 50),
  r('camp_hx', 'Campaign', 'hòa xuân', 5, 'campaign', 50),
];

export const DEFAULT_CAMPAIGN_MAP: Array<{ keyword: string; campaignName: string }> = [
  { keyword: 'mai đăng chơn', campaignName: 'Mai Đăng Chơn' },
  { keyword: 'hòa xuân', campaignName: 'Hòa Xuân' },
  { keyword: 'ngũ hành sơn', campaignName: 'Ngũ Hành Sơn' },
];
