import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronRight,
  GripVertical,
  Plus,
  RefreshCw,
  Save,
} from 'lucide-react';
import {
  DEFAULT_PROJECT_DISPLAY_ORDER,
  getEffectiveProjectDisplayOrder,
  getEffectiveProjectGroups,
  getPropertyProjectLabel,
  ProjectGroup,
} from '../../seo/propertyCatalog';
import { AppSettings, Property } from '../../types';
import { listProperties } from '../../services/api';
import { isPublicProperty } from '../../utils/propertyStatus';

interface AdminProjectsPanelProps {
  properties?: Property[];
  settings: AppSettings;
  saving: boolean;
  onSave: (patch: Partial<AppSettings>) => Promise<void>;
}

function reorderList<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export default function AdminProjectsPanel({
  properties: propertiesProp,
  settings,
  saving,
  onSave,
}: AdminProjectsPanelProps) {
  const [fetchedProperties, setFetchedProperties] = useState<Property[]>([]);
  useEffect(() => {
    if (propertiesProp && propertiesProp.length > 0) return;
    let cancelled = false;
    listProperties({ page: 1, limit: 100, sort: 'created_at_desc' })
      .then(result => {
        if (!cancelled) setFetchedProperties(result.items);
      })
      .catch(() => {
        if (!cancelled) setFetchedProperties([]);
      });
    return () => {
      cancelled = true;
    };
  }, [propertiesProp]);
  const properties = propertiesProp && propertiesProp.length > 0 ? propertiesProp : fetchedProperties;
  const catalogGroups = useMemo(
    () => getEffectiveProjectGroups(settings),
    [settings.project_groups],
  );

  const liveProjects = useMemo(() => {
    const counts = new Map<string, number>();
    properties.filter(isPublicProperty).forEach(property => {
      const label = getPropertyProjectLabel(property);
      if (!label) return;
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return counts;
  }, [properties]);

  const initialOrder = useMemo(() => {
    const saved = getEffectiveProjectDisplayOrder(settings);
    const activeNames = Array.from(liveProjects.keys());
    const merged = [...saved];
    activeNames.forEach(name => {
      if (!merged.some(item => item.toLowerCase() === name.toLowerCase())) {
        merged.push(name);
      }
    });
    return merged;
  }, [settings.project_display_order, liveProjects]);

  const [displayOrder, setDisplayOrder] = useState(initialOrder);
  const [groups, setGroups] = useState<ProjectGroup[]>(catalogGroups);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectZone, setNewProjectZone] = useState(catalogGroups[0]?.zone || '');
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  useEffect(() => {
    setDisplayOrder(initialOrder);
  }, [initialOrder]);

  useEffect(() => {
    setGroups(catalogGroups);
  }, [catalogGroups]);

  const orderedActiveProjects = useMemo(
    () => displayOrder.filter(name => liveProjects.has(name)),
    [displayOrder, liveProjects],
  );

  const orphanProjects = useMemo(() => {
    const catalogNames = new Set(groups.flatMap(group => group.projects.map(p => p.toLowerCase())));
    return Array.from(liveProjects.keys()).filter(name => !catalogNames.has(name.toLowerCase()));
  }, [groups, liveProjects]);

  const applyActiveProjectOrder = (nextActiveOrder: string[]) => {
    const inactive = displayOrder.filter(name => !liveProjects.has(name));
    setDisplayOrder([...nextActiveOrder, ...inactive]);
  };

  const handleProjectDrop = (targetIndex: number) => {
    if (draggingIndex === null || draggingIndex === targetIndex) {
      setDraggingIndex(null);
      setDropTargetIndex(null);
      return;
    }
    applyActiveProjectOrder(reorderList(orderedActiveProjects, draggingIndex, targetIndex));
    setDraggingIndex(null);
    setDropTargetIndex(null);
  };

  const handleSave = async () => {
    await onSave({
      project_display_order: displayOrder,
      project_groups: groups,
    });
  };

  const handleResetOrder = () => {
    const activeNames = Array.from(liveProjects.keys());
    const merged = [...DEFAULT_PROJECT_DISPLAY_ORDER];
    activeNames.forEach(name => {
      if (!merged.some(item => item.toLowerCase() === name.toLowerCase())) {
        merged.push(name);
      }
    });
    setDisplayOrder(merged);
  };

  const handleAddProject = () => {
    const name = newProjectName.trim();
    if (!name || !newProjectZone) return;
    setGroups(prev => prev.map(group =>
      group.zone === newProjectZone
        ? { ...group, projects: group.projects.includes(name) ? group.projects : [...group.projects, name] }
        : group,
    ));
    setDisplayOrder(prev => (
      prev.some(item => item.toLowerCase() === name.toLowerCase()) ? prev : [...prev, name]
    ));
    setNewProjectName('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Quản trị dự án</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Kéo thả thẻ dự án giống trang chủ để chỉnh thứ tự hiển thị. Nhớ bấm Lưu sau khi sắp xếp.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleResetOrder}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-slate-700 hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Khôi phục mặc định
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Dự án đang có tin</p>
          <p className="mt-2 text-3xl font-bold text-white">{liveProjects.size}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">BĐS hiển thị</p>
          <p className="mt-2 text-3xl font-bold text-white">{properties.filter(isPublicProperty).length}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Chưa có trong danh mục</p>
          <p className="mt-2 text-3xl font-bold text-amber-300">{orphanProjects.length}</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-rose-400" />
            <h3 className="text-lg font-bold text-white">Thứ tự hiển thị trên trang BĐS</h3>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Xem trước đúng layout trang chủ. Giữ và kéo thẻ để đổi vị trí — thả vào chỗ muốn đặt.
          </p>
        </div>

        <div className="bg-white px-4 py-8 sm:px-6">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-wide text-invest-gold">Chuyên dự án</p>
            <h4 className="mt-2 text-2xl font-extrabold text-slate-950">Danh sách theo dự án</h4>
          </div>

          {orderedActiveProjects.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có dự án nào trên tin đang hiển thị.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {orderedActiveProjects.map((name, index) => {
                const count = liveProjects.get(name) || 0;
                const isDragging = draggingIndex === index;
                const isDropTarget = dropTargetIndex === index && draggingIndex !== null && draggingIndex !== index;

                return (
                  <div
                    key={name}
                    draggable
                    onDragStart={() => setDraggingIndex(index)}
                    onDragEnd={() => {
                      setDraggingIndex(null);
                      setDropTargetIndex(null);
                    }}
                    onDragOver={event => {
                      event.preventDefault();
                      if (draggingIndex !== null && draggingIndex !== index) {
                        setDropTargetIndex(index);
                      }
                    }}
                    onDragLeave={() => {
                      if (dropTargetIndex === index) setDropTargetIndex(null);
                    }}
                    onDrop={event => {
                      event.preventDefault();
                      handleProjectDrop(index);
                    }}
                    className={`relative cursor-grab rounded-lg border bg-slate-50 p-5 text-left transition-all active:cursor-grabbing ${
                      isDragging
                        ? 'scale-[0.98] border-dashed border-invest-blue/50 opacity-50'
                        : isDropTarget
                          ? 'border-invest-blue ring-2 ring-invest-blue/30'
                          : 'border-slate-200 hover:border-invest-gold/40 hover:bg-invest-gold-muted'
                    }`}
                  >
                    <div className="absolute right-3 top-3 rounded-md border border-slate-200 bg-white/90 p-1 text-slate-400">
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Vị trí {index + 1}
                    </div>
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-invest-blue text-white">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <h3 className="pr-8 font-bold text-slate-950">{name}</h3>
                    <p className="mt-2 text-sm text-slate-600">{count} sản phẩm đang hiển thị</p>
                    <p className="mt-4 text-xs font-bold text-invest-blue">Lọc theo dự án này</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-lg font-bold text-white">Danh mục dự án (gán khi tạo/sửa BĐS)</h3>
        <p className="mt-1 mb-4 text-sm text-slate-400">
          Nhóm dự án xuất hiện trong dropdown &quot;Dự án / phân khu&quot; khi nhập BĐS.
        </p>

        <div className="mb-5 flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950 p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Tên dự án mới</label>
            <input
              value={newProjectName}
              onChange={event => setNewProjectName(event.target.value)}
              placeholder="VD: Sun Cosmo Residence"
              className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-rose-500"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Nhóm</label>
            <select
              value={newProjectZone}
              onChange={event => setNewProjectZone(event.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-rose-500"
            >
              {groups.map(group => (
                <option key={group.zone} value={group.zone}>{group.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleAddProject}
            disabled={!newProjectName.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Thêm dự án
          </button>
        </div>

        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.zone} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <div className="mb-3 flex items-center gap-2">
                <ChevronRight className="h-4 w-4 text-rose-400" />
                <h4 className="font-bold text-slate-100">{group.label}</h4>
                <span className="text-xs text-slate-500">({group.projects.length} dự án)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {group.projects.map(project => {
                  const count = liveProjects.get(project) || 0;
                  return (
                    <span
                      key={project}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                        count > 0
                          ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-200'
                          : 'border-slate-800 bg-slate-900 text-slate-400'
                      }`}
                    >
                      {project}
                      {count > 0 && <span className="rounded-full bg-emerald-600/30 px-1.5 py-0.5 text-[10px]">{count}</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {orphanProjects.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-800/50 bg-amber-950/20 p-4">
            <p className="text-sm font-semibold text-amber-200">Dự án có tin nhưng chưa nằm trong danh mục</p>
            <p className="mt-2 flex flex-wrap gap-2">
              {orphanProjects.map(name => (
                <span key={name} className="rounded-full border border-amber-700/50 bg-amber-900/30 px-3 py-1 text-xs font-semibold text-amber-100">
                  {name} ({liveProjects.get(name)})
                </span>
              ))}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
