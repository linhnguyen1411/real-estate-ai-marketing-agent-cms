import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import type { BlogArticle, BlogAuthor, BlogCategory, BlogFaq, BlogTag } from '../../types';
import {
  createBlogPost,
  deleteBlogPost,
  fetchBlogAuthors,
  fetchBlogCategories,
  fetchBlogPosts,
  fetchBlogTags,
  updateBlogPost,
} from '../../services/blogApi';

interface SeoContentAdminProps {
  token: string;
}

const EMPTY_FAQ: BlogFaq = { question: '', answer: '' };

const EMPTY_FORM = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  metaTitle: '',
  metaDescription: '',
  coverImage: '',
  status: 'draft' as 'draft' | 'published',
  categoryId: '',
  authorId: '',
  tagIds: [] as string[],
  faqs: [{ ...EMPTY_FAQ }] as BlogFaq[],
};

export default function SeoContentAdmin({ token }: SeoContentAdminProps) {
  const [posts, setPosts] = useState<BlogArticle[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [tags, setTags] = useState<BlogTag[]>([]);
  const [authors, setAuthors] = useState<BlogAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [message, setMessage] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
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
      setMessage(error instanceof Error ? error.message : 'Không tải được dữ liệu blog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token, statusFilter]);

  const editingPost = useMemo(
    () => posts.find(post => post.id === editingId) || null,
    [posts, editingId]
  );

  const resetForm = () => {
    setEditingId(null);
    setEditorOpen(false);
    setForm({
      ...EMPTY_FORM,
      authorId: authors[0]?.id || '',
      categoryId: categories[0]?.id || '',
    });
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      authorId: authors[0]?.id || '',
      categoryId: categories[0]?.id || '',
    });
    setMessage('');
    setEditorOpen(true);
  };

  const openEdit = (post: BlogArticle) => {
    setEditingId(post.id);
    setForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content || '',
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      coverImage: post.coverImage || '',
      status: post.status,
      categoryId: post.categoryId,
      authorId: post.authorId,
      tagIds: (post.tags || []).map(tag => tag.id),
      faqs: post.faqs?.length ? post.faqs.map(faq => ({ question: faq.question, answer: faq.answer })) : [{ ...EMPTY_FAQ }],
    });
    setMessage('');
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.slug.trim() || !form.categoryId || !form.authorId) {
      setMessage('Vui lòng nhập tiêu đề, slug, chuyên mục và tác giả.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        ...form,
        faqs: form.faqs.filter(faq => faq.question.trim() && faq.answer.trim()),
        coverImage: form.coverImage || null,
        metaTitle: form.metaTitle || form.title,
      };
      if (editingId) {
        await updateBlogPost(token, editingId, payload);
        setMessage('Đã cập nhật bài viết.');
      } else {
        await createBlogPost(token, payload);
        setMessage('Đã tạo bài viết mới.');
      }
      await loadData();
      resetForm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Xóa bài viết này?')) return;
    try {
      await deleteBlogPost(token, id);
      setMessage('Đã xóa bài viết.');
      if (editingId === id) resetForm();
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Xóa thất bại');
    }
  };

  const togglePublish = async (post: BlogArticle) => {
    try {
      await updateBlogPost(token, post.id, {
        status: post.status === 'published' ? 'draft' : 'published',
      });
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Cập nhật trạng thái thất bại');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Nội dung SEO</h2>
          <p className="text-sm text-slate-400">Quản lý bài viết tin tức / phân tích public tại /tin-tuc</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
          <button onClick={loadData} className="rounded-lg border border-slate-800 p-2 text-slate-300 hover:text-white">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white">
            <Plus className="h-4 w-4" />
            Tạo bài viết
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-200">
          {message}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">Tiêu đề</th>
                <th className="px-4 py-3 text-left">Chuyên mục</th>
                <th className="px-4 py-3 text-left">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {posts.map(post => (
                <tr key={post.id} className="border-t border-slate-900 text-slate-200">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-white">{post.title}</div>
                    <div className="text-xs text-slate-500">/tin-tuc/{post.slug}</div>
                  </td>
                  <td className="px-4 py-3">{post.category?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => togglePublish(post)}
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        post.status === 'published' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      {post.status}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {post.status === 'published' && (
                        <a
                          href={`/tin-tuc/${post.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-slate-800 p-2 text-slate-300 hover:text-white"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <button onClick={() => openEdit(post)} className="rounded-lg border border-slate-800 p-2 text-slate-300 hover:text-white">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(post.id)} className="rounded-lg border border-rose-900/50 p-2 text-rose-300 hover:text-rose-200">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && posts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    Chưa có bài viết. Chạy seed hoặc tạo mới.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      {editorOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-white">{editingPost ? 'Sửa bài viết SEO' : 'Tạo bài viết SEO'}</h3>
                <p className="text-xs text-slate-500">Public tại /tin-tuc/[slug]</p>
              </div>
              <button type="button" onClick={resetForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 app-scroll">
              <div className="grid gap-4 lg:grid-cols-2">
                {['title', 'slug', 'excerpt', 'metaTitle', 'metaDescription', 'coverImage'].map(field => (
                  <label key={field} className={`block text-xs text-slate-400 ${field === 'excerpt' || field === 'metaDescription' ? 'lg:col-span-2' : ''}`}>
                    {field}
                    <input
                      value={(form as any)[field]}
                      onChange={event => setForm(prev => ({ ...prev, [field]: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-white"
                    />
                  </label>
                ))}
              </div>

              <label className="mt-4 block text-xs text-slate-400">
                Nội dung (Markdown)
                <textarea
                  value={form.content}
                  onChange={event => setForm(prev => ({ ...prev, content: event.target.value }))}
                  rows={16}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-white font-mono"
                />
              </label>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block text-xs text-slate-400">
                  Chuyên mục
                  <select
                    value={form.categoryId}
                    onChange={event => setForm(prev => ({ ...prev, categoryId: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-white"
                  >
                    <option value="">Chọn</option>
                    {categories.map(category => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-slate-400">
                  Tác giả
                  <select
                    value={form.authorId}
                    onChange={event => setForm(prev => ({ ...prev, authorId: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-white"
                  >
                    <option value="">Chọn</option>
                    {authors.map(author => (
                      <option key={author.id} value={author.id}>{author.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-slate-400">
                  Trạng thái
                  <select
                    value={form.status}
                    onChange={event => setForm(prev => ({ ...prev, status: event.target.value as 'draft' | 'published' }))}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-white"
                  >
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                  </select>
                </label>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs text-slate-400">Tags</div>
                <div className="flex flex-wrap gap-2">
                  {tags.map(tag => (
                    <label key={tag.id} className="inline-flex items-center gap-1 rounded-full border border-slate-800 px-2 py-1 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={form.tagIds.includes(tag.id)}
                        onChange={event => {
                          setForm(prev => ({
                            ...prev,
                            tagIds: event.target.checked
                              ? [...prev.tagIds, tag.id]
                              : prev.tagIds.filter(id => id !== tag.id),
                          }));
                        }}
                      />
                      {tag.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="text-xs text-slate-400">FAQ</div>
                {form.faqs.map((faq, index) => (
                  <div key={index} className="rounded-lg border border-slate-800 p-3 space-y-2">
                    <input
                      value={faq.question}
                      placeholder="Câu hỏi"
                      onChange={event => {
                        const next = [...form.faqs];
                        next[index] = { ...next[index], question: event.target.value };
                        setForm(prev => ({ ...prev, faqs: next }));
                      }}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                    <textarea
                      value={faq.answer}
                      placeholder="Trả lời"
                      rows={3}
                      onChange={event => {
                        const next = [...form.faqs];
                        next[index] = { ...next[index], answer: event.target.value };
                        setForm(prev => ({ ...prev, faqs: next }));
                      }}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, faqs: [...prev.faqs, { ...EMPTY_FAQ }] }))}
                  className="text-xs font-semibold text-rose-400"
                >
                  + Thêm FAQ
                </button>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-800 px-6 py-4">
              {editingPost?.status === 'published' && (
                <a
                  href={`/tin-tuc/${editingPost.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-rose-400 hover:text-rose-300"
                >
                  <ExternalLink className="h-4 w-4" />
                  Xem bài public
                </a>
              )}
              <div className="ml-auto flex gap-2">
                <button onClick={resetForm} className="rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-300">
                  Hủy
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {saving ? 'Đang lưu...' : editingPost ? 'Cập nhật bài viết' : 'Tạo bài viết'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
