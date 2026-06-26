import { useMemo } from 'react';
import { AlertTriangle, FileSearch } from 'lucide-react';
import type { BlogArticle } from '../../../types';
import { DUPLICATE_WARNING } from './seoCmsConstants';

interface SeoAuditAdminProps {
  posts: BlogArticle[];
  loading: boolean;
  onOpenPost: (post: BlogArticle) => void;
}

export default function SeoAuditAdmin({ posts, loading, onOpenPost }: SeoAuditAdminProps) {
  const auditRows = useMemo(
    () =>
      posts
        .filter(p => p.status === 'draft' || p.status === 'review' || p.status === 'published')
        .sort((a, b) => (b.seoScore ?? 0) - (a.seoScore ?? 0)),
    [posts]
  );

  const lowScore = auditRows.filter(p => (p.seoScore ?? 100) < 70);
  const drafts = auditRows.filter(p => p.status === 'draft' || p.status === 'review');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-white">
          <FileSearch className="h-5 w-5 text-amber-400" />
          SEO Audit
        </h2>
        <p className="text-xs text-slate-500">Word count · H2 · FAQ · meta · internal links · duplicate check khi publish</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="text-2xl font-bold text-white">{drafts.length}</div>
          <div className="text-xs text-slate-500">Draft / Review chờ duyệt</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="text-2xl font-bold text-amber-300">{lowScore.length}</div>
          <div className="text-xs text-slate-500">SEO score &lt; 70</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="text-2xl font-bold text-white">{auditRows.length}</div>
          <div className="text-xs text-slate-500">Tổng bài trong CMS</div>
        </div>
      </div>

      <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">
        <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
        Publish bị chặn nếu duplicate similarity &gt; 35%. {DUPLICATE_WARNING}
      </div>

      {loading ? (
        <p className="text-slate-400">Đang tải...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Tiêu đề</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">SEO</th>
                <th className="px-4 py-3">Từ</th>
                <th className="px-4 py-3">Nguồn</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map(post => (
                <tr
                  key={post.id}
                  className="cursor-pointer border-t border-slate-800 hover:bg-slate-900/80"
                  onClick={() => onOpenPost(post)}
                >
                  <td className="px-4 py-3 font-medium text-white">{post.title}</td>
                  <td className="px-4 py-3">{post.status}</td>
                  <td className={`px-4 py-3 ${(post.seoScore ?? 0) < 70 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {post.seoScore ?? '—'}
                  </td>
                  <td className="px-4 py-3">{post.wordCount ?? '—'}</td>
                  <td className="px-4 py-3">{post.sourceType || 'manual'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
