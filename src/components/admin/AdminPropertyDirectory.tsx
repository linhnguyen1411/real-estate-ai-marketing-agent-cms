import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit,
  Image as ImageIcon,
  LayoutGrid,
  List,
  MapPin,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingUp,
  User,
} from 'lucide-react';
import MarkdownContent from '../MarkdownContent';
import { getPropertyProjectLabel } from '../../seo/propertyCatalog';
import { getPropertyCreatorName } from '../../utils/propertyCreator';
import { Property } from '../../types';
import PaginationBar, { DEFAULT_PAGE_SIZE } from '../common/PaginationBar';

const VIEW_STORAGE_KEY = 'admin-property-view';

type ViewMode = 'grid' | 'list';

interface AdminPropertyDirectoryProps {
  properties: Property[];
  creatorNameById: Map<string, string>;
  propertyGalleryIndex: Record<string, number>;
  setPropertyGalleryIndex: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  actionLoading: string | null;
  onToggleFeatured: (prop: Property) => void;
  onEdit: (prop: Property) => void;
  onImageUpload: (prop: Property, files: FileList | null) => void;
  onCopyDescription: (prop: Property) => void;
  onToggleSold: (prop: Property) => void;
  onHide: (prop: Property) => void;
  onRestore: (prop: Property) => void;
  onOpenAiContent: (prop: Property) => void;
}

