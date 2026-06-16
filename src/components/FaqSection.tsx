interface FaqSectionProps {
  faqs: { question: string; answer: string }[];
  title?: string;
}

export default function FaqSection({ faqs, title = 'Câu hỏi thường gặp' }: FaqSectionProps) {
  if (!faqs.length) return null;

  return (
    <section className="mt-12" aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="heading-section">
        {title}
      </h2>
      <div className="mt-6 space-y-3">
        {faqs.map(faq => (
          <details
            key={faq.question}
            className="group invest-card open:border-invest-blue/30"
          >
            <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-slate-900 marker:content-none [&::-webkit-details-marker]:hidden">
              {faq.question}
            </summary>
            <div className="border-t border-slate-100 px-4 py-3 text-sm leading-7 text-slate-600">
              {faq.answer}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
