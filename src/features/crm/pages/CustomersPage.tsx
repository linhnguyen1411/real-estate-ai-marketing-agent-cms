import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Mail, Phone, Plus, Search, Sparkles, Users, X } from 'lucide-react';
import PaginationBar, { DEFAULT_PAGE_SIZE } from '../../../components/common/PaginationBar';
import {
  analyzeCustomer,
  createCustomer,
  invalidateCrmModule,
  listCustomers,
} from '../../../services/api';
import type { Customer } from '../../../types';

const PROPERTY_TYPE_OPTIONS = [
  'Đất nền',
  'Nhà Phố',
  'Căn Hộ',
  'Shophouse',
  'Kho xưởng',
  'Nhà hàng',
  'Khách sạn',
  'Biệt thự',
  'Villa',
  'Khác',
];

const EMPTY_CUSTOMER_FORM = {
  name: '',
  phone: '',
  email: '',
  source: 'facebook',
  budget: '5',
  interested_area: 'Hòa Xuân, Cẩm Lệ',
  property_type: 'Đất nền',
  status: 'new',
  notes: '',
};

type Notify = (message: string, type?: 'success' | 'error' | 'info') => void;

type Props = {
  onNotify: Notify;
  /** Optional: let App reload its customers list (Users panel / dashboard). */
  onCustomersChanged?: () => void;
  /** Optional: jump to chatbot with a draft prompt for this customer. */
  onDraftForCustomer?: (prompt: string) => void;
  initialSearch?: string;
};

