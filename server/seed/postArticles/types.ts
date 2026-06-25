export interface PostArticleContent {
  metaTitle: string;
  metaDescription: string;
  intro: string;
  sections: { heading: string; paragraphs: string[] }[];
  faqs: { question: string; answer: string }[];
  cta: string;
}
