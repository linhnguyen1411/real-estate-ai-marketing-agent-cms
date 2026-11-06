import React, { useRef, useState } from 'react';
import {
  X, Zap, CheckCircle2, Sparkles, Send, ShieldCheck, Tag, ImagePlus, GripVertical,
} from 'lucide-react';

import { getAuthToken } from '../../../services/api';
import { resizeImageFile } from '../../../utils/resizeImageFile';
import { MARKET_ZONE_OPTIONS, type ProjectGroup } from '../../../seo/propertyCatalog';
import {
  PROPERTY_TYPE_OPTIONS,
  TRANSACTION_TYPE_OPTIONS,
  DIRECTION_OPTIONS,
  LEGAL_STATUS_OPTIONS,
  PROPERTY_STATUS_OPTIONS,
} from '../propertyConstants';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
  projectGroups: ProjectGroup[];
};

const SAMPLE_RAW_TEXT = `Chính chủ cần bán gấp lô đất B2-15 lô 45 KĐT Nam Hòa Xuân, mặt tiền đường 7.5m Minh Mạng, diện tích 100m2 (5x20), hướng Đông Nam mát mẻ, sổ hồng riêng sẵn sàng sang tên công chứng ngay. Giá bán nhanh 3.85 tỷ bớt lộc. Liên hệ chính chủ: 0905777594 xem đất trực tiếp.`;

const MAX_IMAGES = 8;

const toNumber = (value: unknown): number => {
  const parsed = parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === '' || value == null) return undefined;
  const parsed = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
};

