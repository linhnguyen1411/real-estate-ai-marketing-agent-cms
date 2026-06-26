import React, { FormEvent, useMemo, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Bot,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Eye,
  Facebook,
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
import { PropertyShareButton, PropertyShareCompactButton } from './components/PropertyShareModal';
import LeadCaptureForm from './components/LeadCaptureForm';
import { getPublicPropertySlug } from './utils/propertyShare';
import { collectSiteSeoKeywords, getPropertySeoKeywordsFromContent } from './utils/hashtags';
import SocialProof from './components/leadGen/SocialProof';
import MultiStepInvestorForm from './components/leadGen/MultiStepInvestorForm';
import { trackMessengerClick, trackPhoneClick, trackZaloClick } from './leadGen/analytics';
import PublicNav, { PublicNavMobile } from './components/layout/PublicNav';
import SiteLogo from './components/layout/SiteLogo';
import PublicSiteFooter from './components/layout/PublicSiteFooter';
import TrustSignalsSection from './components/layout/TrustSignalsSection';
import { compareProjectDisplayOrder, getPropertyProjectLabel, matchProjectName, sortProjectEntries } from './seo/propertyCatalog';
import PaginationBar, { DEFAULT_PAGE_SIZE } from './components/common/PaginationBar';

interface ListingsPageProps {
  properties: Property[];
  propertySlug?: string;
  projectDisplayOrder?: string[];
}

interface PublicChatMessage {
  role: 'user' | 'model';
  content: string;
}

interface PublicChatGuestProfile {
  sessionId: string;
  name: string;
  phone: string;
}

const PUBLIC_CHAT_SESSION_KEY = 'real_estate_public_chat_session';
const PUBLIC_CHAT_GUEST_KEY = 'real_estate_public_chat_guest';
const PUBLIC_CHAT_WELCOME = 'Chào anh/chị, em là Lily AI tư vấn BĐS. Anh/chị đang tìm đất nền, nhà phố hay căn hộ?';

function readStoredGuestProfile(sessionId: string): PublicChatGuestProfile | null {
  try {
    const saved = localStorage.getItem(PUBLIC_CHAT_GUEST_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as Partial<PublicChatGuestProfile>;
    if (!parsed.name || !parsed.phone) return null;
    if (parsed.sessionId && parsed.sessionId !== sessionId) return null;
    return { sessionId, name: parsed.name, phone: parsed.phone };
  } catch {
    return null;
  }
}
const zaloUrl = 'https://zalo.me/0905777594';
const facebookUrl = 'https://www.facebook.com/estoria.dn';
const messengerUrl = 'https://m.me/estoria.dn';
const phoneTel = '+84905777594';
const phoneNumber = '0905 777 594';
const heroImageUrl = 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=2200&q=90';
const publicListingsPath = '/';
const TRANSACTION_TYPES = ['Bán', 'Cho thuê'];
const DEFAULT_SEO_KEYWORDS = [
  'bất động sản sun group đà nẵng',
  'căn hộ cao cấp đà nẵng',
  'bất động sản nam đà nẵng',
  'shophouse kinh doanh đà nẵng',
  'giá đất đà nẵng 2026'
];
const DEFAULT_SEO_TITLE = 'BĐS Sun Group Đà Nẵng | Căn Đẹp Giá Gốc 2026';
const DEFAULT_SEO_DESCRIPTION = 'Đất nền & nhà phố Nam Đà Nẵng, căn hộ Sun Group ven sông Hàn — pháp lý rõ, hình ảnh thật, giỏ ký gửi cập nhật 2026.';
const PRICE_RANGES = [
  { value: 'all', label: 'Tất cả mức giá' },
  { value: 'under3', label: 'Dưới 3 tỷ' },
  { value: '3to5', label: '3 - 5 tỷ' },
  { value: '5to10', label: '5 - 10 tỷ' },
  { value: 'over10', label: 'Trên 10 tỷ' }
];
const AREA_RANGES = [
  { value: 'all', label: 'Tất cả diện tích' },
  { value: 'under80', label: 'Dưới 80 m²' },
  { value: '80to150', label: '80 - 150 m²' },
  { value: 'over150', label: 'Trên 150 m²' }
];

function formatPrice(price: number) {
  return `${price.toLocaleString('vi-VN')} tỷ`;
}

function getTransactionType(property: Property) {
  return String(property.transaction_type || 'Bán').toLowerCase() === 'cho thuê' ? 'Cho thuê' : 'Bán';
}

function getPropertyViewCount(property: Property) {
  return Number(property.public_view_count || 0);
}

function getImage(property?: Property) {
  if (!property) {
    return 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=85';
  }

  return property.gallery_images?.[0] || property.images || 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=85';
}

function hasGoogleMap(property: Property) {
  return Number.isFinite(property.map_latitude) && Number.isFinite(property.map_longitude);
}

function getGoogleMapUrl(property: Property) {
  return `https://maps.google.com/maps?q=${property.map_latitude},${property.map_longitude}&z=16&output=embed`;
}

function getGoogleMapLink(property: Property) {
  return `https://www.google.com/maps/search/?api=1&query=${property.map_latitude},${property.map_longitude}`;
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
  return getPublicPropertySlug(property);
}

function getPropertyPath(property: Property) {
  return `/${encodeURIComponent(getPropertySlug(property))}`;
}

function getPropertySlugFromPath(pathname: string) {
  const segment = pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '';
  if (!segment || segment === 'admin' || segment === 'listings' || segment === 'bds-da-nang') {
    return '';
  }
  try {
    return decodeURIComponent(segment).toLowerCase();
  } catch {
    return segment.toLowerCase();
  }
}

function findPropertyFromLocation(
  items: Property[],
  pathname: string,
  search: string,
  slugParam?: string
) {
  const active = items.filter(property => !['sold', 'hidden'].includes(property.sale_status || 'available'));
  const propertyId = new URLSearchParams(search).get('property');
  const normalizedSlug = getPropertySlugFromPath(pathname) || decodeURIComponent(slugParam || '').toLowerCase();
  if (!propertyId && !normalizedSlug) return null;
  return active.find(item =>
    item.id === propertyId || getPropertySlug(item).toLowerCase() === normalizedSlug
  ) ?? null;
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

function limitSeoTitle(value: string) {
  return value.length <= 60 ? value : `${value.slice(0, 57).trim()}...`;
}

function getPropertySeoTitle(property: Property) {
  const type = String(property.type || '').toLowerCase();
  if (type.includes('căn') || type.includes('can')) {
    return limitSeoTitle(`${property.title} | Căn Hộ Đà Nẵng Giá 2026`);
  }
  if (type.includes('shophouse')) {
    return limitSeoTitle(`${property.title} | Shophouse Đà Nẵng Kinh Doanh`);
  }
  return limitSeoTitle(`${property.title} | BĐS Sun Group Đà Nẵng`);
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return { status: 'error', data: [], guest: null };
  }
  try {
    return JSON.parse(text);
  } catch {
    return {
      status: 'error',
      data: [],
      guest: null,
      message: response.ok ? 'Phản hồi server không đúng định dạng JSON.' : `Server trả lỗi ${response.status}.`
    };
  }
}

interface PropertyCardProps {
  property: Property;
  onSelect: (property: Property) => void;
  viewCount: number;
  large?: boolean;
}

const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  onSelect,
  viewCount,
  large = false
}) => {
  const transactionType = getTransactionType(property);

  return (
    <a
      href={getPropertyPath(property)}
      onClick={event => {
        event.preventDefault();
        onSelect(property);
      }}
      className="property-card group"
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
          {transactionType} • {property.type}
        </div>
        <div className="absolute right-3 top-3 rounded-md bg-invest-blue px-2.5 py-1 text-xs font-bold text-white shadow-sm">
          {formatPrice(property.price)}
        </div>
        <div className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-md bg-white/95 px-2.5 py-1 text-xs font-semibold text-invest-text shadow-sm">
          <Eye className="h-3.5 w-3.5" />
          {viewCount.toLocaleString('vi-VN')} lượt xem
        </div>
      </div>

      <div className="flex flex-1 flex-col space-y-3 p-4">
        <div>
          <h3 className="line-clamp-2 text-base font-bold text-slate-950">{property.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <MapPin className="h-4 w-4 text-invest-gold" />
            {property.location}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-slate-400">
            <Eye className="h-3.5 w-3.5" />
            {viewCount.toLocaleString('vi-VN')} lượt xem
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
            <span key={point} className="rounded-md bg-invest-gold-muted px-2 py-1 text-xs font-semibold text-invest-blue">
              {point}
            </span>
          ))}
        </div>
      </div>
    </a>
  );
};

