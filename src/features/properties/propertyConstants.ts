export const PROPERTY_TYPE_OPTIONS = ['Đất nền', 'Nhà Phố', 'Căn Hộ', 'Shophouse', 'Kho xưởng', 'Nhà hàng', 'Khách sạn', 'Biệt thự', 'Villa', 'Khác'];
export const TRANSACTION_TYPE_OPTIONS = ['Bán', 'Cho thuê'];
export const DIRECTION_OPTIONS = ['Đông', 'Tây', 'Nam', 'Bắc', 'Đông Nam', 'Đông Bắc', 'Tây Nam', 'Tây Bắc'];
export const LEGAL_STATUS_OPTIONS = ['Sổ đỏ', 'Sổ hồng', 'Sổ hồng riêng', 'Sổ hồng hoàn công', 'Sở hữu lâu dài', 'Sở hữu 50 năm', 'Hợp đồng mua bán', 'Đang chờ sổ'];
export const PROPERTY_STATUS_OPTIONS = [
  { value: 'available', label: 'Đang bán/cho thuê' },
  { value: 'sold', label: 'Đã bán/đã thuê' },
  { value: 'hidden', label: 'Đã ẩn' }
];

export const createEmptyPropertyForm = () => ({
  title: '', transaction_type: 'Bán', type: 'Đất nền', location: '', area: '100', floor_area: '', price: '4.5',
  legal_status: 'Sổ hồng', direction: 'Đông Nam', road_width: '7.5',
  floors: '', bedrooms: '', bathrooms: '', garage: false, pool: false,
  description: '', rich_description: '', internal_notes: '', images: '', gallery_images: [] as string[],
  sale_status: 'available', is_featured: false, selling_points: '',
  market_zone: '', project_name: '',
});