export default function QuickPostModal({ isOpen, onClose, onSuccess, onNotify, projectGroups }: Props) {
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [parsedData, setParsedData] = useState<any | null>(null);
  const [sellingPointsText, setSellingPointsText] = useState('');
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [customProjectMode, setCustomProjectMode] = useState(false);
  const [draggedGalleryIndex, setDraggedGalleryIndex] = useState<number | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  if (!isOpen) return null;

  const knownProjects = projectGroups.flatMap(group => group.projects);

  const handleQuickParse = async (textToParse = rawText) => {
    const text = textToParse.trim();
    if (!text) {
      onNotify('Vui lòng nhập hoặc dán nội dung tin nhắn trước.', 'error');
      return;
    }

    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/admin/properties/quick-parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ rawText: text }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setParsedData(json.data);
        setSellingPointsText(Array.isArray(json.data.selling_points) ? json.data.selling_points.join('\n') : '');
        setCustomProjectMode(Boolean(json.data.project_name && !knownProjects.includes(json.data.project_name)));
        window.setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
        onNotify('Bóc tách thông số và tạo Auto-SEO thành công!', 'success');
      } else {
        onNotify(json.message || 'Không thể bóc tách dữ liệu', 'error');
      }
    } catch (err: any) {
      onNotify(err.message || 'Lỗi kết nối máy chủ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFillSample = () => {
    setRawText(SAMPLE_RAW_TEXT);
    handleQuickParse(SAMPLE_RAW_TEXT);
  };

  const updateField = (patch: Record<string, unknown>) => {
    setParsedData((prev: any) => ({ ...prev, ...patch }));
  };

  const handleImageFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = MAX_IMAGES - galleryImages.length;
    if (remaining <= 0) {
      onNotify(`Chỉ được chọn tối đa ${MAX_IMAGES} ảnh.`, 'error');
      return;
    }

    setUploadingImages(true);
    try {
      const selected = Array.from(files).filter(file => file.type.startsWith('image/')).slice(0, remaining);
      if (!selected.length) {
        onNotify('Vui lòng chọn file ảnh hợp lệ.', 'error');
        return;
      }
      const resized = await Promise.all(selected.map(file => resizeImageFile(file)));
      setGalleryImages(prev => [...prev, ...resized].slice(0, MAX_IMAGES));
    } catch (err: any) {
      onNotify(err.message || 'Không thể xử lý ảnh.', 'error');
    } finally {
      setUploadingImages(false);
    }
  };

  const removeGalleryImage = (index: number) => {
    setGalleryImages(prev => prev.filter((_, imageIndex) => imageIndex !== index));
  };

  const reorderGalleryImages = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setGalleryImages(prev => {
      const gallery = [...prev];
      const [moved] = gallery.splice(fromIndex, 1);
      gallery.splice(toIndex, 0, moved);
      return gallery;
    });
  };

  const handlePublish = async () => {
    if (!parsedData) return;
    setPublishing(true);
    try {
      const token = getAuthToken();
      const sellingPoints = sellingPointsText
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      const payload = {
        ...parsedData,
        area: toNumber(parsedData.area),
        floor_area: toOptionalNumber(parsedData.floor_area),
        price: toNumber(parsedData.price),
        road_width: toNumber(parsedData.road_width),
        floors: toOptionalNumber(parsedData.floors),
        bedrooms: toOptionalNumber(parsedData.bedrooms),
        bathrooms: toOptionalNumber(parsedData.bathrooms),
        garage: Boolean(parsedData.garage),
        pool: Boolean(parsedData.pool),
        is_featured: Boolean(parsedData.is_featured),
        sale_status: parsedData.sale_status || 'available',
        listing_source: parsedData.listing_source || 'broker',
        project_name: String(parsedData.project_name || '').trim() || undefined,
        market_zone: parsedData.market_zone || undefined,
        description: sellingPoints.join('. ') || parsedData.rich_description || '',
        selling_points: sellingPoints,
        images: galleryImages[0] || '',
        gallery_images: galleryImages,
      };
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.status === 'success') {
        onNotify(`🎉 Xuất bản thành công: ${json.data.title}`, 'success');
        setRawText('');
        setParsedData(null);
        setSellingPointsText('');
        setGalleryImages([]);
        setCustomProjectMode(false);
        onSuccess();
        onClose();
      } else {
        onNotify(json.message || 'Xuất bản thất bại', 'error');
      }
    } catch (err: any) {
      onNotify(err.message || 'Lỗi khi lưu bất động sản', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const fieldClass = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white outline-none focus:border-rose-500';
  const labelClass = 'text-2xs font-medium text-slate-400';
  const legalStatusOptions = parsedData && !LEGAL_STATUS_OPTIONS.includes(parsedData.legal_status)
    ? [parsedData.legal_status, ...LEGAL_STATUS_OPTIONS]
    : LEGAL_STATUS_OPTIONS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-950/50 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white shadow-lg shadow-rose-500/20">
              <Zap className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="flex flex-wrap items-center gap-2 text-base font-bold text-white">
                Đăng nhanh 1 chạm & Auto SEO Engine
                <span className="hidden shrink-0 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-0.5 text-2xs font-semibold text-rose-400 sm:inline-flex">
                  AI + Regex NLP
                </span>
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Dán tin nhắn Zalo / Facebook thô. Hệ thống tự bóc tách thông số, tạo SEO Title, Meta và Schema.
              </p>
              <span className="mt-2 inline-flex rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-0.5 text-2xs font-semibold text-rose-400 sm:hidden">
                AI + Regex NLP
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:space-y-6 sm:p-6">
          {/* Step 1: Raw Text Input */}
          <div className="space-y-2">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                1. Dán nội dung tin nhắn thô (Zalo, Facebook, SMS)
              </label>
              <button
                type="button"
                onClick={handleFillSample}
                className="shrink-0 self-start text-xs font-medium text-rose-400 underline hover:text-rose-300 sm:self-auto"
              >
                + Dán thử mẫu BĐS Nam Hòa Xuân
              </button>
            </div>
            <textarea
              rows={4}
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder="Ví dụ: Bán đất B2-15 lô 45 Nam Hòa Xuân, đường 7.5m Minh Mạng, 100m2 (5x20), hướng Đông Nam, sổ đỏ sẵn. Giá 3.85 tỷ. LH 0905777594..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={loading || !rawText.trim()}
                onClick={() => handleQuickParse()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-600/20 transition-all hover:brightness-110 disabled:opacity-50 sm:w-auto"
              >
                {loading ? (
                  <>Đang bóc tách NLP & Regex...</>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Phân tích & Tự động sinh SEO
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Step 2: Parsed Form Preview */}
          {parsedData && (
            <div ref={resultRef} className="space-y-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 sm:p-5">
              <div className="flex flex-col gap-2 border-b border-emerald-500/20 pb-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <h4 className="flex items-center gap-2 text-sm font-bold leading-snug text-emerald-400 sm:whitespace-nowrap">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  2. Kết quả bóc tách & Chuẩn hóa Auto-SEO
                </h4>
                <span className="w-full rounded bg-slate-800 px-2 py-1 font-mono text-2xs leading-relaxed text-slate-400 sm:w-auto sm:shrink-0 sm:whitespace-nowrap sm:py-0.5">
                  Format: [Loại hình] [Block/Lô] [Dự án] - [Đường] - [DT] - [Giá]
                </span>
              </div>

              {/* Standard SEO Title */}
              <div className="space-y-1">
                <label className="text-2xs font-semibold uppercase text-slate-400">
                  SEO Title chuẩn hóa:
                </label>
                <input
                  type="text"
                  value={parsedData.title || ''}
                  onChange={e => updateField({ title: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-amber-300 outline-none focus:border-rose-500"
                />
              </div>

              {/* Basic information */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                <div>
                  <label className={labelClass}>Loại hình</label>
                  <select value={parsedData.type} onChange={e => updateField({ type: e.target.value })} className={fieldClass}>
                    {PROPERTY_TYPE_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Hình thức</label>
                  <select value={parsedData.transaction_type} onChange={e => updateField({ transaction_type: e.target.value })} className={fieldClass}>
                    {TRANSACTION_TYPE_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Nguồn tin</label>
                  <select value={parsedData.listing_source || 'broker'} onChange={e => updateField({ listing_source: e.target.value })} className={fieldClass}>
                    <option value="broker">Môi giới (Broker)</option>
                    <option value="owner">Chính chủ (Owner)</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Khu vực thị trường</label>
                  <select value={parsedData.market_zone || ''} onChange={e => updateField({ market_zone: e.target.value })} className={fieldClass}>
                    {MARKET_ZONE_OPTIONS.map(option => (
                      <option key={option.value || 'none'} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className={labelClass}>Dự án / Phân khu</label>
                  {!customProjectMode ? (
                    <select
                      value={parsedData.project_name || ''}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setCustomProjectMode(true);
                          updateField({ project_name: '' });
                          return;
                        }
                        updateField({ project_name: e.target.value });
                      }}
                      className={fieldClass}
                    >
                      <option value="">— Chọn dự án —</option>
                      {projectGroups.map(group => (
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
                        value={parsedData.project_name || ''}
                        onChange={e => updateField({ project_name: e.target.value })}
                        placeholder="Nhập tên dự án / phân khu"
                        className={fieldClass}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCustomProjectMode(false);
                          updateField({ project_name: '' });
                        }}
                        className="shrink-0 rounded-lg border border-slate-700 px-3 text-2xs text-slate-300"
                      >
                        Chọn lại
                      </button>
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Vị trí địa chỉ</label>
                  <input
                    type="text"
                    value={parsedData.location || ''}
                    onChange={e => updateField({ location: e.target.value })}
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Block</label>
                  <input
                    type="text"
                    value={parsedData.block || ''}
                    placeholder="B2-XX"
                    onChange={e => updateField({ block: e.target.value })}
                    className={`${fieldClass} font-bold text-rose-300`}
                  />
                </div>
                <div>
                  <label className={labelClass}>Lô số</label>
                  <input
                    type="text"
                    value={parsedData.lot || ''}
                    placeholder="Lô YY"
                    onChange={e => updateField({ lot: e.target.value })}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Tuyến đường</label>
                  <input
                    type="text"
                    value={parsedData.street || ''}
                    onChange={e => updateField({ street: e.target.value })}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Lòng đường (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={parsedData.road_width ?? ''}
                    onChange={e => updateField({ road_width: e.target.value })}
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Diện tích (m²)</label>
                  <input
                    type="number"
                    value={parsedData.area ?? ''}
                    onChange={e => updateField({ area: e.target.value })}
                    className={`${fieldClass} font-semibold`}
                  />
                </div>
                <div>
                  <label className={labelClass}>Diện tích sàn (m²)</label>
                  <input
                    type="number"
                    min="0"
                    value={parsedData.floor_area ?? ''}
                    onChange={e => updateField({ floor_area: e.target.value })}
                    placeholder="Nếu có"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Giá bán (tỷ VND)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={parsedData.price ?? ''}
                    onChange={e => updateField({ price: e.target.value })}
                    className={`${fieldClass} font-bold text-emerald-400`}
                  />
                </div>
                <div>
                  <label className={labelClass}>Pháp lý</label>
                  <select value={parsedData.legal_status} onChange={e => updateField({ legal_status: e.target.value })} className={fieldClass}>
                    {legalStatusOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Hướng</label>
                  <select value={parsedData.direction} onChange={e => updateField({ direction: e.target.value })} className={fieldClass}>
                    {DIRECTION_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Số tầng</label>
                  <input
                    type="number"
                    min="0"
                    value={parsedData.floors ?? ''}
                    onChange={e => updateField({ floors: e.target.value })}
                    placeholder="Bỏ trống nếu là đất"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Phòng ngủ</label>
                  <input
                    type="number"
                    min="0"
                    value={parsedData.bedrooms ?? ''}
                    onChange={e => updateField({ bedrooms: e.target.value })}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Phòng tắm</label>
                  <input
                    type="number"
                    min="0"
                    value={parsedData.bathrooms ?? ''}
                    onChange={e => updateField({ bathrooms: e.target.value })}
                    className={fieldClass}
                  />
                </div>

                <div className="col-span-2">
                  <label className={labelClass}>SĐT Liên hệ</label>
                  <input
                    type="text"
                    value={parsedData.contact_phone || ''}
                    placeholder="0905..."
                    onChange={e => updateField({ contact_phone: e.target.value })}
                    className={`${fieldClass} font-mono`}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Công năng phụ</label>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(parsedData.garage)}
                        onChange={e => updateField({ garage: e.target.checked })}
                        className="h-4 w-4 accent-rose-600"
                      />
                      Gara
                    </label>
                    <label className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(parsedData.pool)}
                        onChange={e => updateField({ pool: e.target.checked })}
                        className="h-4 w-4 accent-rose-600"
                      />
                      Hồ bơi
                    </label>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Trạng thái bán</label>
                  <select value={parsedData.sale_status || 'available'} onChange={e => updateField({ sale_status: e.target.value })} className={fieldClass}>
                    {PROPERTY_STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex min-h-9 w-full items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={Boolean(parsedData.is_featured)}
                      onChange={e => updateField({ is_featured: e.target.checked })}
                      className="h-4 w-4 accent-rose-600"
                    />
                    BĐS nổi bật
                  </label>
                </div>
              </div>

              {/* Images */}
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-2xs font-semibold uppercase text-slate-400">
                    <ImagePlus className="w-3.5 h-3.5 text-emerald-400" />
                    Hình ảnh BĐS ({galleryImages.length}/{MAX_IMAGES})
                  </label>
                  <label className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 ${uploadingImages || galleryImages.length >= MAX_IMAGES ? 'pointer-events-none opacity-50' : ''}`}>
                    <ImagePlus className="h-4 w-4" />
                    {uploadingImages ? 'Đang xử lý ảnh...' : 'Chọn ảnh'}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={uploadingImages || galleryImages.length >= MAX_IMAGES}
                      onChange={async e => {
                        await handleImageFiles(e.target.files);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
                <p className="text-2xs text-slate-500">
                  Ảnh tự resize tối đa 1600px. Kéo thả để sắp xếp — ảnh đầu tiên là ảnh chính.
                </p>
                {galleryImages.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {galleryImages.map((img, idx) => (
                      <div
                        key={`${idx}-${img.slice(0, 48)}`}
                        draggable
                        onDragStart={() => setDraggedGalleryIndex(idx)}
                        onDragOver={e => e.preventDefault()}
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
                          className="h-16 w-16 rounded-lg border border-slate-800 object-cover pointer-events-none"
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
                          onClick={() => removeGalleryImage(idx)}
                          className="absolute -right-1 -top-1 rounded-full bg-rose-600 p-1 text-white shadow"
                          aria-label={`Xóa ảnh ${idx + 1}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Meta Description */}
              <div className="space-y-1">
                <label className="text-2xs font-semibold uppercase text-slate-400">
                  Meta Description (Chuẩn SEO 160 ký tự):
                </label>
                <textarea
                  rows={2}
                  value={parsedData.meta_description || ''}
                  onChange={e => updateField({ meta_description: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                />
              </div>

              {/* Auto Generated Article Description */}
              <div className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <label className="flex items-center gap-1.5 text-2xs font-semibold uppercase text-slate-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Bài viết mô tả tự sinh (200 - 300 từ chống Thin / Duplicate Content):
                  </label>
                  <span className="text-2xs text-emerald-400 font-mono">
                    {String(parsedData.rich_description || '').split(/\s+/).filter(Boolean).length} từ
                  </span>
                </div>
                <textarea
                  rows={5}
                  value={parsedData.rich_description || ''}
                  onChange={e => updateField({ rich_description: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 leading-relaxed font-sans"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-2xs font-semibold uppercase text-slate-400">
                    Điểm nhấn bán hàng (mỗi dòng một điểm):
                  </label>
                  <textarea
                    rows={3}
                    value={sellingPointsText}
                    onChange={e => setSellingPointsText(e.target.value)}
                    placeholder={'View trực diện bờ sông\nHạ tầng đồng bộ'}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-2xs font-semibold uppercase text-slate-400">
                    Ghi chú nội bộ cho AI/Search:
                  </label>
                  <textarea
                    rows={3}
                    value={parsedData.internal_notes || ''}
                    onChange={e => updateField({ internal_notes: e.target.value })}
                    placeholder="VD: chủ cần bán nhanh, thương lượng sâu..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                  />
                </div>
              </div>

              {/* Schema JSON-LD indicator */}
              <div className="flex items-center gap-2 text-2xs text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <Tag className="w-3.5 h-3.5 text-rose-400" />
                <span>
                  Đã tự động tạo <strong>JSON-LD Schema (RealEstateListing / SingleFamilyResidence)</strong> chuẩn Google Rich Snippets (Currency: VND, InStock, Đà Nẵng).
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-col-reverse gap-2 border-t border-slate-800 bg-slate-950/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 sm:w-auto"
          >
            Đóng
          </button>

          <div className="flex flex-1 items-center gap-3 sm:flex-none sm:justify-end">
            <button
              type="button"
              disabled={publishing || !parsedData}
              onClick={handlePublish}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition-all hover:brightness-110 disabled:opacity-50 sm:w-auto sm:px-6"
            >
              {publishing ? (
                <>Đang lưu BĐS...</>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  🚀 Xuất bản ngay (1-Click)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