export default function CustomersPage({
  onNotify,
  onCustomersChanged,
  onDraftForCustomer,
  initialSearch = '',
}: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState(EMPTY_CUSTOMER_FORM);
  const isFirstSearch = useRef(true);

  const loadCustomers = useCallback(
    async (nextPage: number, search: string) => {
      setLoading(true);
      try {
        const result = await listCustomers({
          page: nextPage,
          limit: DEFAULT_PAGE_SIZE,
          search: search.trim() || undefined,
          sort: 'created_at_desc',
        });
        setCustomers(result.items);
        setPage(result.pagination.page);
        setTotal(result.pagination.total);
      } catch (e) {
        onNotify(e instanceof Error ? e.message : 'Không tải được danh sách khách hàng.', 'error');
        setCustomers([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [onNotify],
  );

  useEffect(() => {
    const delay = isFirstSearch.current ? 0 : 350;
    isFirstSearch.current = false;
    const timer = window.setTimeout(() => {
      void loadCustomers(1, searchQuery);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [searchQuery, loadCustomers]);

  const handleAnalyzeCustomer = async (id: string) => {
    setActionLoading(`analyze-cust-${id}`);
    try {
      const customer = await analyzeCustomer(id);
      onNotify(`AI đã phân tích chấm điểm tiềm năng: ${customer.lead_score} điểm.`, 'success');
      setCustomers(prev => prev.map(c => (c.id === id ? customer : c)));
      onCustomersChanged?.();
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'Lỗi liên kết AI phân tích.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddCustomer = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const customer = await createCustomer(newCustomerForm);
      onNotify('Đã thêm khách hàng mới thành công!', 'success');
      invalidateCrmModule();
      setCustomers(prev => [customer, ...prev]);
      setTotal(prev => prev + 1);
      setShowAddModal(false);
      setNewCustomerForm(EMPTY_CUSTOMER_FORM);
      onCustomersChanged?.();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Lỗi thêm khách.', 'error');
    }
  };

  if (loading && customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Đang tải khách hàng CRM…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Quản lý khách hàng CRM
          </h2>
          <p className="text-slate-400 text-sm">
            Quản lý vòng đời khách hàng bất động sản và kích hoạt AI Agent phân tích hành vi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-rose-600/25 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm Khách Hàng CRM</span>
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
        <input
          type="text"
          placeholder="Tìm kiếm nhanh theo tên, địa lý hoặc chủng loại..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-slate-950 border border-slate-900 focus:border-rose-500/50 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-all"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-3.5 text-slate-500 hover:text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className={`bg-slate-900/40 rounded-2xl border border-slate-900 overflow-hidden ${loading ? 'opacity-60' : ''}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-900 text-xs uppercase tracking-wider text-slate-500">
                <th className="py-4 px-5">Tên khách hàng</th>
                <th className="py-4 px-5">Liên hệ</th>
                <th className="py-4 px-5">Nguồn</th>
                <th className="py-4 px-5">Khu vực quan tâm / Budget</th>
                <th className="py-4 px-5">Trạng thái</th>
                <th className="py-4 px-5">Chỉ số tiềm năng & Ghi chú thực tế</th>
                <th className="py-4 px-5 text-right">Thao tác AI Agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {customers.map(cust => (
                <tr key={cust.id} className="hover:bg-slate-900/20 transition-all even:bg-slate-900/10">
                  <td className="py-4 px-5">
                    <div className="font-bold text-white">{cust.name}</div>
                    <span className="text-xs text-slate-500 font-mono">ID: {cust.id}</span>
                  </td>
                  <td className="py-4 px-5 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-slate-300">
                      <Phone className="w-3 h-3 text-slate-500" /> {cust.phone}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-300">
                      <Mail className="w-3 h-3 text-slate-500" /> {cust.email || 'N/A'}
                    </div>
                  </td>
                  <td className="py-4 px-5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                        cust.source === 'facebook'
                          ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20'
                          : cust.source === 'zalo'
                            ? 'bg-sky-600/10 text-sky-400 border border-sky-500/20'
                            : cust.source === 'tiktok'
                              ? 'bg-pink-600/10 text-pink-400 border border-pink-500/20'
                              : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      {cust.source}
                    </span>
                  </td>
                  <td className="py-4 px-5 space-y-1">
                    <div className="font-bold text-slate-200">
                      <span className="capitalize">{cust.property_type}</span> @ {cust.interested_area}
                    </div>
                    <div className="text-xs text-amber-400 font-bold font-mono">Bán kính: {cust.budget} tỷ VND</div>
                  </td>
                  <td className="py-4 px-5">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        cust.status === 'hot'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : cust.status === 'warm'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : cust.status === 'new'
                              ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                              : cust.status === 'closed'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {cust.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-4 px-5 max-w-sm space-y-2">
                    <p className="text-xs text-slate-300 italic">“{cust.notes || 'Chưa có ghi chú.'}”</p>

                    {cust.ai_summary && (
                      <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-900 space-y-1.5">
                        <span className="text-rose-400 text-2xs font-bold uppercase tracking-wider flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" /> AI Tóm lược & Chỉ dẫn bán hàng
                        </span>
                        <p className="text-xs text-slate-400 leading-relaxed font-sans">{cust.ai_summary}</p>
                      </div>
                    )}
                  </td>
                  <td className="py-4 px-5 text-right space-y-2">
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="text-xs font-mono text-slate-400 mb-1">
                        Tiềm năng: <span className="font-bold text-white">{cust.lead_score} pts</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleAnalyzeCustomer(cust.id)}
                        disabled={actionLoading === `analyze-cust-${cust.id}`}
                        className="text-xs bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-md hover:shadow-rose-600/20 transition-all"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{actionLoading === `analyze-cust-${cust.id}` ? 'Đang chạy...' : 'Phân tích AI'}</span>
                      </button>
                      {onDraftForCustomer && (
                        <button
                          type="button"
                          onClick={() =>
                            onDraftForCustomer(
                              `Viết bài bán lô đất hợp gu khách hàng ${cust.name} dựa trên tài chính của họ.`,
                            )
                          }
                          className="text-2xs text-slate-400 hover:text-rose-400 underline"
                        >
                          Tạo bài gửi khách
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="py-10 px-5 text-center text-slate-500 text-sm">
                    Chưa có khách hàng nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {total > DEFAULT_PAGE_SIZE && (
        <PaginationBar
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          totalItems={total}
          onPageChange={nextPage => {
            void loadCustomers(nextPage, searchQuery);
          }}
          variant="dark"
        />
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 max-w-2xl w-full rounded-2xl shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                <Users className="w-5 h-5 text-rose-500" /> Thêm khách hàng CRM mới
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Họ và tên tên khách</label>
                  <input
                    type="text"
                    required
                    value={newCustomerForm.name}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                    placeholder="Nguyễn Văn A"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Số điện thoại</label>
                  <input
                    type="text"
                    required
                    value={newCustomerForm.phone}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                    placeholder="e.g. 0905xxxxx"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Địa chỉ Email</label>
                  <input
                    type="email"
                    value={newCustomerForm.email}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                    placeholder="optional@gmail.com"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Kênh tìm đến (Source)</label>
                  <select
                    value={newCustomerForm.source}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, source: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  >
                    <option value="facebook">Facebook Ads/Page</option>
                    <option value="zalo">Zalo OA/Inbox</option>
                    <option value="tiktok">TikTok Video Comments</option>
                    <option value="website">Website Form/Chat</option>
                    <option value="referral">Môi giới / Giới thiệu</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Ngân sách tài chính tối đa (Tỷ VND)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={newCustomerForm.budget}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, budget: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Khu vực địa lý chăm sóc</label>
                  <input
                    type="text"
                    required
                    value={newCustomerForm.interested_area}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, interested_area: e.target.value })}
                    placeholder="e.g. Hòa Xuân, Cẩm Lệ"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Loại hình sản phẩm quan tâm</label>
                  <select
                    value={newCustomerForm.property_type}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, property_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 animate-none"
                  >
                    {PROPERTY_TYPE_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-2xs font-semibold text-slate-400">Mức độ phân khúc</label>
                  <select
                    value={newCustomerForm.status}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, status: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200"
                  >
                    <option value="new">NEW (Khách mới tinh hỏi thăm)</option>
                    <option value="warm">WARM (Có nhu cầu, đang phân vân)</option>
                    <option value="hot">HOT (Thiện chí cọc, tiền sẵn sàng)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-2xs font-semibold text-slate-400">Ghi chú sâu về nhu cầu cụ thể</label>
                <textarea
                  rows={3}
                  value={newCustomerForm.notes}
                  onChange={e => setNewCustomerForm({ ...newCustomerForm, notes: e.target.value })}
                  placeholder="Khách cần hướng Đông Nam, lòng đường trên 7m5..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="bg-slate-950 hover:bg-slate-850 text-slate-400 text-xs px-4 py-2 rounded-xl border border-slate-800"
                >
                  Bỏ qua
                </button>
                <button
                  type="submit"
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-5 py-2 rounded-xl transition-all shadow-md shadow-rose-600/10"
                >
                  Tạo khách hàng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