export default function ListingsPage({ properties, propertySlug, projectDisplayOrder }: ListingsPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [selectedTransactionType, setSelectedTransactionType] = useState('all');
  const [selectedPriceRange, setSelectedPriceRange] = useState('all');
  const [selectedAreaRange, setSelectedAreaRange] = useState('all');
  const [selectedProject, setSelectedProject] = useState('all');
  const initialRouteProperty = findPropertyFromLocation(properties, location.pathname, location.search, propertySlug);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(() => initialRouteProperty);
  const [detailViewCount, setDetailViewCount] = useState(() => Number(initialRouteProperty?.public_view_count || 0));
  const [galleryIndex, setGalleryIndex] = useState(0);
  const selectedPropertyIdRef = React.useRef<string | null>(initialRouteProperty?.id ?? null);
  const localPropertiesRef = React.useRef(properties);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [guestProfileReady, setGuestProfileReady] = useState(false);
  const [guestProfile, setGuestProfile] = useState<PublicChatGuestProfile | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestError, setGuestError] = useState('');
  const [chatMessages, setChatMessages] = useState<PublicChatMessage[]>([
    {
      role: 'model',
      content: PUBLIC_CHAT_WELCOME
    }
  ]);
  const [contactStatus, setContactStatus] = useState('');
  const [listingPage, setListingPage] = useState(1);
  const [localProperties, setLocalProperties] = useState<Property[]>(properties);

  React.useEffect(() => {
    setLocalProperties(properties);
  }, [properties]);

  React.useEffect(() => {
    localPropertiesRef.current = localProperties;
  }, [localProperties]);

  const applyPropertyViewUpdate = React.useCallback((update: { id: string; public_view_count?: number; last_public_view_at?: string }) => {
    if (!update?.id) return;
    const nextCount = Number(update.public_view_count || 0);
    setLocalProperties(prev => prev.map(property =>
      property.id === update.id
        ? { ...property, public_view_count: nextCount, last_public_view_at: update.last_public_view_at }
        : property
    ));
    if (selectedPropertyIdRef.current === update.id) {
      setDetailViewCount(nextCount);
    }
  }, []);

  const trackPropertyView = React.useCallback((property: Property) => {
    const timestamp = new Date().toISOString();
    const optimisticCount = Number(property.public_view_count || 0) + 1;

    setLocalProperties(prev => prev.map(item => {
      if (item.id !== property.id) return item;
      return {
        ...item,
        public_view_count: optimisticCount,
        last_public_view_at: timestamp
      };
    }));

    if (selectedPropertyIdRef.current === property.id) {
      setDetailViewCount(optimisticCount);
    }

    fetch('/api/public/track-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'property', propertyId: property.id })
    })
      .then(async (response) => {
        const text = await response.text();
        if (!response.ok || !text.trim()) return;
        const json = JSON.parse(text) as { data?: { property?: { id: string; public_view_count?: number; last_public_view_at?: string } } };
        if (json.data?.property) {
          applyPropertyViewUpdate(json.data.property);
        }
      })
      .catch(() => undefined);
  }, [applyPropertyViewUpdate]);

  const resetGuestProfile = React.useCallback(() => {
    localStorage.removeItem(PUBLIC_CHAT_GUEST_KEY);
    setGuestProfile(null);
    setGuestError('');
    setChatMessages([{ role: 'model', content: PUBLIC_CHAT_WELCOME }]);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const stored = readStoredGuestProfile(chatSessionId);
    if (stored) {
      setGuestName(stored.name);
      setGuestPhone(stored.phone);
    }

    fetch(`/api/public/chat/history?sessionId=${encodeURIComponent(chatSessionId)}`)
      .then(readJsonResponse)
      .then(json => {
        if (cancelled) return;

        const profile = json.status === 'success' && json.guest?.name && json.guest?.phone
          ? {
              sessionId: chatSessionId,
              name: String(json.guest.name),
              phone: String(json.guest.phone)
            }
          : null;

        if (profile) {
          localStorage.setItem(PUBLIC_CHAT_GUEST_KEY, JSON.stringify(profile));
          setGuestProfile(profile);
          setGuestName(profile.name);
          setGuestPhone(profile.phone);
        } else {
          localStorage.removeItem(PUBLIC_CHAT_GUEST_KEY);
          setGuestProfile(null);
        }

        if (Array.isArray(json.data) && json.data.length > 0) {
          setChatMessages(json.data.map((item: { role: 'user' | 'model'; message: string }) => ({
            role: item.role,
            content: item.message
          })));
        }
      })
      .catch(() => {
        if (!cancelled && stored) {
          setGuestProfile(stored);
        }
      })
      .finally(() => {
        if (!cancelled) setGuestProfileReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [chatSessionId]);

  React.useEffect(() => {
    if (!guestProfile) return;
    const timer = window.setInterval(() => {
      fetch(`/api/public/chat/history?sessionId=${encodeURIComponent(chatSessionId)}`)
        .then(readJsonResponse)
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

  React.useEffect(() => {
    const trackingKey = 'real_estate_site_view_tracked';
    if (sessionStorage.getItem(trackingKey)) return;
    sessionStorage.setItem(trackingKey, '1');
    fetch('/api/public/track-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'site' })
    }).catch(() => undefined);
  }, []);

  const activeProperties = useMemo(
    () => localProperties.filter(property => !['sold', 'hidden'].includes(property.sale_status || 'available')),
    [localProperties]
  );

  const propertiesReady = localProperties.length > 0;

  React.useEffect(() => {
    const propertyId = new URLSearchParams(location.search).get('property');
    const normalizedSlug = getPropertySlugFromPath(location.pathname)
      || decodeURIComponent(propertySlug || '').toLowerCase();
    if (!propertyId && !normalizedSlug) {
      selectedPropertyIdRef.current = null;
      setSelectedProperty(null);
      return;
    }
    const property = findPropertyFromLocation(
      localPropertiesRef.current,
      location.pathname,
      location.search,
      propertySlug
    );
    if (!property || selectedPropertyIdRef.current === property.id) return;

    selectedPropertyIdRef.current = property.id;
    setSelectedProperty(property);
    setDetailViewCount(Number(property.public_view_count || 0));
    setGalleryIndex(0);
  }, [location.pathname, location.search, propertySlug, propertiesReady]);

  React.useEffect(() => {
    if (!selectedProperty) return;
    const sessionKey = `property-view-${selectedProperty.id}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, '1');
    trackPropertyView(selectedProperty);
  }, [selectedProperty?.id, trackPropertyView]);

  const featuredProperties = useMemo(
    () => activeProperties.filter(property => property.is_featured).slice(0, 6),
    [activeProperties]
  );

  const filteredProperties = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return activeProperties.filter(property => {
      const matchesQuery = !normalizedQuery
        || property.title.toLowerCase().includes(normalizedQuery)
        || property.location.toLowerCase().includes(normalizedQuery)
        || property.type.toLowerCase().includes(normalizedQuery)
        || getTransactionType(property).toLowerCase().includes(normalizedQuery)
        || property.description.toLowerCase().includes(normalizedQuery)
        || (property.rich_description || '').toLowerCase().includes(normalizedQuery);
      const matchesType = selectedType === 'all' || property.type === selectedType;
      const matchesTransaction = selectedTransactionType === 'all' || getTransactionType(property) === selectedTransactionType;
      const matchesPrice =
        selectedPriceRange === 'all'
          || (selectedPriceRange === 'under3' && property.price < 3)
          || (selectedPriceRange === '3to5' && property.price >= 3 && property.price <= 5)
          || (selectedPriceRange === '5to10' && property.price > 5 && property.price <= 10)
          || (selectedPriceRange === 'over10' && property.price > 10);
      const matchesArea =
        selectedAreaRange === 'all'
          || (selectedAreaRange === 'under80' && property.area < 80)
          || (selectedAreaRange === '80to150' && property.area >= 80 && property.area <= 150)
          || (selectedAreaRange === 'over150' && property.area > 150);
      const matchesProject = matchProjectName(property, selectedProject);

      return matchesQuery && matchesType && matchesTransaction && matchesPrice && matchesArea && matchesProject;
    });
  }, [activeProperties, searchQuery, selectedAreaRange, selectedPriceRange, selectedProject, selectedTransactionType, selectedType]);

  const projectGroups = useMemo(() => {
    const groups = new Map<string, Property[]>();
    activeProperties.forEach(property => {
      const key = getPropertyProjectLabel(property);
      if (!key) return;
      groups.set(key, [...(groups.get(key) || []), property]);
    });
    return sortProjectEntries(Array.from(groups.entries()), projectDisplayOrder);
  }, [activeProperties, projectDisplayOrder]);

  const projectFilterOptions = useMemo(() => {
    const names = Array.from(
      new Set(activeProperties.map(p => getPropertyProjectLabel(p)).filter(Boolean)),
    ) as string[];
    return names.sort((a, b) => compareProjectDisplayOrder(a, b, projectDisplayOrder));
  }, [activeProperties, projectDisplayOrder]);
  const paginatedFilteredProperties = useMemo(() => {
    const start = (listingPage - 1) * DEFAULT_PAGE_SIZE;
    return filteredProperties.slice(start, start + DEFAULT_PAGE_SIZE);
  }, [filteredProperties, listingPage]);

  React.useEffect(() => {
    setListingPage(1);
  }, [searchQuery, selectedAreaRange, selectedPriceRange, selectedTransactionType, selectedType, selectedProject]);

  const propertyTypes = Array.from(new Set(activeProperties.map(property => property.type)));
  const siteOrigin = window.location.origin;
  const canonicalUrl = selectedProperty
    ? `${siteOrigin}${getPropertyPath(selectedProperty)}`
    : siteOrigin;
  const seoTitle = selectedProperty
    ? limitSeoTitle(selectedProperty.ai_posts?.seo?.title || getPropertySeoTitle(selectedProperty))
    : DEFAULT_SEO_TITLE;
  const seoDescription = selectedProperty
    ? selectedProperty.ai_posts?.seo?.meta_description || truncateText(
        `${selectedProperty.title} tại ${selectedProperty.location}, diện tích ${selectedProperty.area} m2, giá ${formatPrice(selectedProperty.price)}, pháp lý ${selectedProperty.legal_status}. ${selectedProperty.rich_description || selectedProperty.description}`
      )
    : DEFAULT_SEO_DESCRIPTION;
  const seoKeywords = useMemo(() => {
    const keywords = selectedProperty
      ? getPropertySeoKeywordsFromContent(selectedProperty, DEFAULT_SEO_KEYWORDS)
      : collectSiteSeoKeywords(activeProperties, DEFAULT_SEO_KEYWORDS);
    return keywords.join(', ');
  }, [activeProperties, selectedProperty]);
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
        name: 'Danh sách bất động sản Đà Nẵng bán/cho thuê',
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
      const profile = { sessionId: chatSessionId, name, phone };
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
      if (!response.ok) {
        if (response.status === 403) {
          resetGuestProfile();
          setGuestError(json.message || 'Vui lòng nhập họ tên và số điện thoại để bắt đầu chat.');
          return;
        }
        throw new Error(json.message || 'Không thể gửi tin nhắn.');
      }
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
    selectedPropertyIdRef.current = property.id;
    setSelectedProperty(property);
    setDetailViewCount(Number(property.public_view_count || 0));
    setGalleryIndex(0);
    navigate(getPropertyPath(property), { preventScrollReset: true });
  };

  const closeProperty = () => {
    selectedPropertyIdRef.current = null;
    setSelectedProperty(null);
    navigate(publicListingsPath, { preventScrollReset: true });
  };

  const openPropertyChat = () => {
    setChatOpen(true);
    if (selectedProperty) {
      setChatInput(`Tôi quan tâm tin "${selectedProperty.title}" tại ${selectedProperty.location}. Cho tôi biết thêm về giá và pháp lý.`);
    }
  };

  const quickFilterResults = filteredProperties.slice(0, 6);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedType('all');
    setSelectedTransactionType('all');
    setSelectedPriceRange('all');
    setSelectedAreaRange('all');
    setSelectedProject('all');
  };

  const applyProjectFilter = (projectName: string) => {
    setSelectedProject(projectName);
    document.getElementById('listings')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden bg-slate-50 text-slate-950 app-scroll">
      <Helmet>
        <html lang="vi" />
        <title>{seoTitle}</title>
        <meta name="description" content={seoDescription} />
        <meta name="keywords" content={seoKeywords} />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <meta name="googlebot" content="index, follow, max-image-preview:large" />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:locale" content="vi_VN" />
        <meta property="og:type" content={selectedProperty ? 'product' : 'website'} />
        <meta property="og:site_name" content="Estoria" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDescription} />
        <meta property="og:image" content={seoImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoTitle} />
        <meta name="twitter:description" content={seoDescription} />
        <meta name="twitter:image" content={seoImage} />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>

      <header className="public-header">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <SiteLogo />

          <div className="hidden min-w-0 flex-1 justify-center lg:flex">
            <PublicNav />
          </div>

          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            <a href={`tel:${phoneNumber}`} className="btn-outline px-3 py-2 text-xs">
              Gọi tư vấn
            </a>
            <a href="#contact" className="btn-cta px-3 py-2 text-xs">
              Nhận danh sách đầu tư
            </a>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="shrink-0 rounded-lg border border-invest-border p-2 text-invest-text lg:hidden"
            aria-label="Mở menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-invest-border px-4 py-3 lg:hidden">
            <PublicNavMobile onItemClick={() => setMobileMenuOpen(false)} />
            <a href="#contact" className="btn-cta mt-3 block w-full text-center text-sm">
              Nhận danh sách đầu tư
            </a>
          </div>
        )}
      </header>

      <main id="top" className="public-shell">
        <section className="hero-investment">
          <img
            src={heroImageUrl}
            alt="Cảnh quan Đà Nẵng — Nam Đà Nẵng và ven biển"
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="hero-investment__overlay" />
          <div className="relative mx-auto flex min-h-[560px] max-w-7xl flex-col justify-center px-4 pb-20 pt-20 md:min-h-[680px] md:pb-24 md:pt-24">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-invest-border bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-invest-gold">
                <Sparkles className="h-4 w-4" />
                Trung tâm thông tin đầu tư Nam Đà Nẵng
              </div>
              <h1 className="heading-hero">
                Dữ liệu & Cơ hội đầu tư Nam Đà Nẵng
              </h1>
              <p className="text-body-lg mt-5 max-w-2xl text-invest-muted">
                Phân tích thị trường, dự án và tài sản phù hợp cho nhà đầu tư trung và dài hạn.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#contact" className="btn-cta px-5 py-3">
                  Nhận báo cáo thị trường
                </a>
                <a href="#listings" className="btn-primary px-5 py-3">
                  Xem cơ hội đầu tư
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-5">
            <div className="grid gap-3 lg:grid-cols-[1.4fr_160px_180px_180px_180px_auto] lg:items-end">
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Tìm nhanh sản phẩm</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder="Nhập khu vực, tên dự án, loại hình..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-invest-cta focus:bg-white"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Hình thức</label>
                <select
                  value={selectedTransactionType}
                  onChange={event => setSelectedTransactionType(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-invest-cta focus:bg-white"
                >
                  <option value="all">Bán / Cho thuê</option>
                  {TRANSACTION_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Loại hình</label>
                <select
                  value={selectedType}
                  onChange={event => setSelectedType(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-invest-cta focus:bg-white"
                >
                  <option value="all">Tất cả loại hình</option>
                  {propertyTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Khoảng giá</label>
                <select
                  value={selectedPriceRange}
                  onChange={event => setSelectedPriceRange(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-invest-cta focus:bg-white"
                >
                  {PRICE_RANGES.map(range => (
                    <option key={range.value} value={range.value}>{range.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Diện tích</label>
                <select
                  value={selectedAreaRange}
                  onChange={event => setSelectedAreaRange(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-invest-cta focus:bg-white"
                >
                  {AREA_RANGES.map(range => (
                    <option key={range.value} value={range.value}>{range.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 lg:justify-end">
                <a href="#listings" className="inline-flex flex-1 items-center justify-center rounded-lg bg-invest-cta px-4 py-2.5 text-sm font-bold text-white hover:bg-invest-cta-hover lg:flex-none">
                  Xem {filteredProperties.length} BĐS
                </a>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-600 hover:border-slate-300"
                >
                  Xóa
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="featured" className="mx-auto max-w-7xl px-4 py-16">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-invest-gold">Được đề xuất</p>
              <h2 className="mt-2 text-3xl font-extrabold text-slate-950">Bất động sản được đề xuất</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              Các sản phẩm giá trị cao, vị trí tốt và có đủ thông tin để khách ra quyết định nhanh.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {featuredProperties.map(property => (
              <PropertyCard key={property.id} property={property} onSelect={openProperty} viewCount={getPropertyViewCount(property)} large />
            ))}
          </div>
        </section>

        <section id="projects" className="bg-white py-16">
          <div className="mx-auto max-w-7xl px-4">
            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-wide text-invest-gold">Chuyên dự án</p>
              <h2 className="mt-2 text-3xl font-extrabold text-slate-950">Danh sách theo dự án</h2>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {projectGroups.map(([name, group]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => applyProjectFilter(name)}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-left transition-all hover:border-invest-gold/40 hover:bg-invest-gold-muted"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-invest-blue text-white">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <h3 className="font-bold text-slate-950">{name}</h3>
                  <p className="mt-2 text-sm text-slate-600">{group.length} sản phẩm đang hiển thị</p>
                  <p className="mt-4 text-xs font-bold text-invest-blue">Lọc theo dự án này</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section id="listings" className="mx-auto max-w-7xl px-4 py-16">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-invest-gold">Bất động đang giao dịch</p>
              <h2 className="mt-2 text-3xl font-extrabold text-slate-950">
                Bất động sản đang bán/cho thuê
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:w-full lg:grid-cols-[1.2fr_repeat(5,minmax(0,1fr))]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder="Tìm theo vị trí, tiêu đề, mô tả..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-invest-cta"
                />
              </div>
              <select
                value={selectedTransactionType}
                onChange={event => setSelectedTransactionType(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-invest-cta"
              >
                <option value="all">Bán / Cho thuê</option>
                {TRANSACTION_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <select
                value={selectedType}
                onChange={event => setSelectedType(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-invest-cta"
              >
                <option value="all">Tất cả loại hình</option>
                {propertyTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <select
                value={selectedProject}
                onChange={event => setSelectedProject(event.target.value)}
                className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-invest-cta"
              >
                <option value="all">Tất cả dự án</option>
                {projectFilterOptions.map(project => (
                  <option key={project} value={project}>{project}</option>
                ))}
              </select>
              <select
                value={selectedPriceRange}
                onChange={event => setSelectedPriceRange(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-invest-cta"
              >
                {PRICE_RANGES.map(range => (
                  <option key={range.value} value={range.value}>{range.label}</option>
                ))}
              </select>
              <select
                value={selectedAreaRange}
                onChange={event => setSelectedAreaRange(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-invest-cta"
              >
                {AREA_RANGES.map(range => (
                  <option key={range.value} value={range.value}>{range.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {paginatedFilteredProperties.map(property => (
              <PropertyCard key={property.id} property={property} onSelect={openProperty} viewCount={getPropertyViewCount(property)} />
            ))}
          </div>

          <PaginationBar
            className="mt-8"
            page={listingPage}
            pageSize={DEFAULT_PAGE_SIZE}
            totalItems={filteredProperties.length}
            onPageChange={setListingPage}
          />

          {filteredProperties.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              Chưa có sản phẩm phù hợp với bộ lọc hiện tại.
            </div>
          )}
        </section>

        <section className="border-y border-slate-200 bg-white py-16" aria-labelledby="seo-guide-heading">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[1.1fr_0.9fr]">
            <article>
              <p className="text-xs font-bold uppercase tracking-wide text-invest-gold">Kinh nghiệm tìm nhà đất</p>
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

        <TrustSignalsSection />

        <SocialProof />

        <section id="contact" className="section-alt border-t border-invest-border py-16">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="label-section">Nhà đầu tư trung và dài hạn</p>
              <h2 className="heading-section mt-2">Nhận danh sách cơ hội đầu tư Nam Đà Nẵng</h2>
              <p className="text-body mt-4 max-w-xl text-invest-muted">
                Báo cáo thị trường 2026, khung 20 nhóm cơ hội và bản đồ đầu tư — miễn phí sau khi để lại thông tin.
              </p>
              <Link
                to="/tai-lieu-dau-tu"
                className="mt-4 inline-block text-sm font-bold text-invest-cta hover:underline"
              >
                Xem tài liệu đầu tư →
              </Link>
              <div className="mt-8 grid gap-3 text-sm">
                <a href={`tel:${phoneNumber}`} onClick={() => trackPhoneClick('contact_section')} className="flex items-center gap-3 text-invest-text">
                  <Phone className="h-5 w-5 text-invest-blue" />
                  {phoneNumber}
                </a>
                <a href={zaloUrl} onClick={() => trackZaloClick('contact_section')} className="flex items-center gap-3 text-invest-text">
                  <MessageCircle className="h-5 w-5 text-blue-600" />
                  Zalo tư vấn nhanh
                </a>
                <a href={facebookUrl} onClick={() => trackMessengerClick('contact_section')} className="flex items-center gap-3 text-invest-text">
                  <Facebook className="h-5 w-5 text-sky-600" />
                  Facebook Messenger
                </a>
              </div>
            </div>

            <div className="min-w-0">
            <MultiStepInvestorForm source="homepage_contact" />
            </div>
          </div>
        </section>
      </main>

      <PublicSiteFooter />

      <div className={`pointer-events-none fixed right-3 top-1/2 z-[70] flex -translate-y-1/2 flex-col gap-2.5 lg:hidden ${selectedProperty ? 'hidden' : ''}`} style={{ paddingRight: 'env(safe-area-inset-right)' }}>
        <a
          href={`tel:${phoneTel}`}
          onClick={() => trackPhoneClick('listings_floating')}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg ring-2 ring-white/80 transition-transform active:scale-95"
          aria-label="Gọi điện"
        >
          <Phone className="h-5 w-5" />
        </a>
        <a
          href={zaloUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackZaloClick('listings_floating')}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg ring-2 ring-white/80 transition-transform active:scale-95"
          aria-label="Chat Zalo"
        >
          <MessageCircle className="h-5 w-5" />
        </a>
        <a
          href={messengerUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackMessengerClick('listings_floating')}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg ring-2 ring-white/80 transition-transform active:scale-95"
          aria-label="Nhắn tin Messenger"
        >
          <Facebook className="h-5 w-5" />
        </a>
        {selectedProperty && (
          <button
            type="button"
            onClick={openPropertyChat}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-invest-cta text-white shadow-lg ring-2 ring-white/80 transition-transform active:scale-95"
            aria-label="Hỏi Lily AI về tin này"
          >
            <Bot className="h-5 w-5" />
          </button>
        )}
      </div>

      {!selectedProperty && (
      <div className="fixed bottom-4 left-3 right-14 z-50 sm:bottom-5 sm:left-auto sm:right-5 sm:w-[min(380px,calc(100vw-24px))]">
        {chatOpen ? (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-slate-950 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-invest-gold" />
                <div>
                  <div className="text-sm font-bold">Lily AI tư vấn bán hàng</div>
                  <div className="text-xs text-slate-400">Trả lời theo danh sách BĐS bán/cho thuê</div>
                </div>
              </div>
              <button type="button" onClick={() => setChatOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            {!guestProfileReady ? (
              <div className="space-y-3 bg-slate-50 p-4 text-center text-sm text-slate-500">
                Đang tải thông tin chat...
              </div>
            ) : !guestProfile ? (
              <form onSubmit={handleGuestSubmit} className="space-y-3 bg-slate-50 p-4">
                <div>
                  <div className="text-sm font-bold text-slate-950">Thông tin nhanh trước khi chat</div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Anh/chị nhập họ tên và số điện thoại để bên em lưu lại nhu cầu và hỗ trợ xuyên suốt.</p>
                </div>
                <input
                  value={guestName}
                  onChange={event => setGuestName(event.target.value)}
                  placeholder="Họ tên"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-invest-cta"
                />
                <input
                  value={guestPhone}
                  onChange={event => setGuestPhone(event.target.value)}
                  placeholder="Số điện thoại / Zalo"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-invest-cta"
                />
                {guestError && <div className="rounded-lg bg-invest-gold-muted px-3 py-2 text-xs text-invest-blue">{guestError}</div>}
                <button type="submit" className="w-full rounded-lg bg-invest-cta px-4 py-2.5 text-sm font-bold text-white hover:bg-invest-cta-hover">
                  Bắt đầu chat
                </button>
              </form>
            ) : (
            <>
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
              <span className="truncate">{guestProfile.name} · {guestProfile.phone}</span>
              <button
                type="button"
                onClick={resetGuestProfile}
                className="shrink-0 font-semibold text-invest-gold hover:text-invest-cta-hover"
              >
                Đổi thông tin
              </button>
            </div>
            <div className="h-[50vh] max-h-80 min-h-64 space-y-3 overflow-y-auto bg-slate-50 p-4 app-scroll">
              {chatMessages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[82%] rounded-lg px-3 py-2 text-sm leading-6 ${
                    message.role === 'user' ? 'bg-invest-cta text-white' : 'bg-white text-slate-700 border border-slate-200'
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
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-invest-cta"
              />
              <button type="submit" disabled={chatLoading} className="rounded-lg bg-invest-cta px-3 py-2 text-white disabled:opacity-50">
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
            <Bot className="h-5 w-5 text-invest-gold" />
            Tư vấn bán hàng
          </button>
        )}
      </div>
      )}

      {selectedProperty && (
        <>
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/80 p-3 backdrop-blur-sm app-scroll sm:p-4">
          <div key={selectedProperty.id} className="mx-auto my-3 max-w-5xl overflow-hidden rounded-lg bg-white pb-24 shadow-2xl sm:my-8 lg:pb-0">
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
                  <span className="rounded-md bg-invest-cta px-2.5 py-1 text-xs font-bold text-white">{getTransactionType(selectedProperty)}</span>
                  <span className="rounded-md bg-invest-gold-muted px-2.5 py-1 text-xs font-bold text-invest-blue">{selectedProperty.type}</span>
                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{selectedProperty.legal_status}</span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700">
                    <Eye className="h-3.5 w-3.5" />
                    {detailViewCount.toLocaleString('vi-VN')} lượt xem
                  </span>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-950 sm:text-3xl">{selectedProperty.title}</h2>
                <p className="mt-3 flex items-center gap-2 text-slate-600">
                  <MapPin className="h-4 w-4 text-invest-gold" />
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
                <div className="text-sm text-slate-500">{getTransactionType(selectedProperty) === 'Cho thuê' ? 'Giá thuê' : 'Giá bán'}</div>
                <div className="mt-1 text-3xl font-extrabold text-invest-gold">{formatPrice(selectedProperty.price)}</div>

                <div className="mt-5 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Liên hệ nhanh</div>
                  <div className="space-y-2">
                    <a
                      href="tel:0905777594"
                      onClick={() => trackPhoneClick('property_sidebar')}
                      className="flex items-center justify-between gap-3 rounded-lg bg-invest-gold-muted px-3 py-2.5 text-sm text-slate-800 transition hover:bg-invest-gold-muted"
                    >
                      <span className="inline-flex items-center gap-2 font-semibold">
                        <Phone className="h-4 w-4 text-invest-gold" />
                        Gọi Mr Linh
                      </span>
                      <span className="font-bold text-invest-blue">0905 777 594</span>
                    </a>
                    <a
                      href="tel:0984755258"
                      onClick={() => trackPhoneClick('property_sidebar')}
                      className="flex items-center justify-between gap-3 rounded-lg bg-invest-gold-muted px-3 py-2.5 text-sm text-slate-800 transition hover:bg-invest-gold-muted"
                    >
                      <span className="inline-flex items-center gap-2 font-semibold">
                        <Phone className="h-4 w-4 text-invest-gold" />
                        Gọi Ms Hằng
                      </span>
                      <span className="font-bold text-invest-blue">0984 755 258</span>
                    </a>
                    <a
                      href={zaloUrl}
                      onClick={() => trackZaloClick('property_sidebar')}
                      className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-bold text-white"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Nhắn Zalo
                    </a>
                  </div>
                </div>

                <a
                  href="#property-lead-form"
                  className="btn-cta mt-4 block w-full py-3 text-center text-sm"
                >
                  Đăng ký nhận bảng hàng
                </a>

                <div className="mt-3">
                  <PropertyShareButton property={selectedProperty} />
                </div>

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
              </aside>
            </div>

            <div id="property-lead-form" className="border-t border-slate-200 p-4 sm:p-6">
              <h3 className="text-xl font-extrabold text-slate-950">Đăng ký nhận bảng hàng</h3>
              <p className="mt-2 text-sm text-slate-600">Để lại thông tin để nhận bảng hàng và tư vấn chi tiết cho {selectedProperty.title}.</p>
              <div className="mt-4 max-w-xl">
                <LeadCaptureForm
                  source={`property:${selectedProperty.id}`}
                  submitLabel="Đăng ký nhận bảng hàng"
                />
              </div>
            </div>

            {hasGoogleMap(selectedProperty) && (
              <div className="border-t border-slate-200 p-4 sm:p-6">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-invest-gold">Google Map</p>
                    <h3 className="mt-1 text-xl font-extrabold text-slate-950">Vị trí bất động sản</h3>
                    <p className="mt-1 text-sm text-slate-600">{selectedProperty.location}</p>
                  </div>
                  <a
                    href={getGoogleMapLink(selectedProperty)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-invest-gold/40 hover:bg-invest-gold-muted hover:text-invest-blue"
                  >
                    Mở Google Map
                  </a>
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  <iframe
                    title={`Google Map ${selectedProperty.title}`}
                    src={getGoogleMapUrl(selectedProperty)}
                    className="h-[320px] w-full border-0 sm:h-[420px]"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          className="fixed inset-x-0 bottom-0 z-[80] border-t border-slate-200 bg-white/95 shadow-[0_-4px_24px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto grid max-w-5xl grid-cols-4 gap-2 px-3 pt-2">
            <a
              href="tel:0905777594"
              onClick={() => trackPhoneClick('property_mobile_bar')}
              className="flex min-h-[52px] flex-col items-center justify-center rounded-xl bg-slate-950 px-2 py-2 text-center text-[11px] font-bold leading-tight text-white"
            >
              <Phone className="mb-0.5 h-4 w-4" />
              Gọi
            </a>
            <a
              href={zaloUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackZaloClick('property_mobile_bar')}
              className="flex min-h-[52px] flex-col items-center justify-center rounded-xl bg-blue-600 px-2 py-2 text-center text-[11px] font-bold leading-tight text-white"
            >
              <MessageCircle className="mb-0.5 h-4 w-4" />
              Zalo
            </a>
            <a
              href="#property-lead-form"
              className="flex min-h-[52px] flex-col items-center justify-center rounded-xl bg-invest-cta px-2 py-2 text-center text-[11px] font-bold leading-tight text-white"
            >
              Bảng hàng
            </a>
            <PropertyShareCompactButton
              property={selectedProperty}
              className="flex min-h-[52px] w-full flex-col items-center justify-center rounded-xl bg-slate-700 px-2 py-2 text-[11px] font-bold leading-tight text-white"
            />
          </div>
        </div>
        </>
      )}
    </div>
  );
}
