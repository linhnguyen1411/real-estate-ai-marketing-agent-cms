import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardPaste, ExternalLink, FileSearch, ImagePlus, Sparkles, X } from 'lucide-react';
import type { BlogArticle, BlogAuthor, BlogCategory, BlogTag, DuplicateCheckReport, SeoAuditReport } from '../../../types';
import { parsePastedMarkdown, previewBlogChecks, uploadBlogCoverImage, uploadContentImage } from '../../../services/blogApi';
import { resizeImageFile } from '../../../utils/resizeImageFile';
import RichTextEditor from '../../common/RichTextEditor';
import BlogArticleBody from '../../blog/BlogArticleBody';
import ArticleTableOfContents from '../../blog/ArticleTableOfContents';
import FaqSection from '../../FaqSection';
import { buildPostCta } from '../../../seo/buildPostCta';
import { DUPLICATE_WARNING } from './seoCmsConstants';
import PostFaqEditor from './PostFaqEditor';
import type { AiGeneratedDraft } from './AiCreateModal';

interface PostEditorPanelProps {
  token: string;
  post: BlogArticle | null;
  categories: BlogCategory[];
  tags: BlogTag[];
  authors: BlogAuthor[];
  publishedPosts?: BlogArticle[];
  initialDraft?: AiGeneratedDraft | null;
  autoRunChecks?: boolean;
  openSeoTab?: boolean;
  onClose: () => void;
  onSaved: (postId?: string, savedArticle?: BlogArticle) => void;
  onTagsRefresh?: () => Promise<void>;
  onPublish: (id: string, force: boolean) => Promise<void>;
  onAudit: (id: string) => Promise<SeoAuditReport>;
  onDuplicateCheck: (id: string) => Promise<DuplicateCheckReport>;
  onSuggest: (payload: Record<string, unknown>) => Promise<any>;
  onCreate: (payload: Record<string, unknown>) => Promise<BlogArticle>;
  onUpdate: (id: string, payload: Record<string, unknown>) => Promise<BlogArticle>;
}

const EMPTY_FAQ = { question: '', answer: '' };

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function postToFormState(post: BlogArticle) {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.contentMarkdown || post.content || '',
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    coverImage: post.coverImage || '',
    status: post.status,
    publishedAt: toDatetimeLocalValue(post.publishedAt),
    categoryId: post.categoryId,
    authorId: post.authorId,
    tagIds: (post.tags || []).map(t => t.id),
    faqs: post.faqs?.length ? post.faqs.map(f => ({ question: f.question, answer: f.answer })) : [{ ...EMPTY_FAQ }],
    primaryKeyword: post.primaryKeyword || '',
    targetIntent: post.targetIntent || '',
    canonicalUrl: post.canonicalUrl || '',
    relatedSuggestions: post.relatedSuggestions || [],
    relatedPostIds: post.relatedPostIds || [],
  };
}

