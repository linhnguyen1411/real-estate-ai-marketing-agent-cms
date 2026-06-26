export interface PostCta {
  title: string;
  description: string;
  buttonText: string;
  leadIntent: string;
}

export interface PostCtaInput {
  title: string;
  primaryKeyword?: string | null;
  tags?: string[];
  categoryName?: string | null;
  contentText?: string;
}

const SUN_GROUP_TERMS =
  /sun symphony|sun s light|sun slight|sun cosmo|sun cora|sun fours|sun ponte|sun spana/i;
const MAI_DANG_CHON = /mai đăng chơn|mai dang chon/i;
const LAND_HOUSE =
  /hòa xuân|hoa xuan|nam hòa xuân|điện ngọc|dien ngoc|đất nền|dat nen|nhà phố|nha pho/i;

function haystack(input: PostCtaInput) {
  return [
    input.title,
    input.primaryKeyword,
    input.categoryName,
    ...(input.tags || []),
    input.contentText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function buildPostCta(input: PostCtaInput): PostCta {
  const text = haystack(input);

  if (SUN_GROUP_TERMS.test(text)) {
    return {
      title: 'Nhận bảng hàng và chính sách mới nhất',
      description:
        'Để lại thông tin để nhận bảng giá, chính sách thanh toán, giỏ hàng chuyển nhượng và tư vấn lựa chọn căn phù hợp.',
      buttonText: 'Nhận bảng hàng',
      leadIntent: 'sun_group_price_request',
    };
  }

  if (MAI_DANG_CHON.test(text)) {
    return {
      title: 'Nhận thông tin quỹ đất Mai Đăng Chơn',
      description:
        'Để lại thông tin để nhận vị trí, pháp lý, phương án khai thác và danh sách tài sản đang có.',
      buttonText: 'Nhận thông tin quỹ đất',
      leadIntent: 'mai_dang_chon_inquiry',
    };
  }

  if (LAND_HOUSE.test(text)) {
    return {
      title: 'Xem giỏ hàng đất nền - nhà phố phù hợp',
      description:
        'Để lại thông tin để nhận danh sách tài sản ký gửi đã lọc theo khu vực, ngân sách và pháp lý.',
      buttonText: 'Xem giỏ hàng phù hợp',
      leadIntent: 'land_house_inventory',
    };
  }

  return {
    title: 'Nhận tư vấn và thông tin phù hợp',
    description:
      'Để lại thông tin để được tư vấn sản phẩm, chính sách và cơ hội phù hợp với nhu cầu.',
    buttonText: 'Liên hệ thêm thông tin',
    leadIntent: 'general_consultation',
  };
}
