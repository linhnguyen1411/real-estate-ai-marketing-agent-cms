import { useRef, useState } from 'react';
import { Bold, Eye, Heading2, ImagePlus, Italic, List, Pencil, Quote } from 'lucide-react';
import MarkdownContent from '../MarkdownContent';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  minHeightClass?: string;
  /** Upload ảnh và trả về URL public (vd. /content-images/...). Nếu không truyền, nút chèn ảnh ẩn. */
  onUploadImage?: (file: File) => Promise<string>;
}

const iconSnippets = [
  { label: '📍 Vị trí', value: '📍 **Vị trí:** ' },
  { label: '💰 Giá', value: '💰 **Giá bán:** ' },
  { label: '📐 Diện tích', value: '📐 **Diện tích:** ' },
  { label: '📕 Pháp lý', value: '📕 **Pháp lý:** ' },
  { label: '✨ Điểm nổi bật', value: '✨ **Điểm nổi bật:** ' },
  { label: '📞 Liên hệ', value: '📞 **Liên hệ:** ' },
  { label: '✅ Tick', value: '✅ ' },
  { label: '👉 Chỉ phải', value: '👉 ' },
  { label: '🔥 Nổi bật', value: '🔥 ' },
  { label: '🏠 Nhà đất', value: '🏠 ' },
  { label: '🚗 Đường/Xe', value: '🚗 ' },
  { label: '🌳 Tiện ích', value: '🌳 ' },
  { label: '📣 Kêu gọi', value: '📣 ' },
  { label: '⚡ Bán nhanh', value: '⚡ ' },
  { label: '🎯 Cơ hội', value: '🎯 ' },
];

export default function RichTextEditor({
  value,
  onChange,
  rows = 10,
  placeholder = '## Tiêu đề\n\nNội dung markdown...',
  minHeightClass = 'min-h-48',
  onUploadImage,
}: RichTextEditorProps) {
  const [preview, setPreview] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const insertSnippet = (before: string, after = '', placeholderText = '') => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(`${value}${before}${placeholderText}${after}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || placeholderText;
    const nextValue = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + before.length + selected.length + after.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const insertLine = (snippet: string, placeholderText = '') => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(`${value}${value && !value.endsWith('\n') ? '\n' : ''}${snippet}${placeholderText}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || placeholderText;
    const prefix = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
    const suffix = end < value.length && value[end] !== '\n' ? '\n' : '';
    const nextValue = `${value.slice(0, start)}${prefix}${snippet}${selected}${suffix}${value.slice(end)}`;
    onChange(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + prefix.length + snippet.length + selected.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const insertBlock = (block: string) => {
    const textarea = textareaRef.current;
    const trimmed = block.trimEnd();
    if (!textarea) {
      const spacer = value.length > 0 && !value.endsWith('\n') ? '\n\n' : '';
      onChange(`${value}${spacer}${trimmed}\n`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const needsLeadingBreak = start > 0 && !value.slice(0, start).endsWith('\n\n') && value[start - 1] !== '\n';
    const leading = start === 0 ? '' : needsLeadingBreak ? (value[start - 1] === '\n' ? '\n' : '\n\n') : '';
    const trailing = end < value.length && value[end] !== '\n' ? '\n' : '';
    const nextValue = `${value.slice(0, start)}${leading}${trimmed}${trailing}${value.slice(end)}`;
    onChange(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + leading.length + trimmed.length + trailing.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const insertImageMarkdown = (url: string, alt = 'Ảnh minh họa') => {
    insertBlock(`![${alt}](${url})`);
  };

  const handleImageFile = async (file: File | null) => {
    if (!file || !onUploadImage) return;
    setImageError('');
    setImageUploading(true);
    try {
      const url = await onUploadImage(file);
      insertImageMarkdown(url);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Upload ảnh thất bại');
    } finally {
      setImageUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onUploadImage || imageUploading) return;
    const file = Array.from(event.clipboardData.files).find(item => item.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    await handleImageFile(file);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 bg-slate-900/70 p-2">
        <button type="button" onClick={() => insertLine('## ', 'Tiêu đề')} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" title="Tiêu đề">
          <Heading2 className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => insertSnippet('**', '**', 'nội dung đậm')} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" title="In đậm">
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => insertSnippet('*', '*', 'nội dung nghiêng')} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" title="In nghiêng">
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => insertLine('- ', 'Nội dung')} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" title="Danh sách">
          <List className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => insertLine('> ', 'Trích dẫn')} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" title="Trích dẫn">
          <Quote className="h-4 w-4" />
        </button>
        {onUploadImage ? (
          <>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={e => void handleImageFile(e.target.files?.[0] || null)}
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={imageUploading}
              className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              title="Chèn ảnh"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
          </>
        ) : null}
        <div className="mx-1 h-5 w-px bg-slate-700" />
        {iconSnippets.map(snippet => (
          <button
            key={snippet.label}
            type="button"
            onClick={() => insertLine(snippet.value)}
            className="rounded-lg border border-slate-800 px-2 py-1.5 text-2xs font-semibold text-slate-300 hover:border-rose-500/40 hover:text-rose-300"
          >
            {snippet.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPreview(current => !current)}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-2xs font-bold text-white hover:bg-rose-500"
        >
          {preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {preview ? 'Soạn thảo' : 'Xem trước'}
        </button>
      </div>

      {imageError ? <p className="border-b border-slate-800 bg-red-950/30 px-3 py-2 text-xs text-red-300">{imageError}</p> : null}
      {imageUploading ? (
        <p className="border-b border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-400">Đang upload ảnh...</p>
      ) : null}

      {preview ? (
        <MarkdownContent content={value || '*Chưa có nội dung để xem trước.*'} className={`${minHeightClass} p-4 text-sm text-slate-200`} />
      ) : (
        <textarea
          ref={textareaRef}
          rows={rows}
          value={value}
          onChange={event => onChange(event.target.value)}
          onPaste={onUploadImage ? e => void handlePaste(e) : undefined}
          placeholder={placeholder}
          className={`${minHeightClass} w-full resize-y bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 outline-none placeholder:text-slate-600`}
        />
      )}
    </div>
  );
}
