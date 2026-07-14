import React, { FormEvent, Dispatch, SetStateAction } from 'react';
import { Edit, Eye, Home, X, GripVertical, Image as ImageIcon } from 'lucide-react';
import MarkdownEditor from '../../../components/MarkdownEditor';
import { uploadContentImage } from '../../../services/blogApi';
import type { Property } from '../../../types';
import { getPropertyCreatorName } from '../../../utils/propertyCreator';
import { hashtagsToKeywords } from '../../../utils/hashtags';
import { resizeImageFile } from '../../../utils/resizeImageFile';
import { MARKET_ZONE_OPTIONS, type ProjectGroup } from '../../../seo/propertyCatalog';
import { getAuthToken } from '../../../services/api';
import {
  PROPERTY_TYPE_OPTIONS,
  TRANSACTION_TYPE_OPTIONS,
  DIRECTION_OPTIONS,
  LEGAL_STATUS_OPTIONS,
  PROPERTY_STATUS_OPTIONS,
  createEmptyPropertyForm,
} from '../propertyConstants';

type FormState = ReturnType<typeof createEmptyPropertyForm>;

type Props = {
  open: boolean;
  editingProperty: Property | null;
  newPropertyForm: FormState;
  setNewPropertyForm: Dispatch<SetStateAction<FormState>>;
  customProjectMode: boolean;
  setCustomProjectMode: (v: boolean) => void;
  draggedGalleryIndex: number | null;
  setDraggedGalleryIndex: (v: number | null) => void;
  projectCatalogGroups: ProjectGroup[];
  propertyCreatorNameById: Map<string, string>;
  detectedPropertyHashtags: string[];
  actionLoading: string | null;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  onReorderGallery: (from: number, to: number) => void;
  onReadImageFiles: (files: FileList | null) => Promise<string[]>;
};