export default function PostEditorPanel({
  token,
  post,
  categories,
  tags,
  authors,
  publishedPosts = [],
  initialDraft,
  autoRunChecks = false,
  openSeoTab = false,
  onClose,
  onSaved,
  onTagsRefresh,
  onPublish,
  onAudit,
  onDuplicateCheck,
  onSuggest,
  onCreate,
  onUpdate,
}: PostEditorPanelProps) {
  const [form, setForm] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    metaTitle: '',
    metaDescription: '',
    coverImage: '',
    status: 'draft' as BlogArticle['status'],
    publishedAt: '',
    categoryId: '',
    authorId: '',
    tagIds: [] as string[],
    faqs: [{ ...EMPTY_FAQ }],
    primaryKeyword: '',
    targetIntent: '',
    canonicalUrl: '',
    relatedSuggestions: [] as string[],
    relatedPostIds: [] as string[],
  });
  const [cleanWarnings, setCleanWarnings] = useState<string[]>([]);
  const [suggestedRelated, setSuggestedRelated] = useState<{ id: string; slug: string; title: string; categoryName: string; score: number }[]>([]);
  const [audit, setAudit] = useState<SeoAuditReport | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateCheckReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(!openSeoTab);
  const [showImport, setShowImport] = useState(!post?.id);
  const [importMarkdown, setImportMarkdown] = useState('');
  const [importError, setImportError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [savedPostId, setSavedPostId] = useState<string | undefined>(post?.id);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState('');
  const coverInputRef = useRef<HTMLInputElement>(null);

  const applyParsedDraft = (data: {
    title: string;
    slug: string;
    excerpt: string;
    metaTitle: string;
    metaDescription: string;
    primaryKeyword: string;
    coverImage: string | null;
    tagIds: string[];
    markdown: string;
    faqs: { question: string; answer: string }[];
    relatedSuggestions?: string[];
    suggestedRelated?: { id: string; slug: string; title: string; categoryName: string; score: number }[];
    cta?: { leadIntent: string };
    cleanWarnings?: string[];
    audit: SeoAuditReport;
    duplicate: DuplicateCheckReport;
  }) => {
    const ctaIntent = data.cta?.leadIntent || '';
    setForm(prev => ({
      ...prev,
      title: data.title,
      slug: data.slug,
      excerpt: data.excerpt,
      content: data.markdown,
      metaTitle: data.metaTitle,
      metaDescription: data.metaDescription,
      coverImage: data.coverImage || '',
      primaryKeyword: data.primaryKeyword,
      tagIds: data.tagIds,
      faqs: data.faqs.length ? data.faqs : [{ ...EMPTY_FAQ }],
      relatedSuggestions: data.relatedSuggestions || [],
      relatedPostIds: [],
      targetIntent: ctaIntent,
      authorId: prev.authorId || authors[0]?.id || '',
      categoryId: prev.categoryId || categories[0]?.id || '',
    }));
    setSuggestedRelated(data.suggestedRelated || []);
    setCleanWarnings(data.cleanWarnings || []);
    setAudit(data.audit);
    setDuplicate(data.duplicate);
    setShowPreview(true);
    setShowImport(false);
    setImportMarkdown('');
  };

  useEffect(() => {
    setSavedPostId(post?.id);
  }, [post?.id]);

  useEffect(() => {
    if (!initialDraft) return;
    const tagIds =
      initialDraft.tagIds?.length
        ? initialDraft.tagIds
        : tags
            .filter(
              t =>
                initialDraft.tagNames?.includes(t.name) ||
                initialDraft.tagNames?.includes(t.slug)
            )
            .map(t => t.id);
    setForm({
      title: initialDraft.title,
      slug: initialDraft.slug,
      excerpt: initialDraft.excerpt,
      content: initialDraft.markdown,
      metaTitle: initialDraft.metaTitle,
      metaDescription: initialDraft.metaDescription,
      coverImage: initialDraft.coverImage || '',
      status: 'draft',
      publishedAt: '',
      categoryId: initialDraft.categoryId || categories[0]?.id || '',
      authorId: authors[0]?.id || '',
      tagIds,
      faqs: initialDraft.faqs?.length ? initialDraft.faqs : [{ ...EMPTY_FAQ }],
      primaryKeyword: initialDraft.primaryKeyword,
      targetIntent: initialDraft.targetIntent || initialDraft.cta?.leadIntent || '',
      canonicalUrl: '',
      relatedSuggestions: initialDraft.relatedSuggestions || [],
      relatedPostIds: initialDraft.relatedPostIds || [],
    });
    setSuggestedRelated(initialDraft.suggestedRelated || []);
    setCleanWarnings(initialDraft.cleanWarnings || []);
    setAudit(initialDraft.audit || null);
    setDuplicate(initialDraft.duplicate || null);
    setShowPreview(true);
  }, [initialDraft, tags, authors, categories]);

  useEffect(() => {
    if (initialDraft || !post?.id) return;
    setForm(postToFormState(post));
  }, [post?.id, initialDraft]);

  const editingId = savedPostId || post?.id;

  useEffect(() => {
    if (initialDraft || post?.id) return;
    setForm(prev => ({
      ...prev,
      authorId: prev.authorId || authors[0]?.id || '',
      categoryId: prev.categoryId || categories[0]?.id || '',
    }));
  }, [authors, categories, initialDraft, post?.id]);

  useEffect(() => {
    if (autoRunChecks && post?.id) void runSavedChecks();
  }, [autoRunChecks, post?.id]);

  const cta = useMemo(
    () =>
      buildPostCta({
        title: form.title,
        primaryKeyword: form.primaryKeyword,
        tags: tags.filter(t => form.tagIds.includes(t.id)).map(t => t.name),
        categoryName: categories.find(c => c.id === form.categoryId)?.name,
        contentText: form.content,
      }),
    [form.title, form.primaryKeyword, form.tagIds, form.categoryId, form.content, tags, categories]
  );

  const payload = useMemo(() => {
    const { publishedAt: publishedAtLocal, ...rest } = form;
    const includePublishedAt = form.status === 'published' || form.status === 'archived';
    return {
      ...rest,
      faqs: form.faqs.filter(f => f.question.trim() && f.answer.trim()),
      targetIntent: form.targetIntent || cta.leadIntent,
      ...(includePublishedAt && publishedAtLocal
        ? { publishedAt: new Date(publishedAtLocal).toISOString() }
        : {}),
    };
  }, [form, cta.leadIntent]);

  const selectedRelated = publishedPosts.filter(p => form.relatedPostIds.includes(p.id));
  const relatedCandidates = suggestedRelated.length
    ? suggestedRelated
    : publishedPosts
        .filter(p => p.id !== post?.id && p.status === 'published')
        .slice(0, 8)
        .map(p => ({ id: p.id, slug: p.slug, title: p.title, categoryName: p.category?.name || '', score: 0 }));

  const handleCoverFileChange = async (file: File | null) => {
    if (!file) return;
    setCoverUploadError('');
    setCoverUploading(true);
    try {
      const dataUrl = await resizeImageFile(file);
      const { url } = await uploadBlogCoverImage(token, dataUrl, form.slug || editingId);
      setForm(prev => ({ ...prev, coverImage: url }));
    } catch (error) {
      setCoverUploadError(error instanceof Error ? error.message : 'Upload ảnh thất bại');
    } finally {
      setCoverUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setPublishError('');
    setSaveError('');
    setSaveSuccess('');
    try {
      if (!form.title.trim() || !form.slug.trim()) {
        setSaveError('Tiêu đề và slug không được để trống.');
        return;
      }
      if (!form.categoryId || !form.authorId) {
        setSaveError('Chọn chuyên mục và tác giả trước khi lưu.');
        return;
      }

      const existingId = editingId;
      let savedArticle: BlogArticle;
      if (existingId) {
        savedArticle = await onUpdate(existingId, payload);
      } else {
        savedArticle = await onCreate(payload);
        setSavedPostId(savedArticle.id);
      }
      setForm(postToFormState(savedArticle));
      setSaveSuccess('Đã lưu bài viết.');
      onSaved(savedArticle.id, savedArticle);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (force: boolean) => {
    setSaving(true);
    setPublishError('');
    try {
      let id = editingId;
      if (!id) {
        const created = await onCreate(payload);
        id = created.id;
        setSavedPostId(created.id);
        setForm(postToFormState(created));
      } else {
        const updated = await onUpdate(id, payload);
        setForm(postToFormState(updated));
      }
      await onPublish(id, force);
      onSaved(id);
    } catch (e) {
      const err = e as Error & { data?: { audit?: SeoAuditReport; duplicate?: DuplicateCheckReport } };
      const parts = [err.message || 'Publish thất bại'];
      if (err.data?.duplicate?.blockers?.length) parts.push(...err.data.duplicate.blockers);
      if (err.data?.audit?.errors?.length) parts.push(...err.data.audit.errors);
      setPublishError(parts.join(' · '));
    } finally {
      setSaving(false);
    }
  };

  const runSavedChecks = async () => {
    if (!post?.id) return;
    const [auditResult, dupResult] = await Promise.all([onAudit(post.id), onDuplicateCheck(post.id)]);
    setAudit(auditResult);
    setDuplicate(dupResult);
    setShowPreview(false);
  };

  const runPreviewChecks = async () => {
    const result = await previewBlogChecks(token, {
      ...payload,
      excludePostId: post?.id,
    });
    setAudit(result.audit);
    setDuplicate(result.duplicate);
    setShowPreview(false);
  };

  const loadSuggestions = async () => {
    const data = await onSuggest({
      title: form.title,
      content: form.content,
      primaryKeyword: form.primaryKeyword,
      categorySlug: categories.find(c => c.id === form.categoryId)?.slug,
      excludePostId: post?.id,
    });
    setSuggestions(data);
  };

  const handleParseImport = async () => {
    if (!importMarkdown.trim()) {
      setImportError('Dán Markdown từ AI vào ô trên.');
      return;
    }
    setParsing(true);
    setImportError('');
    try {
      const data = await parsePastedMarkdown(token, importMarkdown);
      if (onTagsRefresh) await onTagsRefresh();
      applyParsedDraft(data);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Parse thất bại');
    } finally {
      setParsing(false);
    }
  };

  const isNewPost = !editingId;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-white">{editingId ? 'Sửa bài viết' : 'Bài viết mới'}</h3>
            <p className="text-xs text-slate-500">Markdown · Preview · SEO checklist</p>
          </div>
          <div className="flex items-center gap-2">
            {post?.status === 'published' && (
              <a href={`/tin-tuc/${post.slug}`} target="_blank" rel="noreferrer" className="text-xs text-invest-blue">
                <ExternalLink className="inline h-3.5 w-3.5" /> Xem public
              </a>
            )}
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-900">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
          <div className="overflow-y-auto border-r border-slate-800 p-5 app-scroll space-y-3">
            {isNewPost && (
              <div className="rounded-xl border border-violet-800/50 bg-violet-950/20">
                <button
                  type="button"
                  onClick={() => setShowImport(v => !v)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-violet-200"
                >
                  <span className="inline-flex items-center gap-2">
                    <ClipboardPaste className="h-4 w-4" /> Import từ Markdown
                  </span>
                  {showImport ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showImport && (
                  <div className="space-y-2 border-t border-violet-800/30 px-4 pb-4 pt-3">
                    <p className="text-[11px] text-slate-500">
                      Dán Markdown AI trả về (title, slug, meta, tags, nội dung) — bấm Parse để tự điền các field bên dưới.
                    </p>
                    {importError && <p className="text-xs text-red-300">{importError}</p>}
                    <textarea
                      value={importMarkdown}
                      onChange={e => setImportMarkdown(e.target.value)}
                      rows={8}
                      placeholder="title: ...&#10;slug: ...&#10;...&#10;&#10;# Tiêu đề bài viết"
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void handleParseImport()}
                      disabled={parsing}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {parsing ? 'Đang parse...' : 'Parse & Fill Editor'}
                    </button>
                  </div>
                )}
              </div>
            )}
            {['title', 'slug', 'excerpt', 'metaTitle', 'metaDescription', 'primaryKeyword'].map(field => (
              <label key={field} className="block text-xs text-slate-400">
                {field}
                <input
                  value={(form as any)[field]}
                  onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
                />
              </label>
            ))}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="text-xs font-semibold text-slate-300">Ảnh cover</div>
              <p className="mt-1 text-[11px] text-slate-500">Upload JPG/PNG/WebP (tự resize) hoặc dán URL ngoài.</p>
              {form.coverImage ? (
                <img
                  src={form.coverImage}
                  alt="Cover preview"
                  className="mt-3 max-h-40 w-full rounded-lg border border-slate-800 object-cover"
                />
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={e => void handleCoverFileChange(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverUploading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  {coverUploading ? 'Đang upload...' : 'Chọn ảnh từ máy'}
                </button>
                {form.coverImage ? (
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, coverImage: '' }))}
                    className="rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-400"
                  >
                    Xóa ảnh
                  </button>
                ) : null}
              </div>
              {coverUploadError ? <p className="mt-2 text-xs text-red-300">{coverUploadError}</p> : null}
              <label className="mt-3 block text-xs text-slate-400">
                URL ảnh (tuỳ chọn)
                <input
                  value={form.coverImage}
                  onChange={e => setForm(prev => ({ ...prev, coverImage: e.target.value }))}
                  placeholder="/blog-covers/... hoặc https://..."
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-slate-400">
                Chuyên mục
                <select
                  value={form.categoryId}
                  onChange={e => setForm(prev => ({ ...prev, categoryId: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-400">
                Trạng thái
                <select
                  value={form.status}
                  onChange={e => {
                    const status = e.target.value as BlogArticle['status'];
                    setForm(prev => ({
                      ...prev,
                      status,
                      publishedAt:
                        (status === 'published' || status === 'archived') && !prev.publishedAt
                          ? toDatetimeLocalValue(new Date().toISOString())
                          : prev.publishedAt,
                    }));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
                >
                  <option value="draft">draft</option>
                  <option value="review">review</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
                </select>
              </label>
              {(form.status === 'published' || form.status === 'archived') && (
                <label className="block text-xs text-slate-400">
                  Ngày xuất bản
                  <input
                    type="datetime-local"
                    value={form.publishedAt}
                    onChange={e => setForm(prev => ({ ...prev, publishedAt: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
                  />
                </label>
              )}
            </div>
            <label className="block text-xs text-slate-400">
              Nội dung
              <div className="mt-1">
                <RichTextEditor
                  value={form.content}
                  onChange={content => setForm(prev => ({ ...prev, content }))}
                  rows={14}
                  minHeightClass="min-h-64"
                  onUploadImage={async file => {
                    const dataUrl = await resizeImageFile(file);
                    const { url } = await uploadContentImage(token, dataUrl, form.slug || editingId);
                    return url;
                  }}
                />
              </div>
            </label>
            <PostFaqEditor faqs={form.faqs} onChange={faqs => setForm(prev => ({ ...prev, faqs }))} />

            {cleanWarnings.length > 0 && (
              <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 text-xs text-amber-200">
                Đã tự động làm sạch một số nội dung AI không phù hợp.
                <ul className="mt-1 list-disc pl-4 text-amber-300/80">
                  {cleanWarnings.map(w => <li key={w}>{w}</li>)}
                </ul>
              </div>
            )}

            {form.relatedSuggestions.length > 0 && (
              <div className="rounded-xl border border-slate-800 p-3 text-xs text-slate-400">
                <div className="font-semibold text-slate-300">Gợi ý chủ đề liên quan (từ AI)</div>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {form.relatedSuggestions.map(s => <li key={s}>{s}</li>)}
                </ul>
              </div>
            )}

            <div className="rounded-xl border border-slate-800 p-3">
              <div className="text-xs font-semibold text-slate-300">Bài viết liên quan (chọn 3–6)</div>
              {relatedCandidates.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">Chưa có bài phù hợp — có thể tạo bài mới sau.</p>
              ) : (
                <div className="mt-2 space-y-1">
                  {relatedCandidates.map(item => (
                    <label key={item.id} className="flex items-start gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={form.relatedPostIds.includes(item.id)}
                        onChange={e =>
                          setForm(prev => ({
                            ...prev,
                            relatedPostIds: e.target.checked
                              ? [...prev.relatedPostIds, item.id].slice(0, 6)
                              : prev.relatedPostIds.filter(id => id !== item.id),
                          }))
                        }
                      />
                      <span>{item.title} <span className="text-slate-500">({item.categoryName || '—'})</span></span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <label key={tag.id} className="inline-flex items-center gap-1 rounded-full border border-slate-800 px-2 py-1 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.tagIds.includes(tag.id)}
                    onChange={e =>
                      setForm(prev => ({
                        ...prev,
                        tagIds: e.target.checked ? [...prev.tagIds, tag.id] : prev.tagIds.filter(id => id !== tag.id),
                      }))
                    }
                  />
                  {tag.name}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col overflow-hidden">
            <div className="flex border-b border-slate-800">
              <button type="button" onClick={() => setShowPreview(true)} className={`px-4 py-2 text-xs ${showPreview ? 'text-white' : 'text-slate-500'}`}>
                Preview
              </button>
              <button type="button" onClick={() => setShowPreview(false)} className={`flex items-center gap-1 px-4 py-2 text-xs ${!showPreview ? 'text-white' : 'text-slate-500'}`}>
                <Sparkles className="h-3 w-3" /> SEO Checklist
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 app-scroll">
              {showPreview ? (
                <div className="space-y-6 text-slate-200">
                  <div className="grid gap-6 lg:grid-cols-[180px_1fr]">
                    <ArticleTableOfContents
                      content={form.content}
                      mobileCollapsible={false}
                      stickyCta={
                        <div className="hidden rounded-lg border border-violet-800/40 bg-violet-950/30 p-3 text-xs lg:block">
                          <div className="font-bold text-violet-200">{cta.title}</div>
                          <p className="mt-1 text-slate-400">{cta.description}</p>
                          <div className="mt-2 font-semibold text-emerald-300">{cta.buttonText}</div>
                        </div>
                      }
                    />
                    <div>
                      <h2 className="text-xl font-bold text-white">{form.title || 'Tiêu đề'}</h2>
                      {form.content && <BlogArticleBody content={form.content} />}
                    </div>
                  </div>
                  {form.faqs.some(f => f.question.trim() && f.answer.trim()) && (
                    <FaqSection faqs={form.faqs.filter(f => f.question.trim() && f.answer.trim())} />
                  )}
                  <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4">
                    <h3 className="font-bold text-emerald-200">{cta.title}</h3>
                    <p className="mt-2 text-sm text-slate-300">{cta.description}</p>
                    <div className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white">{cta.buttonText}</div>
                  </div>
                  {selectedRelated.length > 0 ? (
                    <div>
                      <h3 className="font-bold text-white">Đọc tiếp</h3>
                      <ul className="mt-2 space-y-1 text-sm text-slate-300">
                        {selectedRelated.map(r => <li key={r.id}>• {r.title}</li>)}
                      </ul>
                    </div>
                  ) : form.relatedSuggestions.length > 0 ? (
                    <p className="text-xs text-slate-500">Chưa chọn bài liên quan — xem gợi ý AI bên trái.</p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <button type="button" onClick={loadSuggestions} className="text-xs text-invest-blue">Gợi ý category/tag/link</button>
                  {suggestions && (
                    <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-300">{JSON.stringify(suggestions, null, 2)}</pre>
                  )}
                  <button type="button" onClick={() => void (post?.id ? runSavedChecks() : runPreviewChecks())} className="inline-flex items-center gap-1 text-xs text-amber-300">
                    <FileSearch className="h-3.5 w-3.5" /> Chạy SEO audit + duplicate check
                  </button>
                  {duplicate && !duplicate.passed && (
                    <div className="rounded-lg border border-red-700 bg-red-950/30 p-3 text-sm font-semibold text-red-300">
                      {DUPLICATE_WARNING}
                    </div>
                  )}
                  {audit && (
                    <div className={`rounded-lg border p-3 ${audit.passed ? 'border-emerald-800' : 'border-red-800'}`}>
                      <div className="font-bold text-white">SEO Score: {audit.score}</div>
                      <ul className="mt-2 space-y-1 text-xs text-slate-300">
                        {audit.checks.map(c => (
                          <li key={c.id} className={c.passed ? 'text-emerald-400' : 'text-red-400'}>{c.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {duplicate && (
                    <div className={`rounded-lg border p-3 ${duplicate.passed ? 'border-emerald-800' : 'border-red-800'}`}>
                      <div className="font-bold text-white">Duplicate: {duplicate.passed ? 'PASS' : 'FAIL'}</div>
                      {duplicate.blockers.map(b => (
                        <p key={b} className="text-xs text-red-300">{b}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 px-5 py-4">
          {saveError && (
            <p className="w-full text-sm text-red-300">{saveError}</p>
          )}
          {saveSuccess && (
            <p className="w-full text-sm text-emerald-300">{saveSuccess}</p>
          )}
          {publishError && (
            <p className="w-full text-sm text-red-300">{publishError}</p>
          )}
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-bold text-slate-900">
            {saving ? 'Đang lưu...' : editingId ? 'Lưu bài' : 'Lưu draft'}
          </button>
          <button
            type="button"
            onClick={() => void handlePublish(false)}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Publish
          </button>
          <button
            type="button"
            onClick={() => void handlePublish(true)}
            disabled={saving}
            className="rounded-lg border border-red-700 px-4 py-2 text-sm text-red-300 disabled:opacity-50"
          >
            Force publish
          </button>
          <p className="ml-auto text-[11px] text-slate-500">
            CTA public tự sinh theo bài — không cần ghi trong markdown.
          </p>
        </div>
      </div>
    </div>
  );
}
