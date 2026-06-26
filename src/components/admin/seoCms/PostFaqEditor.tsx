import { Plus, Trash2 } from 'lucide-react';

interface PostFaqEditorProps {
  faqs: { question: string; answer: string }[];
  onChange: (faqs: { question: string; answer: string }[]) => void;
}

export default function PostFaqEditor({ faqs, onChange }: PostFaqEditorProps) {
  const update = (index: number, field: 'question' | 'answer', value: string) => {
    onChange(faqs.map((faq, i) => (i === index ? { ...faq, [field]: value } : faq)));
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">FAQ</h4>
        <button
          type="button"
          onClick={() => onChange([...faqs, { question: '', answer: '' }])}
          className="inline-flex items-center gap-1 text-xs text-emerald-400"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm câu hỏi
        </button>
      </div>
      {faqs.map((faq, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-slate-800 p-3">
          <div className="flex items-start gap-2">
            <label className="flex-1 text-xs text-slate-400">
              Câu hỏi
              <input
                value={faq.question}
                onChange={e => update(index, 'question', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <button
              type="button"
              onClick={() => onChange(faqs.filter((_, i) => i !== index))}
              className="mt-5 rounded p-1 text-slate-500 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <label className="block text-xs text-slate-400">
            Trả lời
            <textarea
              value={faq.answer}
              onChange={e => update(index, 'answer', e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
      ))}
    </div>
  );
}