export default function PropertyFormModal({
  open,
  editingProperty,
  newPropertyForm,
  setNewPropertyForm,
  customProjectMode,
  setCustomProjectMode,
  draggedGalleryIndex,
  setDraggedGalleryIndex,
  projectCatalogGroups,
  propertyCreatorNameById,
  detectedPropertyHashtags,
  actionLoading,
  onClose,
  onSubmit,
  onReorderGallery,
  onReadImageFiles,
}: Props) {
  const closePropertyModal = onClose;
  const handleSaveProperty = onSubmit;
  const reorderGalleryImages = onReorderGallery;
  const readImageFiles = onReadImageFiles;

  if (!open) return null;

  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-6 py-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                {editingProperty ? <Edit className="w-5 h-5 text-rose-500" /> : <Home className="w-5 h-5 text-rose-500" />}
                {editingProperty ? 'Chỉnh sửa bất động sản' : 'Thêm bất động sản mới lên kệ'}
              </h3>
              <button onClick={closePropertyModal} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProperty} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 app-scroll">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {editingProperty && (
                  <div className="md:col-span-2 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-xs text-violet-200">
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="inline-flex items-center gap-1 font-bold">
                        <Eye className="h-3.5 w-3.5" />
                        {Number(editingProperty.public_view_count || 0).toLocaleString('vi-VN')} lượt xem trang công khai
                      </span>
                      {editingProperty.last_public_view_at && (
                        <span className="text-violet-300/80">
                          Xem gần nhất: {new Date(editingProperty.last_public_view_at).toLocaleString('vi-VN')}
                        </span>
                      )}
                      <span className="text-violet-300/90">
                        Người tạo: {getPropertyCreatorName(editingProperty, propertyCreatorNameById)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Tiêu đề bất động sản</label>
                  <input
                    type="text"
                    required
                    value={newPropertyForm.title}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, title: e.target.value })}
                    placeholder="Bán Lô Đất Góc Hòa Xuân"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Phân khúc / Chủng loại</label>
                  <select
                    value={newPropertyForm.type}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  >
                    {PROPERTY_TYPE_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Hình thức</label>
                  <select
                    value={newPropertyForm.transaction_type}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, transaction_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  >
                    {TRANSACTION_TYPE_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Khu vực thị trường</label>
                  <select
                    value={newPropertyForm.market_zone}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, market_zone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  >
                    {MARKET_ZONE_OPTIONS.map(option => (
                      <option key={option.value || 'none'} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="block text-2xs font-semibold text-slate-400">Dự án / phân khu</label>
                  {!customProjectMode ? (
                    <select
                      value={newPropertyForm.project_name}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setCustomProjectMode(true);
                          setNewPropertyForm({ ...newPropertyForm, project_name: '' });
                          return;
                        }
                        setNewPropertyForm({ ...newPropertyForm, project_name: e.target.value });
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                    >
                      <option value="">— Chọn dự án —</option>
                      {projectCatalogGroups.map(group => (
                        <optgroup key={group.zone} label={group.label}>
                          {group.projects.map(project => (
                            <option key={`${group.zone}-${project}`} value={project}>{project}</option>
                          ))}
                        </optgroup>
                      ))}
                      <option value="__custom__">+ Thêm dự án mới...</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newPropertyForm.project_name}
                        onChange={(e) => setNewPropertyForm({ ...newPropertyForm, project_name: e.target.value })}
                        placeholder="Nhập tên dự án / phân khu mới"
                        className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCustomProjectMode(false);
                          setNewPropertyForm({ ...newPropertyForm, project_name: '' });
                        }}
                        className="shrink-0 rounded-xl border border-slate-700 px-3 text-xs text-slate-300"
                      >
                        Chọn lại
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Vị trí địa chỉ chính xác</label>
                  <input
                    type="text"
                    required
                    value={newPropertyForm.location}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, location: e.target.value })}
                    placeholder="Võ Chí Công, Hải Châu, Đà Nẵng"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Giá trị / giá thuê (Tỷ đồng)</label>
                  <input
                    type="number"
                    step="0.05"
                    required
                    value={newPropertyForm.price}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, price: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 animate-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Diện tích đất / căn hộ (m2)</label>
                  <input
                    type="number"
                    required
                    value={newPropertyForm.area}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, area: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 animate-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Diện tích sàn (m2)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={newPropertyForm.floor_area}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, floor_area: e.target.value })}
                    placeholder="Bỏ trống nếu không áp dụng"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 animate-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Pháp lý hiện hành</label>
                  <select
                    required
                    value={newPropertyForm.legal_status}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, legal_status: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  >
                    {LEGAL_STATUS_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Hướng</label>
                  <select
                    value={newPropertyForm.direction}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, direction: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  >
                    {DIRECTION_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Lòng đường rộng bao nhiêu (mét)</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={newPropertyForm.road_width}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, road_width: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 animate-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Số tầng</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={newPropertyForm.floors}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, floors: e.target.value })}
                    placeholder="Bỏ trống nếu là đất"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 animate-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Số phòng ngủ</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={newPropertyForm.bedrooms}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, bedrooms: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 animate-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Số phòng tắm</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={newPropertyForm.bathrooms}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, bathrooms: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 animate-none"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="block text-2xs font-semibold text-slate-400">Công năng phụ</label>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={newPropertyForm.garage}
                        onChange={(e) => setNewPropertyForm({ ...newPropertyForm, garage: e.target.checked })}
                        className="h-4 w-4 accent-rose-600"
                      />
                      Gara
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={newPropertyForm.pool}
                        onChange={(e) => setNewPropertyForm({ ...newPropertyForm, pool: e.target.checked })}
                        className="h-4 w-4 accent-rose-600"
                      />
                      Hồ bơi
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <label className="block text-2xs font-semibold text-slate-400">Mô tả Markdown để copy nhanh</label>
                    <p className="mt-1 text-2xs text-slate-500">
                      Gõ hashtag bằng thẻ <span className="font-mono text-emerald-300">#</span> trong mô tả hoặc điểm nhấn — hệ thống tự nhận diện và đưa vào meta SEO website khi lưu BĐS.
                    </p>
                  </div>
                </div>
                <MarkdownEditor
                  value={newPropertyForm.rich_description}
                  onChange={(richDescription) => setNewPropertyForm({ ...newPropertyForm, rich_description: richDescription })}
                  onUploadImage={async file => {
                    const token = getAuthToken();
                    if (!token) throw new Error('Cần đăng nhập để upload ảnh.');
                    const dataUrl = await resizeImageFile(file);
                    const { url } = await uploadContentImage(token, dataUrl, newPropertyForm.title || 'property');
                    return url;
                  }}
                />
              </div>

              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
                <div className="text-xs font-bold text-emerald-300">Hashtag nhận diện tự động</div>
                {detectedPropertyHashtags.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {detectedPropertyHashtags.map(tag => (
                        <span key={tag} className="rounded-md bg-emerald-500/10 px-2.5 py-1 text-2xs font-semibold text-emerald-300">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="text-2xs text-slate-400">
                      Keyword SEO sau lưu: {hashtagsToKeywords(detectedPropertyHashtags).join(', ')}
                    </p>
                  </>
                ) : (
                  <p className="text-2xs text-slate-500">Thêm hashtag vào mô tả hoặc điểm nhấn, ví dụ: #Shophouse #HoaXuan #BatDongSanDaNang</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Upload ảnh lưu trữ</label>
                  <p className="text-2xs text-slate-500">Ảnh tự resize tối đa 1280px. Kéo thả để sắp xếp — ảnh đầu tiên là ảnh chính.</p>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={async (e) => {
                      const uploaded = await readImageFiles(e.target.files);
                      setNewPropertyForm(prev => {
                        const gallery = [...prev.gallery_images, ...uploaded].slice(0, 8);
                        return {
                          ...prev,
                          gallery_images: gallery,
                          images: gallery[0] || ''
                        };
                      });
                      e.target.value = '';
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:text-slate-200"
                  />
                  {newPropertyForm.gallery_images.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pt-2 pb-1">
                      {newPropertyForm.gallery_images.map((img, idx) => (
                        <div
                          key={`${idx}-${img.slice(0, 48)}`}
                          draggable
                          onDragStart={() => setDraggedGalleryIndex(idx)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (draggedGalleryIndex !== null) {
                              reorderGalleryImages(draggedGalleryIndex, idx);
                            }
                            setDraggedGalleryIndex(null);
                          }}
                          onDragEnd={() => setDraggedGalleryIndex(null)}
                          className={`relative shrink-0 rounded-lg transition-all ${
                            draggedGalleryIndex === idx ? 'opacity-40 scale-95' : ''
                          } ${idx === 0 ? 'ring-2 ring-rose-500 ring-offset-2 ring-offset-slate-950' : ''}`}
                        >
                          <img
                            src={img}
                            alt={`Ảnh ${idx + 1}`}
                            draggable={false}
                            className="h-16 w-16 rounded-lg object-cover border border-slate-800 pointer-events-none"
                          />
                          <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-slate-950/85 px-1 py-0.5 text-[10px] font-bold text-slate-200">
                            <GripVertical className="h-3 w-3" />
                            {idx + 1}
                          </span>
                          {idx === 0 && (
                            <span className="absolute bottom-1 left-1 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              Ảnh chính
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setNewPropertyForm(prev => {
                                const galleryImages = prev.gallery_images.filter((_, imageIndex) => imageIndex !== idx);
                                return {
                                  ...prev,
                                  gallery_images: galleryImages,
                                  images: galleryImages[0] || ''
                                };
                              });
                            }}
                            className="absolute -right-1 -top-1 rounded-full bg-rose-600 p-1 text-white shadow"
                            aria-label="Xóa ảnh"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Trạng thái bán hàng</label>
                  <select
                    value={newPropertyForm.sale_status}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, sale_status: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  >
                    {PROPERTY_STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={newPropertyForm.is_featured}
                    onChange={(e) => setNewPropertyForm({ ...newPropertyForm, is_featured: e.target.checked })}
                    className="h-4 w-4 accent-rose-600"
                  />
                  Gắn BDS nổi bật
                </label>
              </div>

              <div className="space-y-1">
                <label className="block text-2xs font-semibold text-slate-400">Điểm nhấn bán hàng (Mỗi dòng một điểm)</label>
                <textarea
                  rows={2}
                  value={newPropertyForm.selling_points}
                  onChange={(e) => setNewPropertyForm({ ...newPropertyForm, selling_points: e.target.value })}
                  placeholder="View trực diện bờ sông\nHạ tầng điện ngầm đồng bộ\n#Shophouse #HoaXuan"
                  className="w-full bg-slate-950 border border-slate-800 text-xs rounded-xl p-3"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-2xs font-semibold text-slate-400">Ghi chú bổ sung cho AI/Search</label>
                <textarea
                  rows={3}
                  value={newPropertyForm.internal_notes}
                  onChange={(e) => setNewPropertyForm({ ...newPropertyForm, internal_notes: e.target.value })}
                  placeholder="VD: chủ cần bán nhanh, thương lượng sâu, phù hợp khách đầu tư giữ tiền, ưu tiên khách có sẵn tiền..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closePropertyModal}
                  className="bg-slate-950 hover:bg-slate-850 text-slate-400 text-xs px-4 py-2 rounded-xl border border-slate-800"
                >
                  Bỏ qua
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'add-property' || actionLoading === `edit-prop-${editingProperty?.id}`}
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs px-5 py-2 rounded-xl transition-all shadow-md shadow-rose-600/10"
                >
                  {actionLoading === 'add-property' || actionLoading === `edit-prop-${editingProperty?.id}`
                    ? 'Đang lưu...'
                    : editingProperty ? 'Lưu thay đổi' : 'Thêm mới BĐS'}
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
