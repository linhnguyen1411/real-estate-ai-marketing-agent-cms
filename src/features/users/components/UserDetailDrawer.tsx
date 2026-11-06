import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Building2,
  Crown,
  ExternalLink,
  KeyRound,
  Monitor,
  Receipt,
  ScrollText,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { getAdminUserOverview, type AdminUserOverview } from '../../../services/api';
import { getRoleBadgeClass, getRoleLabel } from '../userDisplay';
import { getPlanMeta } from '../planMeta';

type Props = {
  userId: string;
  onClose: () => void;
};

const TOPUP_STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: 'Chờ duyệt', className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  approved: { label: 'Đã duyệt', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  rejected: { label: 'Từ chối', className: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
  cancelled: { label: 'Đã hủy', className: 'border-slate-700 bg-slate-800/60 text-slate-400' },
};

const LICENSE_STATUS_META: Record<string, { label: string; className: string }> = {
  active: { label: 'Đang hiệu lực', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  revoked: { label: 'Đã thu hồi', className: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
  expired: { label: 'Hết hạn', className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
};

const TRANSACTION_TYPE_LABEL: Record<string, string> = {
  admin_deposit: 'Admin cộng token',
  admin_deduct: 'Admin trừ token',
  license_upgrade: 'Mua gói bằng token',
  lock: 'Khóa tạm giữ',
  unlock: 'Mở khóa tạm giữ',
};

function formatVnd(value: number) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN');
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-900 bg-slate-900/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-slate-400">{icon}</span>
        <div>
          <h4 className="text-sm font-bold text-white">{title}</h4>
          {subtitle && <p className="text-2xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-800 px-3 py-4 text-center text-2xs text-slate-500">
      {text}
    </div>
  );
}

export default function UserDetailDrawer({ userId, onClose }: Props) {
  const [overview, setOverview] = useState<AdminUserOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setOverview(await getAdminUserOverview(userId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không tải được thông tin người dùng.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const user = overview?.user;
  const planMeta = getPlanMeta(overview?.activeEntitlement?.plan);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        data-testid="user-detail-drawer"
        className="flex h-full w-full max-w-3xl flex-col border-l border-slate-800 bg-slate-950 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-xs font-bold text-slate-300">
              {user ? (user.name || user.email).slice(0, 2).toUpperCase() : '…'}
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-white">
                {user?.name || 'Thông tin thành viên'}
              </h3>
              <p className="truncate font-mono text-2xs text-slate-500">{user?.email || userId}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-900 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading ? (
            <div className="py-16 text-center text-xs text-slate-500">Đang tải thông tin thành viên...</div>
          ) : error ? (
            <div className="space-y-3 py-12 text-center">
              <p className="text-xs text-rose-300">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="min-h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-2xs font-bold text-slate-300 hover:bg-slate-700"
              >
                Thử lại
              </button>
            </div>
          ) : overview && user ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-2xs font-bold uppercase ${getRoleBadgeClass(user.role)}`}>
                  {getRoleLabel(user.role)}
                </span>
                <span className="inline-flex rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-2xs font-bold uppercase text-slate-300">
                  {user.status === 'active' ? 'Đang hoạt động' : 'Tạm khóa'}
                </span>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-2xs font-bold uppercase ${planMeta.badgeClass}`}>
                  {planMeta.label}
                </span>
                <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-2xs font-bold text-emerald-300">
                  {Number(overview.wallet?.balance ?? 0).toLocaleString('vi-VN')} token
                </span>
              </div>

              <Section icon={<UserRound className="h-4 w-4" />} title="Hồ sơ">
                <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-2xs uppercase tracking-wide text-slate-500">Email</dt>
                    <dd className="break-all font-mono text-slate-200">{user.email}</dd>
                  </div>
                  <div>
                    <dt className="text-2xs uppercase tracking-wide text-slate-500">Số điện thoại</dt>
                    <dd className="text-slate-200">{user.phone || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-2xs uppercase tracking-wide text-slate-500">Công ty</dt>
                    <dd className="font-mono text-slate-200">{user.company_id || 'system'}</dd>
                  </div>
                  <div>
                    <dt className="text-2xs uppercase tracking-wide text-slate-500">Ngày tạo</dt>
                    <dd className="text-slate-200">{formatDateTime(user.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-2xs uppercase tracking-wide text-slate-500">Hồ sơ công khai</dt>
                    <dd className="text-slate-200">
                      {overview.publicProfile.enabled ? (
                        <a
                          href={overview.publicProfile.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 break-all font-mono text-sky-300 hover:text-sky-200"
                        >
                          {overview.publicProfile.url}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ) : overview.publicProfile.reason === 'inactive' ? (
                        'Tạm ẩn (tài khoản đang bị khóa)'
                      ) : (
                        'Đã tắt hiển thị'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-2xs uppercase tracking-wide text-slate-500">Bảo mật</dt>
                    <dd className="text-slate-200">
                      {user.must_change_password ? 'Bắt buộc đổi mật khẩu' : 'Đã đổi mật khẩu'}
                    </dd>
                  </div>
                </dl>
              </Section>

              <Section
                icon={<Crown className="h-4 w-4" />}
                title="Gói dịch vụ"
                subtitle={overview.activeEntitlement ? `Hết hạn ${formatDateTime(overview.activeEntitlement.expiresAt)}` : 'Chưa có gói đang hiệu lực'}
              >
                {overview.entitlements.length === 0 ? (
                  <EmptyState text="Tài khoản chưa được cấp gói dịch vụ nào." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-800 text-2xs uppercase text-slate-500">
                        <tr>
                          <th className="py-2 pr-3">Gói</th>
                          <th className="px-3 py-2">Bắt đầu</th>
                          <th className="px-3 py-2">Kết thúc</th>
                          <th className="px-3 py-2">Nguồn</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {overview.entitlements.map((entitlement) => {
                          const meta = getPlanMeta(entitlement.plan);
                          const expired = new Date(entitlement.expiresAt).getTime() <= Date.now();
                          return (
                            <tr key={entitlement.id} className={expired ? 'text-slate-500' : 'text-slate-200'}>
                              <td className="py-2 pr-3">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-2xs font-bold uppercase ${meta.badgeClass}`}>
                                  {meta.label}
                                </span>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(entitlement.startsAt)}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(entitlement.expiresAt)}</td>
                              <td className="px-3 py-2 font-mono text-2xs">{entitlement.source}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              <Section icon={<Wallet className="h-4 w-4" />} title="Ví token">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <div className="text-2xs uppercase text-slate-500">Số dư</div>
                    <div className="font-mono text-sm font-bold text-white">
                      {Number(overview.wallet?.balance ?? 0).toLocaleString('vi-VN')}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <div className="text-2xs uppercase text-slate-500">Khả dụng</div>
                    <div className="font-mono text-sm font-bold text-emerald-300">
                      {Number(overview.wallet?.availableBalance ?? 0).toLocaleString('vi-VN')}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <div className="text-2xs uppercase text-slate-500">Trạng thái ví</div>
                    <div className="text-sm font-bold text-slate-200">
                      {overview.wallet?.status === 'frozen' ? 'Đang khóa' : 'Bình thường'}
                    </div>
                  </div>
                </div>
              </Section>

              <Section
                icon={<ScrollText className="h-4 w-4" />}
                title="Lịch sử giao dịch token"
                subtitle="50 giao dịch gần nhất (nạp, trừ, mua gói)"
              >
                {overview.transactions.length === 0 ? (
                  <EmptyState text="Chưa có giao dịch token nào." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-800 text-2xs uppercase text-slate-500">
                        <tr>
                          <th className="py-2 pr-3">Thời gian</th>
                          <th className="px-3 py-2">Loại</th>
                          <th className="px-3 py-2 text-right">Biến động</th>
                          <th className="px-3 py-2 text-right">Số dư sau</th>
                          <th className="px-3 py-2">Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {overview.transactions.map((transaction) => (
                          <tr key={transaction.id}>
                            <td className="py-2 pr-3 whitespace-nowrap text-slate-400">{formatDateTime(transaction.createdAt)}</td>
                            <td className="px-3 py-2 text-slate-200">
                              {TRANSACTION_TYPE_LABEL[transaction.type] || transaction.type}
                            </td>
                            <td className={`px-3 py-2 text-right font-mono font-bold ${transaction.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                              {transaction.amount >= 0 ? '+' : ''}
                              {transaction.amount.toLocaleString('vi-VN')}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-300">
                              {transaction.balanceAfter.toLocaleString('vi-VN')}
                            </td>
                            <td className="max-w-[220px] px-3 py-2 text-slate-400">
                              <span className="line-clamp-2">{transaction.note || '—'}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              <Section
                icon={<Receipt className="h-4 w-4" />}
                title="Lịch sử nạp token"
                subtitle="50 phiếu gần nhất, gồm cả phiếu chờ duyệt / bị từ chối"
              >
                {overview.topUpRequests.length === 0 ? (
                  <EmptyState text="Chưa có phiếu nạp token nào." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-800 text-2xs uppercase text-slate-500">
                        <tr>
                          <th className="py-2 pr-3">Mã</th>
                          <th className="px-3 py-2 text-right">Token</th>
                          <th className="px-3 py-2 text-right">Số tiền</th>
                          <th className="px-3 py-2">Trạng thái</th>
                          <th className="px-3 py-2">Thời gian</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {overview.topUpRequests.map((request) => {
                          const status = TOPUP_STATUS_META[request.status] || TOPUP_STATUS_META.pending;
                          return (
                            <tr key={request.id}>
                              <td className="py-2 pr-3 font-mono font-bold text-white">{request.code}</td>
                              <td className="px-3 py-2 text-right font-mono text-emerald-300">+{request.tokens}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-300">{formatVnd(request.amountVnd)}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-2xs font-bold ${status.className}`}>
                                  {status.label}
                                </span>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-slate-400">{formatDateTime(request.createdAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              <Section
                icon={<KeyRound className="h-4 w-4" />}
                title="License & thiết bị"
                subtitle="Mỗi tài khoản dùng một license key cho Desktop Agent"
              >
                {overview.licenseKeys.length === 0 ? (
                  <EmptyState text="Tài khoản chưa có license key." />
                ) : (
                  <div className="space-y-3">
                    {overview.licenseKeys.map((license) => {
                      const status = LICENSE_STATUS_META[license.status] || LICENSE_STATUS_META.expired;
                      return (
                        <div key={license.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold tracking-wide text-white">
                              {license.key || '••••-••••-••••-••••'}
                            </span>
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-2xs font-bold ${status.className}`}>
                              {status.label}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-slate-500">
                            <span>Tối đa {license.maxDevices} thiết bị</span>
                            <span>Tạo {formatDateTime(license.createdAt)}</span>
                            {license.revokedAt && <span>Thu hồi {formatDateTime(license.revokedAt)}</span>}
                          </div>
                          {license.devices.length === 0 ? (
                            <p className="mt-2 text-2xs text-slate-500">Chưa có thiết bị nào kích hoạt.</p>
                          ) : (
                            <ul className="mt-2 space-y-1.5">
                              {license.devices.map((device) => (
                                <li key={device.deviceId} className="flex items-start gap-2 text-2xs text-slate-300">
                                  <Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                                  <div>
                                    <div className="font-semibold">{device.deviceName}</div>
                                    <div className="text-slate-500">
                                      Kích hoạt {formatDateTime(device.activatedAt)} · Hoạt động gần nhất{' '}
                                      {formatDateTime(device.lastHeartbeatAt)}
                                    </div>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              <Section
                icon={<Building2 className="h-4 w-4" />}
                title="Tin đã đăng"
                subtitle={`${overview.properties.total} tin BĐS do thành viên tạo`}
              >
                {overview.properties.items.length === 0 ? (
                  <EmptyState text="Thành viên chưa đăng tin bất động sản nào." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-800 text-2xs uppercase text-slate-500">
                        <tr>
                          <th className="py-2 pr-3">Tiêu đề</th>
                          <th className="px-3 py-2">Loại</th>
                          <th className="px-3 py-2">Khu vực</th>
                          <th className="px-3 py-2 text-right">Giá</th>
                          <th className="px-3 py-2">Trạng thái</th>
                          <th className="px-3 py-2">Ngày tạo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {overview.properties.items.map((property) => (
                          <tr key={property.id}>
                            <td className="max-w-[240px] py-2 pr-3">
                              <span className="line-clamp-2 font-semibold text-slate-100">{property.title}</span>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-slate-300">
                              {property.type} · {property.transaction_type}
                            </td>
                            <td className="px-3 py-2 text-slate-400">{property.location}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-300">
                              {formatVnd(property.price * 1_000_000_000)}
                            </td>
                            <td className="px-3 py-2">
                              <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-2xs font-bold uppercase text-slate-300">
                                {property.sale_status}
                              </span>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-slate-400">{formatDateTime(property.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {overview.properties.total > overview.properties.items.length && (
                  <p className="mt-2 text-2xs text-slate-500">
                    Hiển thị {overview.properties.items.length}/{overview.properties.total} tin mới nhất.
                  </p>
                )}
              </Section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
