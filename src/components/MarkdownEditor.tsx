import { useRef, useState } from 'react';
import { Bold, Eye, Heading2, Italic, List, Pencil, Quote } from 'lucide-react';
import MarkdownContent from './MarkdownContent';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
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
  { label: '🎯 Cơ hội', value: '🎯 ' }
];

export default function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const [preview, setPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertSnippet = (before: string, after = '', placeholder = '') => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(`${value}${before}${placeholder}${after}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    const nextValue = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + before.length + selected.length + after.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const insertLine = (snippet: string, placeholder = '') => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(`${value}${value && !value.endsWith('\n') ? '\n' : ''}${snippet}${placeholder}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
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

      {preview ? (
        <MarkdownContent content={value || '*Chưa có nội dung để xem trước.*'} className="min-h-48 p-4 text-sm text-slate-200" />
      ) : (
        <textarea
          ref={textareaRef}
          rows={10}
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={'## Bất động sản nổi bật\n\n📍 **Vị trí:** ...\n\n✨ **Điểm nổi bật:**\n- ...\n- ...\n\n📞 **Liên hệ:** ...'}
          className="min-h-48 w-full resize-y bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 outline-none placeholder:text-slate-600"
        />
      )}
    </div>
  );
}
