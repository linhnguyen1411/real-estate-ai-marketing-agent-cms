import React, { useState } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertCircle, ArrowRight, Download } from 'lucide-react';
import { slugify } from '../../../seo/utils/slugify';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
};

interface BatchRow {
  project_name: string;
  block: string;
  lot: string;
  street: string;
  area: number;
  direction: string;
  price: number;
  legal_status: string;
  contact_phone: string;
  type: string;
}

const SAMPLE_CSV = `Dự án,Block,Lô,Đường,Diện tích,Hướng,Giá,Pháp lý,SĐT,Loại hình
Nam Hòa Xuân,B2-15,45,Minh Mạng,100,Đông Nam,3.85,Sổ hồng riêng,0905777594,Đất nền
Nam Hòa Xuân,B2-18,12,Đường 7.5m,105,Tây Bắc,3.75,Sổ hồng riêng,0905777594,Đất nền
Nam Hòa Xuân,B2-20,08,Nguyễn Phước Lan,150,Đông,6.20,Sổ hồng riêng,0905777594,Đất nền
Hòa Xuân,B1-04,33,Đường 10.5m,100,Nam,3.50,Sổ hồng riêng,0905777594,Đất nền`;

export default function BatchImportModal({ isOpen, onClose, onSuccess, onNotify }: Props) {
  const [csvText, setCsvText] = useState('');
  const [parsedRows, setParsedRows] = useState<BatchRow[]>([]);
  const [importing, setImporting] = useState(false);

  if (!isOpen) return null;

  const parseCsvContent = (content: string) => {
    const lines = content.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length <= 1) {
      setParsedRows([]);
      return;
    }

    // Header index mapping
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const findCol = (terms: string[]) => header.findIndex(h => terms.some(t => h.includes(t)));

    const projectIdx = findCol(['dự án', 'project', 'khu']);
    const blockIdx = findCol(['block', 'khu vực', 'b']);
    const lotIdx = findCol(['lô', 'lot', 'số']);
    const streetIdx = findCol(['đường', 'tuyến', 'street']);
    const areaIdx = findCol(['diện tích', 'dt', 'area']);
    const dirIdx = findCol(['hướng', 'direction']);
    const priceIdx = findCol(['giá', 'price']);
    const legalIdx = findCol(['pháp lý', 'legal', 'sổ']);
    const phoneIdx = findCol(['sđt', 'phone', 'liên hệ', 'tel']);
    const typeIdx = findCol(['loại', 'type']);

    const rows: BatchRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length < 3) continue;

      const project_name = projectIdx >= 0 && cols[projectIdx] ? cols[projectIdx] : 'Nam Hòa Xuân';
      const block = blockIdx >= 0 && cols[blockIdx] ? cols[blockIdx].toUpperCase() : '';
      const lot = lotIdx >= 0 && cols[lotIdx] ? cols[lotIdx] : '';
      const street = streetIdx >= 0 && cols[streetIdx] ? cols[streetIdx] : '';
      const area = areaIdx >= 0 && parseFloat(cols[areaIdx].replace(',', '.')) ? parseFloat(cols[areaIdx].replace(',', '.')) : 100;
      const direction = dirIdx >= 0 && cols[dirIdx] ? cols[dirIdx] : 'Đông Nam';
      const price = priceIdx >= 0 && parseFloat(cols[priceIdx].replace(',', '.')) ? parseFloat(cols[priceIdx].replace(',', '.')) : 0;
      const legal_status = legalIdx >= 0 && cols[legalIdx] ? cols[legalIdx] : 'Sổ hồng riêng';
      const contact_phone = phoneIdx >= 0 && cols[phoneIdx] ? cols[phoneIdx] : '';
      const type = typeIdx >= 0 && cols[typeIdx] ? cols[typeIdx] : 'Đất nền';

      rows.push({
        project_name,
        block,
        lot,
        street,
        area,
        direction,
        price,
        legal_status,
        contact_phone,
        type,
      });
    }

    setParsedRows(rows);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const text = String(evt.target?.result || '');
      setCsvText(text);
      parseCsvContent(text);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleFillSample = () => {
    setCsvText(SAMPLE_CSV);
    parseCsvContent(SAMPLE_CSV);
  };

  const handleImport = async () => {
    if (!parsedRows.length) return;
    setImporting(true);
    try {
      const itemsToImport = parsedRows.map(r => {
        const blockPart = r.block ? (r.lot ? `${r.block} Lô ${r.lot}` : r.block) : '';
        const title = `${r.type} ${blockPart ? `${blockPart} ` : ''}${r.project_name}${r.street ? ` - ${r.street}` : ''} - ${r.area}m² - Giá ${r.price > 0 ? `${r.price} tỷ` : 'Thương lượng'}`.trim();
        const slug = slugify(title);

        return {
          ...r,
          title,
          slug,
          location: `${r.street ? `${r.street}, ` : ''}${r.project_name}, Đà Nẵng`,
          description: `${r.type} tại ${r.project_name}. Diện tích ${r.area}m2, hướng ${r.direction}, ${r.legal_status}. Liên hệ ${r.contact_phone || 'House & Life'}.`,
          rich_description: `Bất động sản House & Life giới thiệu sản phẩm ${r.type.toLowerCase()} tại ${r.block ? `Block ${r.block} ` : ''}${r.project_name}, Đà Nẵng. Diện tích chuẩn ${r.area}m², đường ${r.street || 'rộng rãi'}, hướng ${r.direction}. Pháp lý ${r.legal_status}, sẵn sàng công chứng. Giá bán hấp dẫn ${r.price} tỷ. Liên hệ hotline để xem thực tế.`,
          selling_points: [
            `Vị trí đẹp tại ${r.project_name}, hạ tầng hoàn thiện`,
            r.block ? `Thuộc Block ${r.block}${r.lot ? `, Lô ${r.lot}` : ''}` : 'Khu vực đông đúc',
            `Pháp lý chuẩn: ${r.legal_status}`,
            `Giá bán tốt: ${r.price} tỷ`,
          ],
        };
      });

      const res = await fetch('/api/admin/properties/batch-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToImport }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        onNotify(`🎉 ${json.message}`, 'success');
        onSuccess();
        onClose();
      } else {
        onNotify(json.message || 'Lỗi khi import giỏ hàng', 'error');
      }
    } catch (err: any) {
      onNotify(err.message || 'Lỗi kết nối máy chủ', 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-indigo-600/20">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Batch Import Giỏ hàng (CSV / Excel)
                <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-2xs font-semibold text-blue-400 border border-blue-500/20">
                  Nhiều Lô / Block
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Nhập danh sách nhiều bất động sản từ file CSV hoặc dán bảng dữ liệu giỏ hàng.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Action bar for template and file */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-950 rounded-xl border border-slate-800">
            <div className="flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3.5 py-2 text-xs font-bold text-white transition-all">
                <FileText className="w-4 h-4" />
                Chọn File CSV / TXT
                <input
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
              <button
                type="button"
                onClick={handleFillSample}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium underline"
              >
                + Dán dữ liệu mẫu 4 lô Nam Hòa Xuân
              </button>
            </div>
            <span className="text-2xs text-slate-400 font-mono">
              Headers: Dự án, Block, Lô, Đường, Diện tích, Hướng, Giá, Pháp lý, SĐT
            </span>
          </div>

          {/* Paste CSV textarea */}
          <div>
            <textarea
              rows={4}
              value={csvText}
              onChange={e => {
                setCsvText(e.target.value);
                parseCsvContent(e.target.value);
              }}
              placeholder="Hoặc dán trực tiếp nội dung file CSV tại đây..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs font-mono text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500"
            />
          </div>

          {/* Table preview */}
          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">
                  Xem trước danh sách ({parsedRows.length} bất động sản phát hiện)
                </span>
                <span className="text-2xs text-emerald-400 font-medium">✓ Sẵn sàng import</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 uppercase text-2xs font-semibold">
                    <tr>
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">Dự án</th>
                      <th className="p-2.5">Block/Lô</th>
                      <th className="p-2.5">Tuyến đường</th>
                      <th className="p-2.5">Diện tích</th>
                      <th className="p-2.5">Hướng</th>
                      <th className="p-2.5">Giá bán</th>
                      <th className="p-2.5">Pháp lý</th>
                      <th className="p-2.5">SĐT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {parsedRows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-900/50">
                        <td className="p-2.5 text-slate-500">{i + 1}</td>
                        <td className="p-2.5 font-sans font-medium text-white">{r.project_name}</td>
                        <td className="p-2.5 text-amber-300 font-bold">
                          {r.block} {r.lot ? `(Lô ${r.lot})` : ''}
                        </td>
                        <td className="p-2.5 font-sans">{r.street || '-'}</td>
                        <td className="p-2.5">{r.area} m²</td>
                        <td className="p-2.5 font-sans">{r.direction}</td>
                        <td className="p-2.5 text-emerald-400 font-bold">{r.price} tỷ</td>
                        <td className="p-2.5 font-sans text-2xs">{r.legal_status}</td>
                        <td className="p-2.5 text-slate-400">{r.contact_phone || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4 bg-slate-950/70">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
          >
            Đóng
          </button>

          <button
            type="button"
            disabled={importing || parsedRows.length === 0}
            onClick={handleImport}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 hover:brightness-110 disabled:opacity-50 transition-all"
          >
            {importing ? (
              <>Đang xử lý import...</>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                🚀 Bắt đầu Import ({parsedRows.length} BĐS)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
