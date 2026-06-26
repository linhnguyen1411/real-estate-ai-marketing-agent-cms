import { useState } from 'react';
import { ClipboardPaste, Copy, Sparkles, X } from 'lucide-react';
import { parsePastedMarkdown } from '../../../services/blogApi';
import { CTA_OPTIONS, ARTICLE_TYPE_OPTIONS } from './seoCmsConstants';
import { buildSeoContentPrompt } from './seoPromptBuilder';
import type { PostCta } from '../../../seo/buildPostCta';

export interface AiGeneratedDraft {
  title: string;
  slug: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  coverImage?: string | null;
  targetIntent?: string;
  categoryId?: string | null;
  categorySlug?: string;
  tagNames?: string[];
  tagIds?: string[];
  markdown: string;
  faqs?: { question: string; answer: string }[];
  relatedSuggestions?: string[];
  relatedPostIds?: string[];
  suggestedRelated?: { id: string; slug: string; title: string; categoryName: string; score: number }[];
  cta?: PostCta;
  cleanWarnings?: string[];
  audit?: import('../../../types').SeoAuditReport;
  duplicate?: import('../../../types').DuplicateCheckReport;
}

interface AiCreateModalProps {
  token: string;
  onClose: () => void;
  onGenerated: (draft: AiGeneratedDraft) => void;
  onToast: (message: string) => void;
}

export default function AiCreateModal({ token, onClose, onGenerated, onToast }: AiCreateModalProps) {
  const [form, setForm] = useState({
    keyword: '',
    articleType: 'review-project',
    cta: CTA_OPTIONS[2],
  });
  const [step, setStep] = useState<'form' | 'paste'>('form');
  const [pasteMarkdown, setPasteMarkdown] = useState('');
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);

  const handleCopyPrompt = async () => {
    if (!form.keyword.trim()) {
      setError('Nhập từ khóa & điểm nổi bật trước.');
      return;
    }
    setError('');
    const prompt = buildSeoContentPrompt(form);
    try {
      await navigator.clipboard.writeText(prompt);
      onToast('Đã copy prompt. Dán vào ChatGPT, Gemini hoặc Claude.');
    } catch {
      setError('Không copy được — hãy copy thủ công từ ô bên dưới.');
    }
  };

  const handleParse = async () => {
    if (!pasteMarkdown.trim()) {
      setError('Dán Markdown từ AI vào ô trên.');
      return;
    }
    setParsing(true);
    setError('');
    try {
      const data = await parsePastedMarkdown(token, pasteMarkdown);
      onGenerated({
        title: data.title,
        slug: data.slug,
        excerpt: data.excerpt,
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        primaryKeyword: data.primaryKeyword,
        coverImage: data.coverImage,
        tagNames: data.tagNames,
        tagIds: data.tagIds,
        markdown: data.markdown,
        faqs: data.faqs,
        relatedSuggestions: data.relatedSuggestions,
        suggestedRelated: data.suggestedRelated,
        cta: data.cta,
        cleanWarnings: data.cleanWarnings,
        targetIntent: data.cta?.leadIntent,
        audit: data.audit,
        duplicate: data.duplicate,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Parse thất bại');
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" />
            <h3 className="font-bold text-white">
              {step === 'form' ? 'Tạo bằng AI' : 'Tạo Draft từ Markdown'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === 'form' ? (
          <>
            <div className="space-y-4 overflow-y-auto p-5">
              {error && <p className="text-sm text-red-300">{error}</p>}
              <label className="block text-xs text-slate-400">
                Từ khóa &amp; điểm nổi bật *
                <textarea
                  value={form.keyword}
                  onChange={e => setForm(prev => ({ ...prev, keyword: e.target.value }))}
                  rows={4}
                  placeholder={'Sun Symphony, Sông Hàn, Pháo hoa,\nMiễn lãi gốc 30 tháng,\nThanh toán từ 25%'}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Loại bài
                <select
                  value={form.articleType}
                  onChange={e => setForm(prev => ({ ...prev, articleType: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
                >
                  {ARTICLE_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-400">
                CTA cuối bài
                <select
                  value={form.cta}
                  onChange={e => setForm(prev => ({ ...prev, cta: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
                >
                  {CTA_OPTIONS.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-slate-800 px-5 py-4">
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => void handleCopyPrompt()}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-700 bg-violet-950/50 px-4 py-2 text-sm font-semibold text-violet-200"
              >
                <Copy className="h-4 w-4" /> Lấy Prompt
              </button>
              <button
                type="button"
                onClick={() => { setStep('paste'); setError(''); }}
                className="ml-auto inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white"
              >
                <ClipboardPaste className="h-4 w-4" /> Tạo Draft từ Markdown
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {error && <p className="text-sm text-red-300">{error}</p>}
              <p className="text-xs text-slate-500">Dán Markdown từ AI (meta + nội dung + FAQ).</p>
              <textarea
                value={pasteMarkdown}
                onChange={e => setPasteMarkdown(e.target.value)}
                rows={18}
                placeholder="title: ...&#10;relatedSuggestions:&#10;* ...&#10;&#10;# Tiêu đề"
                className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 font-mono text-xs text-white"
              />
            </div>
            <div className="flex gap-2 border-t border-slate-800 px-5 py-4">
              <button type="button" onClick={() => setStep('form')} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">
                ← Quay lại
              </button>
              <button
                type="button"
                onClick={() => void handleParse()}
                disabled={parsing}
                className="ml-auto rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {parsing ? 'Đang parse...' : 'Parse & Fill Editor'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
