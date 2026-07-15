import React, { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Plus, Search, X } from 'lucide-react';
import AdminPropertyDirectory from '../../../components/admin/AdminPropertyDirectory';
import PaginationBar from '../../../components/common/PaginationBar';
import {
  createProperty,
  deleteProperty,
  getUsers,
  invalidateCrmModule,
  listProperties,
  updateProperty,
} from '../../../services/api';
import type { AppSettings, AuthUser, Property, User } from '../../../types';
import {
  countPropertyStatuses,
  getPropertySaleStatus,
  matchesAdminPropertyStatusFilter,
} from '../../../utils/propertyStatus';
import { sortByCreatedAtDesc } from '../../../utils/propertySort';
import { getPropertyCreatorId } from '../../../utils/propertyCreator';
import { extractHashtagsFromText } from '../../../utils/hashtags';
import { resizeImageFile } from '../../../utils/resizeImageFile';
import { getEffectiveProjectGroups, normalizeProjectName } from '../../../seo/propertyCatalog';
import PropertyFormModal from '../components/PropertyFormModal';
import {
  PROPERTY_TYPE_OPTIONS,
  TRANSACTION_TYPE_OPTIONS,
  createEmptyPropertyForm,
} from '../propertyConstants';

type Notify = (message: string, type?: 'success' | 'error' | 'info') => void;

type Props = {
  onNotify: Notify;
  settings: AppSettings;
  currentUser: AuthUser;
  onPropertySaved?: () => void;
  onOpenAiContent?: (property: Property) => void;
};