function readStoredView(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function propertyThumb(prop: Property) {
  return prop.gallery_images?.[0] || prop.images;
}

function propertyCardBorder(prop: Property) {
  if (prop.sale_status === 'hidden') return 'border-amber-700/50 opacity-70';
  if (prop.sale_status === 'sold') return 'border-emerald-700/50 opacity-80';
  return 'border-slate-900';
}

function statusLabel(prop: Property) {
  if (prop.sale_status === 'sold') return { text: 'Đã bán', className: 'bg-emerald-600/20 text-emerald-300 border-emerald-700/50' };
  if (prop.sale_status === 'hidden') return { text: 'Đã ẩn', className: 'bg-amber-600/20 text-amber-300 border-amber-700/50' };
  return { text: 'Đang hiển thị', className: 'bg-slate-800 text-slate-300 border-slate-700' };
}

function PropertyActions({
  prop,
  actionLoading,
  onEdit,
  onImageUpload,
  onCopyDescription,
  onToggleSold,
  onHide,
  onRestore,
  onOpenAiContent,
  compact,
}: {
  prop: Property;
  actionLoading: string | null;
  onEdit: (prop: Property) => void;
  onImageUpload: (prop: Property, files: FileList | null) => void;
  onCopyDescription: (prop: Property) => void;
  onToggleSold: (prop: Property) => void;
  onHide: (prop: Property) => void;
  onRestore: (prop: Property) => void;
  onOpenAiContent: (prop: Property) => void;
  compact?: boolean;
}) {
  const btn = compact
    ? 'p-2 rounded-lg border text-slate-300 transition-all'
    : 'font-bold text-xs px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all';

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? '' : 'gap-2'}`}>
      <button
        type="button"
        onClick={() => onEdit(prop)}
        title="Chỉnh sửa"
        className={`${btn} bg-rose-950/50 border-rose-500/30 text-rose-300 hover:bg-rose-900/60`}
      >
        <Edit className="w-3.5 h-3.5" />
        {!compact && <span>Chỉnh sửa</span>}
      </button>
      <label
        title="Upload ảnh"
        className={`cursor-pointer ${btn} bg-slate-950 border-slate-800 hover:bg-slate-900`}
      >
        <ImageIcon className="w-3.5 h-3.5" />
        {!compact && (
          <span>{actionLoading === `upload-prop-${prop.id}` ? 'Đang upload...' : 'Upload ảnh'}</span>
        )}
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => onImageUpload(prop, e.target.files)}
        />
      </label>
      <button
        type="button"
        onClick={() => onCopyDescription(prop)}
        title="Copy mô tả"
        className={`${btn} bg-slate-950 border-slate-800 hover:bg-slate-900`}
      >
        <Copy className="w-3.5 h-3.5" />
        {!compact && <span>Copy mô tả</span>}
      </button>
      <button
        type="button"
        onClick={() => onToggleSold(prop)}
        disabled={actionLoading === `sold-prop-${prop.id}`}
        title={prop.sale_status === 'sold' ? 'Đã bán' : 'Đánh dấu bán'}
        className={`${btn} ${
          prop.sale_status === 'sold'
            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50'
            : 'bg-slate-950 border-slate-800 hover:border-emerald-500/50 hover:text-emerald-300'
        }`}
      >
        <Check className="w-3.5 h-3.5" />
        {!compact && <span>{prop.sale_status === 'sold' ? 'Đã bán' : 'Đánh dấu bán'}</span>}
      </button>
      <button
        type="button"
        onClick={() => (prop.sale_status === 'hidden' ? onRestore(prop) : onHide(prop))}
        disabled={actionLoading === `hide-prop-${prop.id}` || actionLoading === `restore-prop-${prop.id}`}
        title={prop.sale_status === 'hidden' ? 'Khôi phục' : 'Ẩn'}
        className={`${btn} ${
          prop.sale_status === 'hidden'
            ? 'bg-amber-950/60 text-amber-300 border-amber-700/50'
            : 'bg-slate-950 border-slate-800 hover:border-amber-500/50 hover:text-amber-300'
        }`}
      >
        {prop.sale_status === 'hidden' ? <RefreshCw className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
        {!compact && <span>{prop.sale_status === 'hidden' ? 'Khôi phục' : 'Ẩn'}</span>}
      </button>
      <button
        type="button"
        onClick={() => onOpenAiContent(prop)}
        title="Sinh Content Marketing"
        className={`${btn} bg-slate-950 border-slate-800 text-rose-400 hover:border-rose-500/40 hover:bg-rose-950`}
      >
        <Sparkles className="w-3.5 h-3.5" />
        {!compact && <span>Sinh Content</span>}
      </button>
    </div>
  );
}

export default function AdminPropertyDirectory({
  properties,
  creatorNameById,
  propertyGalleryIndex,
  setPropertyGalleryIndex,
  actionLoading,
  onToggleFeatured,
  onEdit,
  onImageUpload,
  onCopyDescription,
  onToggleSold,
  onHide,
  onRestore,
  onOpenAiContent,
}: AdminPropertyDirectoryProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(readStoredView);
  const [page, setPage] = useState(1);

  const listSignature = useMemo(
    () => properties.map(p => p.id).sort().join('|'),
    [properties],
  );

  useEffect(() => {
    setPage(1);
  }, [listSignature]);

  const pagedProperties = useMemo(() => {
    const start = (page - 1) * DEFAULT_PAGE_SIZE;
    return properties.slice(start, start + DEFAULT_PAGE_SIZE);
  }, [properties, page]);

  const setView = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-2xs font-semibold uppercase tracking-wide text-slate-500">Kiểu hiển thị</span>
        <div className="flex overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
          <button
            type="button"
            onClick={() => setView('grid')}
            title="Dạng thẻ"
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors ${
              viewMode === 'grid' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Thẻ
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            title="Dạng danh sách"
            className={`flex items-center gap-1.5 border-l border-slate-800 px-3 py-2 text-xs font-bold transition-colors ${
              viewMode === 'list' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <List className="h-4 w-4" />
            Danh sách
          </button>
        </div>
      </div>

      {properties.length > 0 && (
        <PaginationBar
          variant="dark"
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          totalItems={properties.length}
          onPageChange={setPage}
        />
      )}

      {viewMode === 'list' ? (
        <div className="overflow-hidden rounded-2xl border border-slate-900 bg-slate-900/40">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/80 text-2xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 w-14">Ảnh</th>
                  <th className="px-4 py-3 min-w-[220px]">Bất động sản</th>
                  <th className="px-4 py-3">Loại</th>
                  <th className="px-4 py-3">Giá</th>
                  <th className="px-4 py-3">Diện tích</th>
                  <th className="px-4 py-3">Pháp lý</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Người tạo</th>
                  <th className="px-4 py-3">Lượt xem</th>
                  <th className="px-4 py-3 min-w-[280px]">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pagedProperties.map(prop => {
                  const status = statusLabel(prop);
                  const project = getPropertyProjectLabel(prop);
                  return (
                    <tr
                      key={prop.id}
                      className={`border-t border-slate-900 transition-colors hover:bg-slate-900/60 ${prop.sale_status === 'hidden' ? 'opacity-75' : ''}`}
                    >
                      <td className="px-4 py-3 align-top">
                        <img
                          src={propertyThumb(prop)}
                          alt=""
                          className="h-12 w-12 rounded-lg border border-slate-800 object-cover"
                        />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="space-y-1">
                          <p className="font-bold leading-snug text-white line-clamp-2">{prop.title}</p>
                          <p className="flex items-start gap-1 text-2xs text-slate-500">
                            <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />
                            <span className="line-clamp-2">{prop.location}</span>
                          </p>
                          {project && (
                            <span className="inline-block rounded border border-invest-gold/30 bg-invest-gold/10 px-1.5 py-0.5 text-2xs font-bold text-invest-gold">
                              {project}
                            </span>
                          )}
                          {prop.is_featured && (
                            <span className="ml-1 inline-flex items-center gap-0.5 rounded border border-rose-500/50 bg-rose-600/20 px-1.5 py-0.5 text-2xs font-bold text-rose-300">
                              <Sparkles className="h-3 w-3" /> Nổi bật
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-300">
                        <div>{prop.transaction_type || 'Bán'}</div>
                        <div className="text-2xs text-slate-500">{prop.type}</div>
                      </td>
                      <td className="px-4 py-3 align-top font-bold text-rose-400 whitespace-nowrap">
                        {prop.price} tỷ
                      </td>
                      <td className="px-4 py-3 align-top text-slate-300 whitespace-nowrap">{prop.area} m²</td>
                      <td className="px-4 py-3 align-top text-slate-400 max-w-[120px] truncate" title={prop.legal_status}>
                        {prop.legal_status}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`inline-block rounded-lg border px-2 py-1 text-2xs font-bold ${status.className}`}>
                          {status.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-300">
                        <span className="inline-flex items-center gap-1 text-2xs">
                          <User className="h-3 w-3 text-slate-500" />
                          {getPropertyCreatorName(prop, creatorNameById)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-400 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          {prop.public_view_count || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="mb-2">
                          <button
                            type="button"
                            onClick={() => onToggleFeatured(prop)}
                            disabled={actionLoading === `featured-prop-${prop.id}`}
                            className={`rounded-lg border px-2 py-1 text-2xs font-bold ${
                              prop.is_featured
                                ? 'border-rose-500/70 bg-rose-600 text-white'
                                : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-rose-300'
                            }`}
                          >
                            {prop.is_featured ? '★ Nổi bật' : '☆ Gắn nổi bật'}
                          </button>
                        </div>
                        <PropertyActions
                          prop={prop}
                          actionLoading={actionLoading}
                          onEdit={onEdit}
                          onImageUpload={onImageUpload}
                          onCopyDescription={onCopyDescription}
                          onToggleSold={onToggleSold}
                          onHide={onHide}
                          onRestore={onRestore}
                          onOpenAiContent={onOpenAiContent}
                          compact
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {properties.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Không có bất động sản phù hợp bộ lọc.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {pagedProperties.map(prop => (
            <div
              key={prop.id}
              className={`group flex flex-col justify-between overflow-hidden rounded-2xl border bg-slate-900/40 shadow-sm transition-all hover:border-slate-800 hover:shadow-xl ${propertyCardBorder(prop)}`}
            >
              <div className="group/gallery relative aspect-square shrink-0 overflow-hidden bg-slate-950">
                {prop.gallery_images?.length ? (
                  <>
                    <img
                      src={prop.gallery_images[propertyGalleryIndex[prop.id] || 0]}
                      alt={prop.title}
                      className="h-full w-full object-cover object-center opacity-90 transition-all duration-500 group-hover:scale-105"
                    />
                    {prop.gallery_images.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const currentIndex = propertyGalleryIndex[prop.id] || 0;
                            const newIndex = currentIndex === 0 ? prop.gallery_images!.length - 1 : currentIndex - 1;
                            setPropertyGalleryIndex({ ...propertyGalleryIndex, [prop.id]: newIndex });
                          }}
                          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-lg bg-black/60 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover/gallery:opacity-100"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const currentIndex = propertyGalleryIndex[prop.id] || 0;
                            const newIndex = (currentIndex + 1) % prop.gallery_images!.length;
                            setPropertyGalleryIndex({ ...propertyGalleryIndex, [prop.id]: newIndex });
                          }}
                          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-lg bg-black/60 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover/gallery:opacity-100"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-lg bg-black/60 px-2 py-1 text-2xs font-bold text-white">
                          {(propertyGalleryIndex[prop.id] || 0) + 1} / {prop.gallery_images.length}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <img
                    src={prop.images}
                    alt={prop.title}
                    className="h-full w-full object-cover object-center opacity-80 transition-all duration-500 group-hover:scale-105"
                  />
                )}
                <div className="absolute left-4 top-4 flex max-w-[calc(100%-7rem)] flex-wrap items-center gap-1.5">
                  <div className="rounded-lg border border-slate-900 bg-slate-950/95 px-2.5 py-1 text-xs font-bold capitalize text-rose-400">
                    {prop.transaction_type || 'Bán'} • {prop.type}
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleFeatured(prop)}
                    disabled={actionLoading === `featured-prop-${prop.id}`}
                    title={prop.is_featured ? 'Bỏ gắn nổi bật' : 'Gắn BĐS nổi bật'}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-2xs font-extrabold transition-all ${
                      prop.is_featured
                        ? 'border-rose-500/70 bg-rose-600 text-white shadow-sm shadow-rose-600/20'
                        : 'border-slate-800 bg-slate-950/90 text-slate-400 hover:border-rose-500/60 hover:text-rose-300'
                    }`}
                  >
                    <Sparkles className="h-3 w-3" />
                    {prop.is_featured ? 'Nổi bật' : 'Bỏ nổi bật'}
                  </button>
                </div>
                {prop.sale_status === 'sold' && (
                  <div className="absolute left-4 top-14 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-extrabold text-white">
                    ĐÃ BÁN
                  </div>
                )}
                {prop.sale_status === 'hidden' && (
                  <div className="absolute left-4 top-14 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-extrabold text-white">
                    ĐÃ ẨN
                  </div>
                )}
                <div className="absolute right-4 top-4 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-extrabold tracking-tight text-white">
                  {prop.price} Tỷ VNĐ
                </div>
                <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-lg border border-slate-900 bg-slate-950/80 px-2.5 py-1 text-2xs text-slate-300">
                  <MapPin className="h-3.5 w-3.5 text-rose-500" /> {prop.direction}
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-between space-y-4 p-5">
                <div className="space-y-2">
                  <h3 className="line-clamp-2 text-md font-bold leading-relaxed text-white transition-colors group-hover:text-rose-400">
                    {prop.title}
                  </h3>
                  <p className="flex items-center gap-1 font-mono text-xs text-slate-500">📍 {prop.location}</p>
                  {getPropertyProjectLabel(prop) && (
                    <span className="inline-block rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-2xs font-bold text-invest-gold">
                      {getPropertyProjectLabel(prop)}
                    </span>
                  )}
                  {Number.isFinite(prop.map_latitude) && Number.isFinite(prop.map_longitude) && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-950/40 px-2 py-1 text-2xs font-bold text-blue-300">
                      <MapPin className="h-3 w-3" />
                      Có Google Map
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-2xs font-bold text-slate-400">
                    <TrendingUp className="h-3 w-3" />
                    {prop.public_view_count || 0} lượt xem
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-2xs font-bold text-slate-400">
                    <User className="h-3 w-3" />
                    {getPropertyCreatorName(prop, creatorNameById)}
                  </span>
                  <MarkdownContent
                    content={prop.rich_description || prop.description}
                    compact
                    className="line-clamp-3 text-xs leading-relaxed text-slate-400"
                  />
                </div>

                {prop.gallery_images?.length ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {prop.gallery_images.map((img, idx) => (
                      <img
                        key={idx}
                        src={img}
                        alt={`${prop.title} ${idx + 1}`}
                        className="aspect-square h-16 w-16 shrink-0 rounded-lg border border-slate-800 object-cover object-center"
                      />
                    ))}
                  </div>
                ) : null}

                <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-900/80 bg-slate-950/50 p-2.5 text-center text-xs font-semibold">
                  <div>
                    <span className="block text-2xs text-slate-500">Diện tích</span>
                    <span className="text-slate-200">{prop.area} m²</span>
                  </div>
                  <div>
                    <span className="block text-2xs text-slate-500">Pháp lý</span>
                    <span className="block truncate text-slate-200">{prop.legal_status}</span>
                  </div>
                  <div>
                    <span className="block text-2xs text-slate-500">Lòng đường</span>
                    <span className="text-slate-200">{prop.road_width} m</span>
                  </div>
                </div>

                {(prop.floor_area || prop.floors || prop.bedrooms || prop.bathrooms || prop.garage || prop.pool) && (
                  <div className="flex flex-wrap gap-1.5 text-2xs">
                    {prop.floor_area ? (
                      <span className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-400">
                        Sàn {prop.floor_area} m²
                      </span>
                    ) : null}
                    {prop.floors ? (
                      <span className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-400">
                        {prop.floors} tầng
                      </span>
                    ) : null}
                    {prop.bedrooms ? (
                      <span className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-400">
                        {prop.bedrooms} PN
                      </span>
                    ) : null}
                    {prop.bathrooms ? (
                      <span className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-400">
                        {prop.bathrooms} WC
                      </span>
                    ) : null}
                    {prop.garage ? (
                      <span className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-400">Gara</span>
                    ) : null}
                    {prop.pool ? (
                      <span className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-400">Hồ bơi</span>
                    ) : null}
                  </div>
                )}

                <div className="space-y-1">
                  <span className="block text-2xs font-semibold uppercase text-slate-500">Đặc điểm nổi trội:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {prop.selling_points.map((pt, idx) => (
                      <span
                        key={idx}
                        className="rounded-lg border border-slate-900 bg-slate-950 px-2 py-0.5 text-2xs text-slate-400"
                      >
                        ✓ {pt}
                      </span>
                    ))}
                  </div>
                </div>

                {prop.internal_notes && (
                  <div className="rounded-xl border border-slate-900 bg-slate-950/50 p-3">
                    <span className="mb-1 block text-2xs font-bold uppercase text-amber-400">Ghi chú AI/Search</span>
                    <p className="line-clamp-3 text-2xs leading-relaxed text-slate-400">{prop.internal_notes}</p>
                  </div>
                )}

                <div className="space-y-3 border-t border-slate-900/80 pt-4">
                  <PropertyActions
                    prop={prop}
                    actionLoading={actionLoading}
                    onEdit={onEdit}
                    onImageUpload={onImageUpload}
                    onCopyDescription={onCopyDescription}
                    onToggleSold={onToggleSold}
                    onHide={onHide}
                    onRestore={onRestore}
                    onOpenAiContent={onOpenAiContent}
                  />
                  <div className="text-2xs font-mono text-slate-500">
                    {prop.ai_posts?.facebook ? (
                      <span className="flex items-center gap-1 font-bold text-emerald-400">✓ Đã tối ưu AI</span>
                    ) : (
                      <span className="block italic text-slate-500">Chưa tối ưu marketing</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {properties.length > DEFAULT_PAGE_SIZE && (
        <PaginationBar
          className="pt-2"
          variant="dark"
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          totalItems={properties.length}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
