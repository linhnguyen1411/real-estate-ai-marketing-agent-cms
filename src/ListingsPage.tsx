import React, { FormEvent, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Bot,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Facebook,
  Home,
  Mail,
  MapPin,
  Maximize2,
  Menu,
  MessageCircle,
  Phone,
  Search,
  Send,
  Sparkles,
  X
} from 'lucide-react';
import { Property } from './types';
import MarkdownContent from './components/MarkdownContent';

interface ListingsPageProps {
  properties: Property[];
  propertySlug?: string;
}

interface PublicChatMessage {
  role: 'user' | 'model';
  content: string;
}

interface PublicChatGuestProfile {
  name: string;
  phone: string;
}

const PUBLIC_CHAT_SESSION_KEY = 'real_estate_public_chat_session';
const PUBLIC_CHAT_GUEST_KEY = 'real_estate_public_chat_guest';
const zaloUrl = 'https://zalo.me/0905777594';
const facebookUrl = 'https://www.facebook.com/estoria.dn';
const phoneNumber = '0905 777 594';
const heroImageUrl = 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=2200&q=90';
const publicListingsPath = '/';

function formatPrice(price: number) {
  return `${price.toLocaleString('vi-VN')} tỷ`;
}

function getImage(property?: Property) {
  if (!property) {
    return 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=85';
  }

  return property.gallery_images?.[0] || property.images || 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=85';
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function getPropertySlug(property: Property) {
  return `${slugify(property.title)}-${property.id}`;
}

function getPropertyPath(property: Property) {
  return `/${encodeURIComponent(getPropertySlug(property))}`;
}

function toPlainText(value: string) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value: string, maxLength = 155) {
  const cleanValue = toPlainText(value);
  return cleanValue.length > maxLength
    ? `${cleanValue.slice(0, maxLength - 3).trim()}...`
    : cleanValue;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {
      status: 'error',
      message: response.ok ? 'Phản hồi server không đúng định dạng JSON.' : `Server trả lỗi ${response.status}.`
    };
  }
}

interface PropertyCardProps {
  property: Property;
  onSelect: (property: Property) => void;
  large?: boolean;
}