export default function PropertiesPage({
  onNotify,
  settings,
  currentUser,
  onPropertySaved,
  onOpenAiContent,
}: Props) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [managedUsers, setManagedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [propertyFilters, setPropertyFilters] = useState({
    price: 'all',
    area: 'all',
    type: 'all',
    transactionType: 'all',
    status: 'visible',
    creator: 'all',
  });
  const [propertiesPage, setPropertiesPage] = useState(1);
  const [propertiesTotal, setPropertiesTotal] = useState(0);
  const [propertyGalleryIndex, setPropertyGalleryIndex] = useState<{ [key: string]: number }>({});
  const [showAddPropertyModal, setShowAddPropertyModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [newPropertyForm, setNewPropertyForm] = useState(createEmptyPropertyForm);
  const [customProjectMode, setCustomProjectMode] = useState(false);
  const [draggedGalleryIndex, setDraggedGalleryIndex] = useState<number | null>(null);
  const isFirstSearch = useRef(true);

  const detectedPropertyHashtags = useMemo(
    () => extractHashtagsFromText(`${newPropertyForm.rich_description}\n${newPropertyForm.selling_points}`),
    [newPropertyForm.rich_description, newPropertyForm.selling_points],
  );

  const loadProperties = async (page = 1, search = searchQuery) => {
    setLoading(true);
    try {
      const result = await listProperties({
        page,
        limit: 100,
        search: search.trim() || undefined,
        status: propertyFilters.status,
        type: propertyFilters.type !== 'all' ? propertyFilters.type : undefined,
        transactionType: propertyFilters.transactionType !== 'all' ? propertyFilters.transactionType : undefined,
        sort: 'created_at_desc',
      });
      setProperties(result.items);
      setPropertiesPage(result.pagination.page);
      setPropertiesTotal(result.pagination.total);
    } catch (e: any) {
      onNotify(e.message || 'Không tải được danh sách BĐS.', 'error');
      setProperties([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delay = isFirstSearch.current ? 0 : 350;
    isFirstSearch.current = false;
    const timer = window.setTimeout(() => {
      void loadProperties(1, searchQuery);
    }, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, propertyFilters.status, propertyFilters.type, propertyFilters.transactionType]);

  useEffect(() => {
    if (currentUser.role === 'owner' || currentUser.role === 'company') {
      void getUsers()
        .then(setManagedUsers)
        .catch(() => setManagedUsers([]));
    }
  }, [currentUser]);

  const propertyCreatorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of managedUsers) map.set(user.id, user.name);
    map.set(currentUser.id, currentUser.name);
    return map;
  }, [managedUsers, currentUser]);

  const propertyCreatorFilterOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const property of properties) {
      const creatorId = getPropertyCreatorId(property);
      if (creatorId) ids.add(creatorId);
    }
    return Array.from(ids)
      .map(id => ({ id, name: propertyCreatorNameById.get(id) || id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [properties, propertyCreatorNameById]);

  const propertyStatusCounts = useMemo(() => countPropertyStatuses(properties), [properties]);
  const projectCatalogGroups = useMemo(() => getEffectiveProjectGroups(settings), [settings]);

  const filteredProperties = sortByCreatedAtDesc(
    properties.filter(p => {
      const normalizedSearch = searchQuery.toLowerCase();
      const saleStatus = getPropertySaleStatus(p);
      const searchableText = [
        p.title,
        p.location,
        p.type,
        p.transaction_type || '',
        p.legal_status,
        p.direction,
        p.rich_description || p.description || '',
        p.internal_notes || '',
        saleStatus,
      ]
        .join(' ')
        .toLowerCase();
      const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);
      const matchesType = propertyFilters.type === 'all' || p.type === propertyFilters.type;
      const matchesTxn =
        propertyFilters.transactionType === 'all' ||
        (p.transaction_type || 'Bán') === propertyFilters.transactionType;
      const matchesStatus = matchesAdminPropertyStatusFilter(p, propertyFilters.status);
      const creatorId = getPropertyCreatorId(p);
      const matchesCreator = propertyFilters.creator === 'all' || creatorId === propertyFilters.creator;
      let matchesPrice = true;
      if (propertyFilters.price === 'under3') matchesPrice = p.price < 3;
      if (propertyFilters.price === '3to5') matchesPrice = p.price >= 3 && p.price <= 5;
      if (propertyFilters.price === '5to10') matchesPrice = p.price > 5 && p.price <= 10;
      if (propertyFilters.price === 'over10') matchesPrice = p.price > 10;
      let matchesArea = true;
      if (propertyFilters.area === 'under80') matchesArea = p.area < 80;
      if (propertyFilters.area === '80to150') matchesArea = p.area >= 80 && p.area <= 150;
      if (propertyFilters.area === 'over150') matchesArea = p.area > 150;
      return (
        matchesSearch && matchesType && matchesTxn && matchesStatus && matchesCreator && matchesPrice && matchesArea
      );
    }),
  );

  const readImageFiles = async (files: FileList | null): Promise<string[]> => {
    if (!files?.length) return [];

    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/')).slice(0, 6);
    return Promise.all(imageFiles.map(file => resizeImageFile(file)));
  };

  const openAddPropertyModal = () => {
    setEditingProperty(null);
    setNewPropertyForm(createEmptyPropertyForm());
    setCustomProjectMode(false);
    setShowAddPropertyModal(true);
  };

  const openEditPropertyModal = (property: Property) => {
    setEditingProperty(property);
    const knownProjects = getEffectiveProjectGroups(settings).flatMap(group => group.projects);
    const hasKnownProject = property.project_name ? knownProjects.includes(property.project_name) : false;
    setCustomProjectMode(Boolean(property.project_name && !hasKnownProject));
    setNewPropertyForm({
      title: property.title,
      transaction_type: property.transaction_type || 'Bán',
      type: property.type,
      location: property.location,
      area: String(property.area),
      floor_area: property.floor_area ? String(property.floor_area) : '',
      price: String(property.price),
      legal_status: property.legal_status,
      direction: property.direction,
      road_width: String(property.road_width),
      floors: property.floors ? String(property.floors) : '',
      bedrooms: property.bedrooms ? String(property.bedrooms) : '',
      bathrooms: property.bathrooms ? String(property.bathrooms) : '',
      garage: Boolean(property.garage),
      pool: Boolean(property.pool),
      description: property.description,
      rich_description: property.rich_description || '',
      internal_notes: property.internal_notes || '',
      images: property.images || '',
      gallery_images: [...(property.gallery_images || [])],
      sale_status: property.sale_status || 'available',
      is_featured: Boolean(property.is_featured),
      selling_points: (property.selling_points || []).join('\n'),
      market_zone: property.market_zone || '',
      project_name: normalizeProjectName(property.project_name) || property.project_name || '',
    });
    setShowAddPropertyModal(true);
  };

  const closePropertyModal = () => {
    setShowAddPropertyModal(false);
    setEditingProperty(null);
    setDraggedGalleryIndex(null);
    setCustomProjectMode(false);
    setNewPropertyForm(createEmptyPropertyForm());
  };

  const reorderGalleryImages = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setNewPropertyForm(prev => {
      const gallery = [...prev.gallery_images];
      const [moved] = gallery.splice(fromIndex, 1);
      gallery.splice(toIndex, 0, moved);
      return {
        ...prev,
        gallery_images: gallery,
        images: gallery[0] || ''
      };
    });
  };

  const handlePropertyImageUpload = async (prop: Property, files: FileList | null) => {
    setActionLoading(`upload-prop-${prop.id}`);
    try {
      const uploadedImages = await readImageFiles(files);
      if (!uploadedImages.length) {
        onNotify("Vui lòng chọn file ảnh hợp lệ.", "error");
        return;
      }

      const gallery = [...(prop.gallery_images || []), ...uploadedImages].slice(0, 8);
      const updated = await updateProperty(prop.id, {
        images: prop.images || uploadedImages[0],
        gallery_images: gallery
      });
      setProperties(prev => prev.map(item => item.id === prop.id ? updated : item));
      onNotify("Đã upload và lưu ảnh bất động sản.", "success");
    } catch (e: any) {
      onNotify(e.message || "Lỗi upload ảnh.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleTogglePropertySold = async (prop: Property) => {
    setActionLoading(`sold-prop-${prop.id}`);
    try {
      const updated = await updateProperty(prop.id, {
        sale_status: prop.sale_status === 'sold' ? 'available' : 'sold'
      });
      setProperties(prev => prev.map(item => item.id === prop.id ? updated : item));
      onNotify(updated.sale_status === 'sold' ? "Đã đánh dấu bất động sản là đã bán." : "Đã chuyển bất động sản về trạng thái đang bán.", "success");
    } catch (e: any) {
      onNotify(e.message || "Lỗi cập nhật trạng thái bán.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleTogglePropertyFeatured = async (prop: Property) => {
    setActionLoading(`featured-prop-${prop.id}`);
    try {
      const updated = await updateProperty(prop.id, {
        is_featured: !prop.is_featured
      });
      setProperties(prev => prev.map(item => item.id === prop.id ? updated : item));
      onNotify(updated.is_featured ? "Đã gán BĐS nổi bật." : "Đã bỏ gán BĐS nổi bật.", "success");
    } catch (e: any) {
      onNotify(e.message || "Lỗi cập nhật BĐS nổi bật.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const buildPropertyCopyText = (prop: Property) => [
    prop.title,
    `Hình thức: ${prop.transaction_type || 'Bán'}`,
    `Loại hình: ${prop.type}`,
    `Vị trí: ${prop.location}`,
    `Giá: ${prop.price} tỷ VND`,
    `Diện tích: ${prop.area} m2`,
    prop.floor_area ? `Diện tích sàn: ${prop.floor_area} m2` : '',
    `Pháp lý: ${prop.legal_status}`,
    `Hướng: ${prop.direction}`,
    `Đường: ${prop.road_width} m`,
    prop.floors ? `Số tầng: ${prop.floors}` : '',
    prop.bedrooms ? `Phòng ngủ: ${prop.bedrooms}` : '',
    prop.bathrooms ? `Phòng tắm: ${prop.bathrooms}` : '',
    prop.garage ? 'Có gara' : '',
    prop.pool ? 'Có hồ bơi' : '',
    `Trạng thái: ${prop.sale_status === 'sold' ? 'Đã bán' : 'Đang bán'}`,
    '',
    prop.rich_description || prop.description,
    '',
    `Điểm nổi bật: ${(prop.selling_points || []).join(', ')}`,
    prop.internal_notes ? `Ghi chú nội bộ: ${prop.internal_notes}` : ''
  ].filter(Boolean).join('\n');

  const handleSaveProperty = async (e: FormEvent) => {
    e.preventDefault();
    setActionLoading(editingProperty ? `edit-prop-${editingProperty.id}` : 'add-property');
    try {
      const sellingPoints = newPropertyForm.selling_points.split('\n').map(line => line.trim()).filter(Boolean);
      const fallbackDescription = sellingPoints.join('. ') || newPropertyForm.rich_description || '';
      const payload = {
        ...newPropertyForm,
        area: Number(newPropertyForm.area),
        floor_area: newPropertyForm.floor_area ? Number(newPropertyForm.floor_area) : undefined,
        price: Number(newPropertyForm.price),
        road_width: Number(newPropertyForm.road_width),
        floors: newPropertyForm.floors ? Number(newPropertyForm.floors) : undefined,
        bedrooms: newPropertyForm.bedrooms ? Number(newPropertyForm.bedrooms) : undefined,
        bathrooms: newPropertyForm.bathrooms ? Number(newPropertyForm.bathrooms) : undefined,
        garage: Boolean(newPropertyForm.garage),
        pool: Boolean(newPropertyForm.pool),
        description: fallbackDescription,
        rich_description: newPropertyForm.rich_description || fallbackDescription,
        selling_points: sellingPoints,
        market_zone: newPropertyForm.market_zone || undefined,
        project_name: newPropertyForm.project_name?.trim() || undefined,
      };

      if (editingProperty) {
        const property = await updateProperty(editingProperty.id, payload);
        setProperties(prev => prev.map(item => item.id === property.id ? property : item));
        setPropertyGalleryIndex(prev => ({ ...prev, [property.id]: 0 }));
        onNotify("Đã cập nhật bất động sản thành công!", "success");
      } else {
        const property = await createProperty(payload);
        setProperties(prev => [property, ...prev]);
        onNotify("Thêm bất động sản mới thành công! Tự động chạy chiến dịch marketing.", "success");
      }

      invalidateCrmModule();
      onPropertySaved?.();
      closePropertyModal();
    } catch (e: any) {
      onNotify(e.message || "Không thể lưu bất động sản.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSoftDeleteProperty = async (prop: Property) => {
    setActionLoading(`hide-prop-${prop.id}`);
    try {
      const updated = await deleteProperty(prop.id);
      setProperties(prev => prev.map(item => item.id === prop.id ? updated : item));
      onNotify('Đã ẩn sản phẩm khỏi listing công khai. Có thể khôi phục trong CMS.', 'success');
    } catch (e: any) {
      onNotify(e.message || 'Không thể ẩn sản phẩm.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestoreProperty = async (prop: Property) => {
    setActionLoading(`restore-prop-${prop.id}`);
    try {
      const updated = await updateProperty(prop.id, { sale_status: 'available' });
      setProperties(prev => prev.map(item => item.id === prop.id ? updated : item));
      onNotify('Đã khôi phục sản phẩm về listing công khai.', 'success');
    } catch (e: any) {
      onNotify(e.message || 'Không thể khôi phục sản phẩm.', 'error');
    } finally {
      setActionLoading(null);
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">Danh sách Bất động sản</h2>
          <p className="text-slate-400 text-sm">Chi tiết thông tin bất động sản, sổ đỏ, và tính năng tiếp thị tự động.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a href="/" target="_blank" rel="noreferrer" className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-indigo-600/25 transition-all">
            <ExternalLink className="w-4 h-4" />
            <span>Xem trang BĐS Public</span>
          </a>
          <button type="button" onClick={openAddPropertyModal} className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-rose-600/25 transition-all">
            <Plus className="w-4 h-4" />
            <span>Thêm Bất Động Sản</span>
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Tìm BĐS..." className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-9 py-2.5 text-xs text-slate-200 outline-none focus:border-rose-500" />
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-900 bg-slate-900/35 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-1">
            <label className="block text-2xs font-semibold uppercase text-slate-500">Khoảng giá</label>
            <select value={propertyFilters.price} onChange={e => setPropertyFilters({ ...propertyFilters, price: e.target.value })} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200">
              <option value="all">Tất cả giá</option>
              <option value="under3">Dưới 3 tỷ</option>
              <option value="3to5">3 - 5 tỷ</option>
              <option value="5to10">5 - 10 tỷ</option>
              <option value="over10">Trên 10 tỷ</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-2xs font-semibold uppercase text-slate-500">Khu vực / diện tích</label>
            <select value={propertyFilters.area} onChange={e => setPropertyFilters({ ...propertyFilters, area: e.target.value })} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200">
              <option value="all">Tất cả diện tích</option>
              <option value="under80">Dưới 80 m²</option>
              <option value="80to150">80 - 150 m²</option>
              <option value="over150">Trên 150 m²</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-2xs font-semibold uppercase text-slate-500">Loại hình</label>
            <select value={propertyFilters.type} onChange={e => setPropertyFilters({ ...propertyFilters, type: e.target.value })} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200">
              <option value="all">Tất cả loại hình</option>
              {PROPERTY_TYPE_OPTIONS.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-2xs font-semibold uppercase text-slate-500">Hình thức</label>
            <select value={propertyFilters.transactionType} onChange={e => setPropertyFilters({ ...propertyFilters, transactionType: e.target.value })} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200">
              <option value="all">Bán và cho thuê</option>
              {TRANSACTION_TYPE_OPTIONS.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-2xs font-semibold uppercase text-slate-500">Trạng thái</label>
            <select value={propertyFilters.status} onChange={e => setPropertyFilters({ ...propertyFilters, status: e.target.value })} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200">
              <option value="visible">Mặc định: đang bán + đã bán (không gồm ẩn)</option>
              <option value="available">Đang bán/cho thuê</option>
              <option value="sold">Đã bán/đã thuê</option>
              <option value="hidden">Chỉ BĐS đã ẩn</option>
              <option value="all">Tất cả trạng thái</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-2xs font-semibold uppercase text-slate-500">Người tạo</label>
            <select value={propertyFilters.creator} onChange={e => setPropertyFilters({ ...propertyFilters, creator: e.target.value })} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200">
              <option value="all">Tất cả</option>
              {propertyCreatorFilterOptions.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-2xs text-slate-500">
          <div>
            Đang bán: {propertyStatusCounts.available} · Đã bán: {propertyStatusCounts.sold} · Ẩn: {propertyStatusCounts.hidden} · Hiển thị{' '}
            <span className="font-semibold text-slate-300">{filteredProperties.length}</span> kết quả
            {loading ? ' · đang tải…' : ''}
          </div>
          <button type="button" onClick={() => setPropertyFilters({ price: 'all', area: 'all', type: 'all', transactionType: 'all', status: 'visible', creator: 'all' })} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 font-semibold text-slate-300 hover:border-slate-700">
            Xóa bộ lọc
          </button>
        </div>
      </div>

      <Suspense fallback={<div className="text-sm text-slate-400 py-8 text-center">Đang tải danh sách BĐS…</div>}>
        <AdminPropertyDirectory
          properties={filteredProperties}
          creatorNameById={propertyCreatorNameById}
          propertyGalleryIndex={propertyGalleryIndex}
          setPropertyGalleryIndex={setPropertyGalleryIndex}
          actionLoading={actionLoading}
          onToggleFeatured={handleTogglePropertyFeatured}
          onEdit={openEditPropertyModal}
          onImageUpload={handlePropertyImageUpload}
          onCopyDescription={prop => {
            navigator.clipboard.writeText(buildPropertyCopyText(prop));
            onNotify('Đã sao chép vào bộ nhớ tạm thành công!', 'success');
          }}
          onToggleSold={handleTogglePropertySold}
          onHide={handleSoftDeleteProperty}
          onRestore={handleRestoreProperty}
          onOpenAiContent={prop => onOpenAiContent?.(prop)}
        />
      </Suspense>

      {propertiesTotal > 100 && (
        <PaginationBar
          page={propertiesPage}
          pageSize={100}
          totalItems={propertiesTotal}
          onPageChange={page => {
            void loadProperties(page, searchQuery);
          }}
          variant="dark"
        />
      )}

      <PropertyFormModal
        open={showAddPropertyModal}
        editingProperty={editingProperty}
        newPropertyForm={newPropertyForm}
        setNewPropertyForm={setNewPropertyForm}
        customProjectMode={customProjectMode}
        setCustomProjectMode={setCustomProjectMode}
        draggedGalleryIndex={draggedGalleryIndex}
        setDraggedGalleryIndex={setDraggedGalleryIndex}
        projectCatalogGroups={projectCatalogGroups}
        propertyCreatorNameById={propertyCreatorNameById}
        detectedPropertyHashtags={detectedPropertyHashtags}
        actionLoading={actionLoading}
        onClose={closePropertyModal}
        onSubmit={handleSaveProperty}
        onReorderGallery={reorderGalleryImages}
        onReadImageFiles={readImageFiles}
      />

    </div>
  );
}
