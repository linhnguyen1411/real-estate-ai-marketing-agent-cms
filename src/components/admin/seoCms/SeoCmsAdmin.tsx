import { useEffect, useState } from 'react';
import { FolderOpen, Plus, RefreshCw, Sparkles, Tags } from 'lucide-react';
import type { BlogArticle, BlogAuthor, BlogCategory, BlogTag } from '../../../types';
import {
  auditBlogPost,
  createBlogPost,
  duplicateCheckBlogPost,
  fetchBlogAuthors,
  fetchBlogCategories,
  fetchBlogPost,
  fetchBlogPosts,
  fetchBlogTags,
  publishBlogPost,
  suggestBlogPostMeta,
  updateBlogPost,
} from '../../../services/blogApi';
import AiCreateModal, { type AiGeneratedDraft } from './AiCreateModal';
import PostEditorPanel from './PostEditorPanel';
import SeoAuditAdmin from './SeoAuditAdmin';

export type SeoCmsSection = 'posts' | 'categories' | 'tags' | 'audit';

interface SeoCmsAdminProps {
  token: string;
  section?: SeoCmsSection;
}

export default function SeoCmsAdmin({ token, section = 'posts' }: SeoCmsAdminProps) {
  const [posts, setPosts] = useState<BlogArticle[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [tags, setTags] = useState<BlogTag[]>([]);
  const [authors, setAuthors] = useState<BlogAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editorPost, setEditorPost] = useState<BlogArticle | null>(null);
  const [aiDraft, setAiDraft] = useState<AiGeneratedDraft | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [editorAutoChecks, setEditorAutoChecks] = useState(false);

  const load = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [postData, categoryData, tagData, authorData] = await Promise.all([
        fetchBlogPosts(token, statusFilter === 'all' ? undefined : { status: statusFilter }),
        fetchBlogCategories(token),
        fetchBlogTags(token),
        fetchBlogAuthors(token),
      ]);
      setPosts(postData);
      setCategories(categoryData);
      setTags(tagData);
      setAuthors(authorData);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không tải được CMS');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, statusFilter]);

  const closeEditor = () => {
    setEditorPost(null);
    setAiDraft(null);
    setEditorAutoChecks(false);
  };

  const openEditor = async (post: BlogArticle) => {
    try {
      const full = post.id ? await fetchBlogPost(token, post.id) : post;
      setAiDraft(null);
      setEditorPost(full);
      setEditorAutoChecks(false);
    } catch {
      setAiDraft(null);
      setEditorPost(post);
    }
  };

  const handleAiGenerated = async (draft: AiGeneratedDraft) => {
    try {
      const tagData = await fetchBlogTags(token);
      setTags(tagData);
    } catch {
      // ignore
    }
    setEditorPost(null);
    setAiDraft(draft);
    setEditorAutoChecks(true);
    setMessage('Đã parse — review preview và bấm Lưu draft.');
  };

  const editorOpen = Boolean(editorPost || aiDraft);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Nội dung SEO — CMS</h2>
          <p className="text-xs text-slate-500">Estoria · Prompt workflow · SEO audit · DB-driven public</p>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {message && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200">{message}</div>
      )}

      {section === 'posts' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {['all', 'draft', 'review', 'published', 'archived'].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1 text-xs ${statusFilter === s ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-300'}`}
              >
                {s}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setShowAiModal(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white"
              >
                <Sparkles className="h-3.5 w-3.5" /> Tạo bằng AI
              </button>
              <button
                type="button"
                onClick={() => {
                  setAiDraft(null);
                  setEditorPost({} as BlogArticle);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Bài mới
              </button>
            </div>
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
                  {posts.map(post => (
                    <tr
                      key={post.id}
                      className="cursor-pointer border-t border-slate-800 hover:bg-slate-900/80"
                      onClick={() => void openEditor(post)}
                    >
                      <td className="px-4 py-3 font-medium text-white">{post.title}</td>
                      <td className="px-4 py-3">{post.status}</td>
                      <td className="px-4 py-3">{post.seoScore ?? '—'}</td>
                      <td className="px-4 py-3">{post.wordCount ?? '—'}</td>
                      <td className="px-4 py-3">{post.sourceType || 'manual'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {section === 'categories' && (
        <div className="rounded-xl border border-slate-800 p-4">
          <p className="mb-3 text-sm text-slate-400">Menu public chỉ hiện category có bài published.</p>
          <ul className="space-y-2 text-sm">
            {categories.map(c => (
              <li key={c.id} className="flex justify-between rounded-lg border border-slate-800 px-3 py-2 text-slate-200">
                <span className="flex items-center gap-2"><FolderOpen className="h-3.5 w-3.5 text-slate-500" />{c.name}</span>
                <span className="text-slate-500">{c.postCount ?? 0} bài · {c.hubPath}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {section === 'tags' && (
        <div className="flex flex-wrap gap-2">
          {tags.map(t => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
              <Tags className="h-3 w-3" /> {t.name}
            </span>
          ))}
        </div>
      )}

      {section === 'audit' && (
        <SeoAuditAdmin posts={posts} loading={loading} onOpenPost={post => void openEditor(post)} />
      )}

      {showAiModal && (
        <AiCreateModal
          token={token}
          onClose={() => setShowAiModal(false)}
          onGenerated={handleAiGenerated}
          onToast={msg => setMessage(msg)}
        />
      )}

      {editorOpen && (
        <PostEditorPanel
          token={token}
          post={editorPost?.id ? editorPost : null}
          initialDraft={aiDraft}
          categories={categories}
          tags={tags}
          authors={authors}
          publishedPosts={posts.filter(p => p.status === 'published')}
          autoRunChecks={editorAutoChecks}
          openSeoTab={false}
          onClose={closeEditor}
          onTagsRefresh={async () => {
            const tagData = await fetchBlogTags(token);
            setTags(tagData);
          }}
          onSaved={async (postId, savedArticle) => {
            await load();
            const article = savedArticle || (postId ? await fetchBlogPost(token, postId) : null);
            if (article) {
              setEditorPost(article);
              setAiDraft(null);
            }
            setMessage('Đã lưu bài viết.');
          }}
          onPublish={async (id, force) => {
            try {
              await publishBlogPost(token, id, force);
              setMessage(force ? 'Đã publish (override duplicate).' : 'Đã publish.');
              await load();
              const full = await fetchBlogPost(token, id);
              setEditorPost(full);
              setAiDraft(null);
            } catch (error: unknown) {
              const err = error as Error & { data?: { audit?: { errors?: string[] }; duplicate?: { blockers?: string[] } } };
              const parts = [err.message || 'Publish bị chặn'];
              if (err.data?.duplicate?.blockers?.length) parts.push(...err.data.duplicate.blockers);
              setMessage(parts.join(' · '));
              throw err;
            }
          }}
          onAudit={id => auditBlogPost(token, id)}
          onDuplicateCheck={id => duplicateCheckBlogPost(token, id)}
          onSuggest={payload => suggestBlogPostMeta(token, payload)}
          onCreate={payload => createBlogPost(token, payload)}
          onUpdate={(id, payload) => updateBlogPost(token, id, payload)}
        />
      )}
    </div>
  );
}