const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  onSelect,
  large = false
}) => {
  return (
    <a
      href={getPropertyPath(property)}
      onClick={event => {
        event.preventDefault();
        onSelect(property);
      }}
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-left transition-all hover:border-slate-300 hover:shadow-xl"
      aria-label={`Xem chi tiết ${property.title} tại ${property.location}`}
    >
      <div className={`relative shrink-0 overflow-hidden bg-slate-100 ${large ? 'aspect-square' : 'aspect-[4/3]'}`}>
        <img
          src={getImage(property)}
          alt={property.title}
          loading="lazy"
          decoding="async"
          className="block h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute left-3 top-3 rounded-md bg-white/95 px-2.5 py-1 text-xs font-bold text-slate-900 shadow-sm">
          {property.type}
        </div>
        <div className="absolute right-3 top-3 rounded-md bg-rose-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
          {formatPrice(property.price)}
        </div>
      </div>

      <div className="flex flex-1 flex-col space-y-3 p-4">
        <div>
          <h3 className="line-clamp-2 text-base font-bold text-slate-950">{property.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <MapPin className="h-4 w-4 text-rose-600" />
            {property.location}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md bg-slate-50 p-2">
            <Maximize2 className="mb-1 h-3.5 w-3.5 text-slate-400" />
            <div className="font-bold text-slate-900">{property.area} m2</div>
          </div>
          <div className="rounded-md bg-slate-50 p-2">
            <Compass className="mb-1 h-3.5 w-3.5 text-slate-400" />
            <div className="font-bold text-slate-900">{property.direction}</div>
          </div>
          <div className="rounded-md bg-slate-50 p-2">
            <Building2 className="mb-1 h-3.5 w-3.5 text-slate-400" />
            <div className="truncate font-bold text-slate-900">{property.legal_status}</div>
          </div>
        </div>

        <MarkdownContent
          content={property.rich_description || property.description}
          compact
          className="line-clamp-2 text-sm leading-6 text-slate-600"
        />

        <div className="flex flex-wrap gap-1.5">
          {(property.selling_points || []).slice(0, 3).map(point => (
            <span key={point} className="rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
              {point}
            </span>
          ))}
        </div>
      </div>
    </a>
  );
};

export default function ListingsPage({ properties, propertySlug }: ListingsPageProps) {
  const chatEndRef = React.useRef<HTMLDivElement | null>(null);
  const [chatSessionId] = useState(() => {
    const existing = localStorage.getItem(PUBLIC_CHAT_SESSION_KEY);
    if (existing) return existing;
    const created = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(PUBLIC_CHAT_SESSION_KEY, created);
    return created;
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [guestProfile, setGuestProfile] = useState<PublicChatGuestProfile | null>(() => {
    try {
      const saved = localStorage.getItem(PUBLIC_CHAT_GUEST_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [guestName, setGuestName] = useState(() => guestProfile?.name || '');
  const [guestPhone, setGuestPhone] = useState(() => guestProfile?.phone || '');
  const [guestError, setGuestError] = useState('');
  const [chatMessages, setChatMessages] = useState<PublicChatMessage[]>([
    {
      role: 'model',
      content: 'Chào anh/chị, em là Lily AI tư vấn BĐS. Anh/chị đang tìm đất nền, nhà phố hay căn hộ?'
    }
  ]);
  const [contactStatus, setContactStatus] = useState('');

  React.useEffect(() => {
    if (!guestProfile) return;
    fetch(`/api/public/chat/history?sessionId=${encodeURIComponent(chatSessionId)}`)
      .then(response => response.json())
      .then(json => {
        if (Array.isArray(json.data) && json.data.length > 0) {
          setChatMessages(json.data.map((item: { role: 'user' | 'model'; message: string }) => ({
            role: item.role,
            content: item.message
          })));
        }
      })
      .catch(error => console.error('Không thể tải lịch sử chat public:', error));
  }, [chatSessionId, guestProfile]);

  React.useEffect(() => {
    if (!guestProfile) return;
    const timer = window.setInterval(() => {
      fetch(`/api/public/chat/history?sessionId=${encodeURIComponent(chatSessionId)}`)
        .then(response => response.json())
        .then(json => {
          if (Array.isArray(json.data)) {
            setChatMessages(json.data.map((item: { role: 'user' | 'model'; message: string }) => ({
              role: item.role,
              content: item.message
            })));
          }
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [chatSessionId, guestProfile]);

  React.useEffect(() => {
    if (!chatOpen) return;
    const timer = window.setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ block: 'end' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [chatMessages, chatLoading, chatOpen]);

  const activeProperties = useMemo(
    () => properties.filter(property => !['sold', 'hidden'].includes(property.sale_status || 'available')),
    [properties]
  );

  React.useEffect(() => {
    const syncPropertyFromUrl = () => {
      const propertyId = new URLSearchParams(window.location.search).get('property');
      const normalizedSlug = decodeURIComponent(propertySlug || '').toLowerCase();
      if (!propertyId && !normalizedSlug) {
        setSelectedProperty(null);
        return;
      }
      const property = activeProperties.find(item =>
        item.id === propertyId || getPropertySlug(item).toLowerCase() === normalizedSlug
      );
      if (property) {
        setSelectedProperty(property);
        setGalleryIndex(0);
      }
    };

    syncPropertyFromUrl();
    window.addEventListener('popstate', syncPropertyFromUrl);
    return () => window.removeEventListener('popstate', syncPropertyFromUrl);
  }, [activeProperties, propertySlug]);

  const featuredProperties = useMemo(
    () => activeProperties.slice().sort((a, b) => b.price - a.price).slice(0, 3),
    [activeProperties]
  );

  const filteredProperties = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return activeProperties.filter(property => {
      const matchesQuery = !normalizedQuery
        || property.title.toLowerCase().includes(normalizedQuery)
        || property.location.toLowerCase().includes(normalizedQuery)
        || property.description.toLowerCase().includes(normalizedQuery)
        || (property.rich_description || '').toLowerCase().includes(normalizedQuery);
      const matchesType = selectedType === 'all' || property.type === selectedType;
      return matchesQuery && matchesType;
    });
  }, [activeProperties, searchQuery, selectedType]);

  const projectGroups = useMemo(() => {
    const groups = new Map<string, Property[]>();
    activeProperties.forEach(property => {
      const key = property.location.split(',')[0].trim() || property.type;
      groups.set(key, [...(groups.get(key) || []), property]);
    });
    return Array.from(groups.entries()).slice(0, 4);
  }, [activeProperties]);

  const propertyTypes = Array.from(new Set(activeProperties.map(property => property.type)));
  const siteOrigin = window.location.origin;
  const canonicalUrl = selectedProperty
    ? `${siteOrigin}${getPropertyPath(selectedProperty)}`
    : siteOrigin;
  const seoTitle = selectedProperty
    ? selectedProperty.ai_posts?.seo?.title || `${selectedProperty.title} tại ${selectedProperty.location} | Estoria`
    : 'Bất động sản Đà Nẵng đang bán, pháp lý rõ ràng | Estoria';
  const seoDescription = selectedProperty
    ? selectedProperty.ai_posts?.seo?.meta_description || truncateText(
        `${selectedProperty.title} tại ${selectedProperty.location}, diện tích ${selectedProperty.area} m2, giá ${formatPrice(selectedProperty.price)}, pháp lý ${selectedProperty.legal_status}. ${selectedProperty.rich_description || selectedProperty.description}`
      )
    : `Khám phá ${activeProperties.length} bất động sản Đà Nẵng đang bán: căn hộ, nhà phố, đất và shophouse có thông tin giá, diện tích, pháp lý rõ ràng.`;
  const seoImage = selectedProperty ? getImage(selectedProperty) : getImage(featuredProperties[0]);

  const structuredData = useMemo(() => {
    const itemList = activeProperties.slice(0, 50).map((property, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: property.title,
      url: `${siteOrigin}${getPropertyPath(property)}`
    }));
    const schemas: Record<string, unknown>[] = [
      {
        '@context': 'https://schema.org',
        '@type': 'RealEstateAgent',
        name: 'Estoria',
        url: siteOrigin,
        telephone: '+84905777594',
        areaServed: { '@type': 'City', name: 'Đà Nẵng' },
        sameAs: [zaloUrl, facebookUrl]
      },
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Danh sách bất động sản Đà Nẵng đang bán',
        description: seoDescription,
        url: siteOrigin,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: activeProperties.length,
          itemListElement: itemList
        }
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Làm sao để xem chi tiết và đặt lịch xem bất động sản?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Chọn một sản phẩm trong danh sách để xem giá, diện tích, pháp lý và hình ảnh. Sau đó liên hệ Estoria qua điện thoại, Zalo hoặc Messenger để đặt lịch xem thực tế.'
            }
          },
          {
            '@type': 'Question',
            name: 'Estoria có hỗ trợ lọc bất động sản theo ngân sách không?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Có. Khách hàng có thể gửi khoảng ngân sách, khu vực và loại hình mong muốn để được lọc danh sách BĐS phù hợp.'
            }
          }
        ]
      }
    ];

    if (selectedProperty) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: selectedProperty.title,
        image: selectedProperty.gallery_images?.length ? selectedProperty.gallery_images : [getImage(selectedProperty)],
        description: seoDescription,
        category: selectedProperty.type,
        url: canonicalUrl,
        offers: {
          '@type': 'Offer',
          url: canonicalUrl,
          priceCurrency: 'VND',
          price: Math.round(selectedProperty.price * 1_000_000_000),
          availability: 'https://schema.org/InStock'
        },
        additionalProperty: [
          { '@type': 'PropertyValue', name: 'Vị trí', value: selectedProperty.location },
          { '@type': 'PropertyValue', name: 'Diện tích', value: `${selectedProperty.area} m2` },
          { '@type': 'PropertyValue', name: 'Pháp lý', value: selectedProperty.legal_status }
        ]
      });
    }

    return schemas;
  }, [activeProperties, canonicalUrl, selectedProperty, seoDescription, siteOrigin]);

  const handleContactSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('name') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    const budget = String(formData.get('budget') || '').trim();
    const area = String(formData.get('area') || '').trim();
    const note = String(formData.get('note') || '').trim();

    if (!name || !phone) {
      setContactStatus('Vui lòng nhập tên và số điện thoại.');
      return;
    }

    try {
      const response = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, budget, area, note })
      });
      const json = await readJsonResponse(response);
      if (!json.data) json.message = '';
      if (!response.ok) {
        throw new Error(json.message || 'Không thể gửi thông tin liên hệ.');
      }
      setContactStatus('Đã nhận thông tin. Tư vấn viên sẽ liên hệ lại ngay.');
      form.reset();
    } catch (error) {
      setContactStatus(error instanceof Error ? error.message : 'Không thể gửi thông tin liên hệ. Anh/chị vui lòng gọi hotline hoặc Zalo.');
    }
  };

  const handleGuestSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const name = guestName.trim();
    const phone = guestPhone.trim();
    if (!name || !phone) {
      setGuestError('Vui lòng nhập họ tên và số điện thoại để bắt đầu chat.');
      return;
    }

    try {
      const response = await fetch('/api/public/chat/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: chatSessionId, name, phone })
      });
      const json = await readJsonResponse(response);
      if (!response.ok) throw new Error(json.message || 'Không thể bắt đầu chat.');
      const profile = { name, phone };
      localStorage.setItem(PUBLIC_CHAT_GUEST_KEY, JSON.stringify(profile));
      setGuestProfile(profile);
      setGuestError('');
    } catch (error) {
      setGuestError(error instanceof Error ? error.message : 'Không thể bắt đầu chat.');
    }
  };

  const handleChatSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!guestProfile) {
      setGuestError('Vui lòng nhập họ tên và số điện thoại để bắt đầu chat.');
      return;
    }
    const message = chatInput.trim();
    if (!message || chatLoading) return;

    setChatMessages(prev => [...prev, { role: 'user', content: message }]);
    setChatInput('');
    setChatLoading(true);

    try {
      const response = await fetch('/api/public/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId: chatSessionId })
      });
      const json = await readJsonResponse(response);
      if (json.aiPaused) {
        return;
      }
      const answer = json.data || json.message || 'Em chưa trả lời được câu này, anh/chị để lại số điện thoại để tư vấn viên hỗ trợ.';
      if (answer) {
        setChatMessages(prev => [...prev, { role: 'model', content: answer }]);
      }
    } catch (error) {
      setChatMessages(prev => [...prev, {
        role: 'model',
        content: 'Kết nối AI đang bận. Anh/chị có thể bấm Zalo/Facebook để được tư vấn ngay.'
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const openProperty = (property: Property) => {
    setSelectedProperty(property);
    setGalleryIndex(0);
    window.history.pushState({}, '', getPropertyPath(property));
  };

  const closeProperty = () => {
    setSelectedProperty(null);
    window.history.pushState({}, '', publicListingsPath);
  };

  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden bg-slate-50 text-slate-950 app-scroll">
      <Helmet>
        <html lang="vi" />
        <title>{seoTitle}</title>
        <meta name="description" content={seoDescription} />
        {selectedProperty?.ai_posts?.seo?.keywords?.length && (
          <meta name="keywords" content={selectedProperty.ai_posts.seo.keywords.join(', ')} />
        )}
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:locale" content="vi_VN" />
        <meta property="og:type" content={selectedProperty ? 'product' : 'website'} />
        <meta property="og:site_name" content="Estoria" />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={seoImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoTitle} />
        <meta name="twitter:description" content={seoDescription} />
        <meta name="twitter:image" content={seoImage} />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>

      <header className="sticky top-0 z-40 border-b border-white/20 bg-slate-950/90 text-white backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <a href="#top" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-600">
              <Home className="h-5 w-5" />
            </span>
            <span className="text-sm font-extrabold tracking-wide">Estoria</span>
          </a>

          <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-300 md:flex">
            <a href="#featured" className="hover:text-white">BĐS nổi bật</a>
            <a href="#projects" className="hover:text-white">Dự án</a>
            <a href="#listings" className="hover:text-white">BĐS đang bán</a>
            <a href="#contact" className="hover:text-white">Liên hệ</a>
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <a href={`tel:${phoneNumber}`} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-950">
              Gọi tư vấn
            </a>
            <a href={zaloUrl} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">
              Zalo
            </a>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg border border-slate-700 p-2 md:hidden"
            aria-label="Mở menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-slate-800 px-4 py-3 md:hidden">
            <div className="grid gap-3 text-sm font-semibold text-slate-300">
              <a href="#featured" onClick={() => setMobileMenuOpen(false)}>BĐS nổi bật</a>
              <a href="#projects" onClick={() => setMobileMenuOpen(false)}>Dự án</a>
              <a href="#listings" onClick={() => setMobileMenuOpen(false)}>BĐS đang bán</a>
              <a href="#contact" onClick={() => setMobileMenuOpen(false)}>Liên hệ</a>
            </div>
          </div>
        )}
      </header>

      <main id="top">
        <section className="relative min-h-[560px] overflow-hidden bg-slate-950 text-white md:min-h-[720px]">
          <img
            src={heroImageUrl}
            alt="Không gian bất động sản cao cấp tại Đà Nẵng"
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/75 to-slate-950/15" />
          <div className="relative mx-auto flex min-h-[560px] max-w-7xl flex-col justify-center px-4 pb-20 pt-20 md:min-h-[720px] md:pb-24 md:pt-24">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-rose-100">
                <Sparkles className="h-4 w-4" />
                Danh sách Bất động sản đang bán
              </div>
              <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">
                Nhà đất chọn lọc tại Đà Nẵng, tư vấn nhanh bằng AI
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-200">
                Cập nhật danh sách BĐS mới, pháp lý rõ, hình ảnh đầy đủ và kênh tư vấn trực tiếp qua Zalo, Facebook hoặc AI chat.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#listings" className="rounded-lg bg-rose-600 px-5 py-3 text-sm font-bold text-white hover:bg-rose-500">
                  Danh sách Bất động sản
                </a>
                <a href="#contact" className="rounded-lg bg-white px-5 py-3 text-sm font-bold text-slate-950 hover:bg-slate-100">
                  Nhận tư vấn
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="featured" className="mx-auto max-w-7xl px-4 py-16">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-rose-600">Featured listings</p>
              <h2 className="mt-2 text-3xl font-extrabold text-slate-950">Bất động sản nổi bật</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              Các sản phẩm giá trị cao, vị trí tốt và có đủ thông tin để khách ra quyết định nhanh.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {featuredProperties.map(property => (
              <PropertyCard key={property.id} property={property} onSelect={openProperty} large />
            ))}
          </div>
        </section>

        <section id="projects" className="bg-white py-16">
          <div className="mx-auto max-w-7xl px-4">
            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-wide text-rose-600">Chuyên dự án</p>
              <h2 className="mt-2 text-3xl font-extrabold text-slate-950">Danh sách dự án theo khu vực</h2>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {projectGroups.map(([name, group]) => (
                <a
                  key={name}
                  href="#listings"
                  className="rounded-lg border border-slate-200 bg-slate-50 p-5 transition-all hover:border-rose-200 hover:bg-rose-50"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <h3 className="font-bold text-slate-950">{name}</h3>
                  <p className="mt-2 text-sm text-slate-600">{group.length} sản phẩm đang mở bán</p>
                  <p className="mt-4 text-xs font-bold text-rose-700">Xem BĐS đang bán</p>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="listings" className="mx-auto max-w-7xl px-4 py-16">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-rose-600">Bất động sản nổi bật</p>
              <h2 className="mt-2 text-3xl font-extrabold text-slate-950">
                {activeProperties.length} bất động sản Đà Nẵng đang bán
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_180px] lg:w-[560px]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder="Tìm theo vị trí, tiêu đề, mô tả..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-rose-400"
                />
              </div>
              <select
                value={selectedType}
                onChange={event => setSelectedType(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              >
                <option value="all">Tất cả loại hình</option>
                {propertyTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredProperties.map(property => (
              <PropertyCard key={property.id} property={property} onSelect={openProperty} />
            ))}
          </div>

          {filteredProperties.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              Chưa có sản phẩm phù hợp với bộ lọc hiện tại.
            </div>
          )}
        </section>

        <section className="border-y border-slate-200 bg-white py-16" aria-labelledby="seo-guide-heading">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[1.1fr_0.9fr]">
            <article>
              <p className="text-xs font-bold uppercase tracking-wide text-rose-600">Kinh nghiệm tìm nhà đất</p>
              <h2 id="seo-guide-heading" className="mt-2 text-3xl font-extrabold text-slate-950">
                Tìm bất động sản phù hợp tại Đà Nẵng
              </h2>
              <p className="mt-5 leading-7 text-slate-600">
                Danh sách BĐS Estoria tập trung các loại hình căn hộ, nhà phố, đất và shophouse tại Đà Nẵng.
                Mỗi sản phẩm được trình bày rõ vị trí, mức giá, diện tích và tình trạng pháp lý để người mua
                dễ so sánh trước khi đặt lịch xem thực tế.
              </p>
              <p className="mt-4 leading-7 text-slate-600">
                Khi chọn bất động sản, nên xác định trước ngân sách, mục tiêu ở hay đầu tư, khu vực ưu tiên
                và yêu cầu pháp lý. Đội ngũ tư vấn sẽ dựa trên các tiêu chí này để lọc danh sách sát nhu cầu,
                hạn chế mất thời gian xem những sản phẩm không phù hợp.
              </p>
            </article>
            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">Câu hỏi thường gặp</h2>
              <div className="mt-5 space-y-4">
                <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer font-bold text-slate-950">Làm sao để xem chi tiết và đặt lịch xem?</summary>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Chọn sản phẩm để xem giá, diện tích, pháp lý và hình ảnh; sau đó liên hệ qua điện thoại,
                    Zalo hoặc Messenger để đặt lịch xem thực tế.
                  </p>
                </details>
                <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer font-bold text-slate-950">Có thể lọc theo ngân sách và khu vực không?</summary>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Có. Hãy gửi ngân sách, khu vực và loại hình mong muốn qua form hoặc AI chat để nhận danh
                    sách phù hợp hơn.
                  </p>
                </details>
              </div>
            </div>
          </div>
        </section>

        <section id="contact" className="bg-slate-950 py-16 text-white">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-rose-300">Contact</p>
              <h2 className="mt-2 text-3xl font-extrabold">Cần tư vấn sản phẩm phù hợp?</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
                Để lại nhu cầu, ngân sách và khu vực quan tâm. Tư vấn viên sẽ gửi danh sách phù hợp và lịch xem thực tế.
              </p>
              <div className="mt-8 grid gap-3 text-sm">
                <a href={`tel:${phoneNumber}`} className="flex items-center gap-3 text-slate-200">
                  <Phone className="h-5 w-5 text-rose-400" />
                  {phoneNumber}
                </a>
                <a href={zaloUrl} className="flex items-center gap-3 text-slate-200">
                  <MessageCircle className="h-5 w-5 text-blue-400" />
                  Zalo tư vấn nhanh
                </a>
                <a href={facebookUrl} className="flex items-center gap-3 text-slate-200">
                  <Facebook className="h-5 w-5 text-sky-400" />
                  Facebook Messenger
                </a>
              </div>
            </div>

            <form onSubmit={handleContactSubmit} className="rounded-lg border border-slate-800 bg-slate-900 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <input name="name" placeholder="Họ tên" className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-rose-500" />
                <input name="phone" placeholder="Số điện thoại" className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-rose-500" />
                <input name="budget" placeholder="Ngân sách dự kiến" className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-rose-500" />
                <input name="area" placeholder="Khu vực quan tâm" className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-rose-500" />
                <textarea name="note" placeholder="Nhu cầu chi tiết" rows={4} className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-rose-500" />
              </div>
              {contactStatus && (
                <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {contactStatus}
                </div>
              )}
              <button type="submit" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-5 py-3 text-sm font-bold text-white hover:bg-rose-500">
                <Send className="h-4 w-4" />
                Gửi nhu cầu
              </button>
            </form>
          </div>
        </section>
      </main>

      <footer className="bg-slate-950 border-t border-slate-900 py-10 text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-extrabold text-white">Estoria</div>
            <p className="mt-1 text-sm">Where the asset tell their story.</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <a href="#featured" className="hover:text-white">BĐS nổi bật</a>
            <a href="#projects" className="hover:text-white">Dự án</a>
            <a href="#contact" className="hover:text-white">Liên hệ</a>
          </div>
        </div>
      </footer>

      <div className="fixed bottom-4 left-3 z-50 flex flex-col gap-2 sm:bottom-5 sm:left-5">
        <a href={zaloUrl} className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg" aria-label="Chat Zalo">
          <MessageCircle className="h-5 w-5" />
        </a>
        <a href={facebookUrl} className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg" aria-label="Chat Facebook">
          <Facebook className="h-5 w-5" />
        </a>
        <a href={`tel:${phoneNumber}`} className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg" aria-label="Gọi điện">
          <Phone className="h-5 w-5" />
        </a>
      </div>

      <div className="fixed bottom-4 left-16 right-3 z-50 sm:bottom-5 sm:left-auto sm:right-5 sm:w-[min(380px,calc(100vw-24px))]">
        {chatOpen ? (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-slate-950 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-rose-300" />
                <div>
                  <div className="text-sm font-bold">Lily AI tư vấn bán hàng</div>
                  <div className="text-xs text-slate-400">Trả lời theo danh sách BĐS đang bán</div>
                </div>
              </div>
              <button type="button" onClick={() => setChatOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            {!guestProfile ? (
              <form onSubmit={handleGuestSubmit} className="space-y-3 bg-slate-50 p-4">
                <div>
                  <div className="text-sm font-bold text-slate-950">Thông tin nhanh trước khi chat</div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Anh/chị nhập họ tên và số điện thoại để bên em lưu lại nhu cầu và hỗ trợ xuyên suốt.</p>
                </div>
                <input
                  value={guestName}
                  onChange={event => setGuestName(event.target.value)}
                  placeholder="Họ tên"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
                />
                <input
                  value={guestPhone}
                  onChange={event => setGuestPhone(event.target.value)}
                  placeholder="Số điện thoại / Zalo"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
                />
                {guestError && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{guestError}</div>}
                <button type="submit" className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-500">
                  Bắt đầu chat
                </button>
              </form>
            ) : (
            <>
            <div className="h-[50vh] max-h-80 min-h-64 space-y-3 overflow-y-auto bg-slate-50 p-4 app-scroll">
              {chatMessages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[82%] rounded-lg px-3 py-2 text-sm leading-6 ${
                    message.role === 'user' ? 'bg-rose-600 text-white' : 'bg-white text-slate-700 border border-slate-200'
                  }`}>
                    {message.role === 'model' ? (
                      <MarkdownContent
                        content={message.content}
                        compact
                        className="break-words [&_h3]:mt-3 [&_h3]:border-t [&_h3]:border-slate-100 [&_h3]:pt-3 [&_h3:first-child]:mt-0 [&_h3:first-child]:border-0 [&_h3:first-child]:pt-0 [&_li]:my-1"
                      />
                    ) : message.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
                    Lily đang trả lời...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleChatSubmit} className="flex gap-2 border-t border-slate-200 bg-white p-3">
              <input
                value={chatInput}
                onChange={event => setChatInput(event.target.value)}
                placeholder="Hỏi giá, vị trí, pháp lý..."
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
              />
              <button type="submit" disabled={chatLoading} className="rounded-lg bg-rose-600 px-3 py-2 text-white disabled:opacity-50">
                <Send className="h-4 w-4" />
              </button>
            </form>
            </>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="ml-auto flex items-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-xl"
          >
            <Bot className="h-5 w-5 text-rose-300" />
            Tư vấn bán hàng
          </button>
        )}
      </div>

      {selectedProperty && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/80 p-3 backdrop-blur-sm app-scroll sm:p-4">
          <div className="mx-auto my-3 max-w-5xl overflow-hidden rounded-lg bg-white shadow-2xl sm:my-8">
            <div className="relative flex h-[62vh] max-h-[680px] min-h-[280px] items-center justify-center overflow-hidden bg-slate-950 sm:aspect-[16/9] sm:h-auto">
              <img
                src={selectedProperty.gallery_images?.[galleryIndex] || getImage(selectedProperty)}
                alt={selectedProperty.title}
                decoding="async"
                className="block h-full w-full object-contain"
              />
              <button
                type="button"
                onClick={closeProperty}
                className="absolute right-4 top-4 rounded-lg bg-white/95 p-2 text-slate-700 shadow-sm hover:text-slate-950"
              >
                <X className="h-5 w-5" />
              </button>
              {(selectedProperty.gallery_images || []).length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setGalleryIndex(index => index === 0 ? selectedProperty.gallery_images!.length - 1 : index - 1)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 rounded-lg bg-white/90 p-2 text-slate-900"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setGalleryIndex(index => (index + 1) % selectedProperty.gallery_images!.length)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg bg-white/90 p-2 text-slate-900"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_320px] lg:gap-8">
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">{selectedProperty.type}</span>
                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{selectedProperty.legal_status}</span>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-950 sm:text-3xl">{selectedProperty.title}</h2>
                <p className="mt-3 flex items-center gap-2 text-slate-600">
                  <MapPin className="h-4 w-4 text-rose-600" />
                  {selectedProperty.location}
                </p>
                <MarkdownContent
                  content={selectedProperty.rich_description || selectedProperty.description}
                  className="mt-5 text-base text-slate-700"
                />
                <div className="mt-6 flex flex-wrap gap-2">
                  {(selectedProperty.selling_points || []).map(point => (
                    <span key={point} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      {point}
                    </span>
                  ))}
                </div>
              </div>

              <aside className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm text-slate-500">Giá bán</div>
                <div className="mt-1 text-3xl font-extrabold text-rose-600">{formatPrice(selectedProperty.price)}</div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-white p-3">
                    <div className="text-slate-500">Diện tích</div>
                    <div className="font-bold text-slate-950">{selectedProperty.area} m2</div>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <div className="text-slate-500">Hướng</div>
                    <div className="font-bold text-slate-950">{selectedProperty.direction}</div>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <div className="text-slate-500">Đường</div>
                    <div className="font-bold text-slate-950">{selectedProperty.road_width} m</div>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <div className="text-slate-500">Pháp lý</div>
                    <div className="font-bold text-slate-950">{selectedProperty.legal_status}</div>
                  </div>
                </div>
                <div className="mt-5 grid gap-2">
                  <a href={zaloUrl} className="rounded-lg bg-blue-600 px-4 py-3 text-center text-sm font-bold text-white">Chat Zalo</a>
                  <a href={facebookUrl} className="rounded-lg bg-sky-600 px-4 py-3 text-center text-sm font-bold text-white">Messenger</a>
                  <a href={`tel:${phoneNumber}`} className="rounded-lg bg-slate-950 px-4 py-3 text-center text-sm font-bold text-white">Gọi ngay</a>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
