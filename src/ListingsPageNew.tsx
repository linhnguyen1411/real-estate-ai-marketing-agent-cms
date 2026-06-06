import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Property } from './types';
import { MapPin, DollarSign, Maximize2, Compass, ChevronLeft, ChevronRight, Home, Phone, Mail, X, Search, Menu as MenuIcon, Facebook, MessageCircle, Send, Minimize2, MessageSquare, Star } from 'lucide-react';

interface ListingsPageProps {
  properties: Property[];
  onBack?: () => void;
}

export default function ListingsPage({ properties, onBack }: ListingsPageProps) {
  const [filteredProperties, setFilteredProperties] = useState<Property[]>(properties);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [priceRange, setPriceRange] = useState({ min: 0, max: 100 });
  const [propertyGalleryIndex, setPropertyGalleryIndex] = useState<{ [key: string]: number }>({});
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([
    { role: 'bot', content: 'Xin chào! 👋 Tôi là trợ lý AI của bất động sản. Hôm nay bạn cần tìm loại bất động sản gì?' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [contactForm, setContactForm] = useState({ name: '', phone: '', email: '', message: '' });

  // Filter properties
  useEffect(() => {
    let filtered = properties.filter(p => p.sale_status !== 'sold');
    
    if (searchQuery) {
      filtered = filtered.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.location.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedType !== 'all') {
      filtered = filtered.filter(p => p.type === selectedType);
    }

    filtered = filtered.filter(p => p.price >= priceRange.min && p.price <= priceRange.max);
    setFilteredProperties(filtered);
  }, [searchQuery, selectedType, priceRange, properties]);

  // Featured properties (top 6)
  const featuredProperties = properties.filter(p => p.sale_status !== 'sold').slice(0, 6);

  // Projects (group by location - mock data)
  const projects = Array.from(new Set(properties.map(p => p.location))).slice(0, 4).map(location => ({
    id: location,
    name: `Dự Án ${location}`,
    location,
    image: properties.find(p => p.location === location)?.images || '',
    units: properties.filter(p => p.location === location).length,
    price: `Từ ${Math.min(...properties.filter(p => p.location === location).map(p => p.price))} tỷ`
  }));

  const generateKeywords = (prop: Property) => {
    const keywords = [
      `bán ${prop.type}`,
      `${prop.location}`,
      `${prop.type} ${prop.location}`,
      `bất động sản ${prop.location}`,
      `${prop.price} tỷ`,
      `${prop.area}m2`,
      `${prop.legal_status}`,
      'Đà Nẵng',
      'bất động sản Đà Nẵng'
    ];
    return keywords.join(', ');
  };

  const generateHashtags = (prop: Property) => {
    const hashtags = [
      `#${prop.type.replace(/\s+/g, '')}`,
      `#${prop.location.replace(/\s+/g, '')}`,
      '#BDS',
      '#BatDongSan',
      '#DaNang',
      '#BatDongSanDaNang',
      '#DangBan',
      '#ThueMua',
      '#BuyRealEstate',
      `#Gia${prop.price.toString().replace('.', '')}Ty`
    ];
    return hashtags.join(' ');
  };

  const generatePropertySchema = (prop: Property) => {
    return {
      '@context': 'https://schema.org',
      '@type': 'RealEstateAgent',
      'name': prop.title,
      'description': prop.rich_description || prop.description,
      'address': {
        '@type': 'PostalAddress',
        'streetAddress': prop.location,
        'addressLocality': 'Đà Nẵng',
        'addressCountry': 'VN'
      },
      'image': prop.gallery_images?.length ? prop.gallery_images : [prop.images],
      'price': {
        '@type': 'PriceSpecification',
        'priceCurrency': 'VND',
        'price': (prop.price * 1_000_000_000).toString()
      }
    };
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;

    setChatMessages([...chatMessages, { role: 'user', content: chatInput }]);
    
    // Simulate AI response
    setTimeout(() => {
      const responses = [
        'Bạn muốn tìm loại bất động sản nào?',
        'Tôi có thể giúp bạn tìm kiếm bất động sản phù hợp với ngân sách của bạn.',
        'Bạn quan tâm đến dự án nào? Có bao nhiêu phòng bạn cần?',
        'Để tôi tìm kiếm các tùy chọn tốt nhất cho bạn...'
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      setChatMessages(prev => [...prev, { role: 'bot', content: randomResponse }]);
    }, 500);

    setChatInput('');
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Cảm ơn ${contactForm.name}! Chúng tôi sẽ liên hệ với bạn sớm nhất có thể.`);
    setContactForm({ name: '', phone: '', email: '', message: '' });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Helmet>
        <title>Bất Động Sản Bán Đà Nẵng | Tìm Mua Nhà Đất Chuyên Nghiệp | Giá Tốt Nhất</title>
        <meta name="description" content="Trang web bán bất động sản chuyên nghiệp - Tìm mua đất nền, nhà phố, căn hộ, shophouse tại Đà Nẵng với giá tốt nhất, pháp lý rõ ràng, hỗ trợ tài chính." />
        <meta name="keywords" content="bán đất,bán nhà,bất động sản,Đà Nẵng,nhà đất,căn hộ,nhà phố,shophouse,đất nền,pháp lý sổ đỏ,mua nhà Đà Nẵng" />
        <meta property="og:title" content="Bất Động Sản Bán Đà Nẵng | Tìm Mua Nhà Đất" />
        <meta property="og:description" content="Khám phá danh sách bất động sản chất lượng cao - Đất nền, nhà phố, căn hộ, shophouse tại Đà Nẵng với giá cạnh tranh." />
        <meta property="og:type" content="website" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 bg-slate-900/95 border-b border-slate-800 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Home className="w-8 h-8 text-rose-500" />
              <h1 className="text-2xl font-bold text-white">BDS Đà Nẵng</h1>
            </div>

            {/* Desktop Menu */}
            <nav className="hidden md:flex items-center gap-8">
              <a href="#featured" className="text-slate-300 hover:text-rose-400 transition-colors font-medium">Nổi Bật</a>
              <a href="#projects" className="text-slate-300 hover:text-rose-400 transition-colors font-medium">Dự Án</a>
              <a href="#contact" className="text-slate-300 hover:text-rose-400 transition-colors font-medium">Liên Hệ</a>
            </nav>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="md:hidden p-2 text-slate-400 hover:text-white"
              >
                <MenuIcon className="w-6 h-6" />
              </button>
              <a href="/" className="hidden md:block bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg transition-colors text-sm">
                ← Quay lại CMS
              </a>
            </div>
          </div>

          {/* Mobile Menu */}
          {menuOpen && (
            <nav className="md:hidden mt-4 space-y-2 border-t border-slate-800 pt-4">
              <a href="#featured" className="block text-slate-300 hover:text-rose-400 py-2">Nổi Bật</a>
              <a href="#projects" className="block text-slate-300 hover:text-rose-400 py-2">Dự Án</a>
              <a href="#contact" className="block text-slate-300 hover:text-rose-400 py-2">Liên Hệ</a>
            </nav>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative bg-gradient-to-r from-slate-900 via-slate-900 to-rose-900/20 py-16 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-rose-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <div className="space-y-3">
                <h2 className="text-5xl font-bold text-white leading-tight">
                  Tìm Bất Động Sản Mơ Ước Của Bạn
                </h2>
                <p className="text-xl text-slate-400">
                  Danh sách BDS chất lượng cao tại Đà Nẵng với giá cạnh tranh, pháp lý minh bạch
                </p>
              </div>

              {/* Hero Search */}
              <div className="space-y-3">
                <div className="flex gap-2 bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-1">
                  <input
                    type="text"
                    placeholder="Tìm theo địa chỉ, loại BDS..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent px-4 py-3 text-white placeholder-slate-500 focus:outline-none"
                  />
                  <button className="bg-rose-600 hover:bg-rose-500 text-white px-6 py-3 rounded-lg font-semibold transition-all flex items-center gap-2">
                    <Search className="w-5 h-5" />
                    <span className="hidden sm:inline">Tìm Kiếm</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Đất nền', value: 'đất' },
                    { label: 'Nhà phố', value: 'nhà phố' },
                    { label: 'Căn hộ', value: 'căn hộ' },
                    { label: 'Shophouse', value: 'shophouse' }
                  ].map(type => (
                    <button
                      key={type.value}
                      onClick={() => setSelectedType(type.value)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        selectedType === type.value
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 text-sm text-slate-300">
                <div>📍 {properties.length}+ Bất Động Sản</div>
                <div>✓ Pháp Lý Rõ Ràng</div>
                <div>💰 Hỗ Trợ Tài Chính</div>
              </div>
            </div>

            <div className="hidden md:block relative h-96">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-500/20 to-indigo-500/20 rounded-2xl blur-xl"></div>
              {featuredProperties.length > 0 && (
                <img
                  src={featuredProperties[0].gallery_images?.[0] || featuredProperties[0].images}
                  alt="Featured"
                  className="w-full h-full object-cover rounded-2xl"
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Featured Properties Section */}
      <section id="featured" className="max-w-7xl mx-auto px-4 py-16 space-y-8">
        <div className="text-center space-y-3">
          <h2 className="text-4xl font-bold text-white">Bất Động Sản Nổi Bật</h2>
          <p className="text-slate-400 text-lg">Những dự án được yêu thích nhất</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredProperties.map(prop => (
            <div
              key={prop.id}
              onClick={() => setSelectedProperty(prop)}
              className="group bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden hover:border-rose-600/50 transition-all cursor-pointer hover:shadow-xl hover:shadow-rose-600/10"
            >
              <div className="relative aspect-square bg-slate-950 overflow-hidden">
                <img
                  src={prop.gallery_images?.length ? prop.gallery_images[0] : prop.images}
                  alt={prop.title}
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-3 left-3 bg-rose-600 text-white px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                  <Star className="w-3 h-3" /> {prop.type}
                </div>
                <div className="absolute top-3 right-3 bg-slate-950/90 border border-slate-800 px-3 py-1 rounded-lg text-sm font-bold text-rose-400">
                  {prop.price} Tỷ
                </div>
              </div>
              <div className="p-4 space-y-3">
                <h3 className="font-bold text-white line-clamp-2 group-hover:text-rose-400 transition-colors">{prop.title}</h3>
                <p className="text-slate-400 text-sm flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-rose-500" /> {prop.location}
                </p>
                <div className="grid grid-cols-3 gap-2 text-center text-2xs border-t border-slate-800 pt-3">
                  <div>
                    <p className="text-slate-500">Diện tích</p>
                    <p className="text-white font-bold">{prop.area}m²</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Pháp lý</p>
                    <p className="text-white font-bold text-2xs truncate">{prop.legal_status}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Hướng</p>
                    <p className="text-white font-bold">{prop.direction}</p>
                  </div>
                </div>
                <button className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs py-2 rounded-lg transition-all">
                  Xem Chi Tiết
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 py-3 rounded-lg transition-all inline-flex items-center gap-2">
            Xem Tất Cả <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Projects Section */}
      <section id="projects" className="bg-slate-900/40 py-16">
        <div className="max-w-7xl mx-auto px-4 space-y-8">
          <div className="text-center space-y-3">
            <h3 className="text-4xl font-bold text-white">Các Dự Án</h3>
            <p className="text-slate-400 text-lg">Khám phá các dự án hấp dẫn tại Đà Nẵng</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {projects.map(project => (
              <div key={project.id} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden hover:border-rose-600/50 transition-all hover:shadow-xl hover:shadow-rose-600/10">
                <div className="relative h-40 bg-slate-900 overflow-hidden">
                  {project.image && (
                    <img src={project.image} alt={project.name} className="w-full h-full object-cover hover:scale-105 transition-transform" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                </div>
                <div className="p-4 space-y-2">
                  <h4 className="font-bold text-white text-lg">{project.name}</h4>
                  <p className="text-slate-400 text-sm flex items-center gap-1">
                    <MapPin className="w-4 h-4 text-rose-500" /> {project.location}
                  </p>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">{project.units} Sản Phẩm</span>
                    <span className="text-rose-400 font-bold">{project.price}</span>
                  </div>
                  <button className="w-full bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white font-semibold py-2 rounded-lg transition-all text-sm">
                    Chi Tiết Dự Án
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section id="contact" className="max-w-7xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-8">
            <div className="space-y-3">
              <h3 className="text-4xl font-bold text-white">Liên Hệ Với Chúng Tôi</h3>
              <p className="text-slate-400 text-lg">Để lại thông tin để nhận tư vấn miễn phí từ đội ngũ chuyên gia</p>
            </div>

            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-lg bg-rose-600/20 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-6 h-6 text-rose-400" />
                </div>
                <div>
                  <p className="font-semibold text-white">Gọi Ngay</p>
                  <p className="text-slate-400">+84 XXX XXX XXX</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-lg bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <p className="font-semibold text-white">Email</p>
                  <p className="text-slate-400">contact@bds-danang.vn</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-lg bg-sky-600/20 flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-6 h-6 text-sky-400" />
                </div>
                <div>
                  <p className="font-semibold text-white">Zalo</p>
                  <p className="text-slate-400">0XXX XXX XXX</p>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleContactSubmit} className="bg-slate-900/50 border border-slate-800 rounded-xl p-8 space-y-4">
            <input
              type="text"
              placeholder="Họ và tên"
              value={contactForm.name}
              onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
            <input
              type="tel"
              placeholder="Số điện thoại"
              value={contactForm.phone}
              onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
            <input
              type="email"
              placeholder="Email"
              value={contactForm.email}
              onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
            <textarea
              placeholder="Nội dung tin nhắn"
              rows={4}
              value={contactForm.message}
              onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            ></textarea>
            <button type="submit" className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-lg transition-all">
              Gửi Thông Tin
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 mt-16 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="space-y-3">
              <h4 className="font-bold text-white text-lg flex items-center gap-2">
                <Home className="w-5 h-5 text-rose-500" /> BDS Đà Nẵng
              </h4>
              <p className="text-slate-400 text-sm">Nền tảng bán bất động sản chuyên nghiệp tại Đà Nẵng</p>
            </div>

            <div className="space-y-3">
              <h5 className="font-semibold text-white">Liên Kết</h5>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#featured" className="hover:text-rose-400 transition-colors">Nổi Bật</a></li>
                <li><a href="#projects" className="hover:text-rose-400 transition-colors">Dự Án</a></li>
                <li><a href="#contact" className="hover:text-rose-400 transition-colors">Liên Hệ</a></li>
              </ul>
            </div>

            <div className="space-y-3">
              <h5 className="font-semibold text-white">Loại BDS</h5>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#" className="hover:text-rose-400 transition-colors">Đất Nền</a></li>
                <li><a href="#" className="hover:text-rose-400 transition-colors">Nhà Phố</a></li>
                <li><a href="#" className="hover:text-rose-400 transition-colors">Căn Hộ</a></li>
              </ul>
            </div>

            <div className="space-y-3">
              <h5 className="font-semibold text-white">Theo Dõi Chúng Tôi</h5>
              <div className="flex gap-4">
                <a href="#" className="w-10 h-10 bg-slate-900 hover:bg-rose-600 rounded-lg flex items-center justify-center transition-all">
                  <Facebook className="w-5 h-5" />
                </a>
                <a href="#" className="w-10 h-10 bg-slate-900 hover:bg-blue-500 rounded-lg flex items-center justify-center transition-all">
                  <MessageCircle className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center text-sm text-slate-400">
              <p>&copy; 2026 BDS Đà Nẵng. Tất cả quyền được bảo lưu.</p>
              <div className="flex gap-6 mt-4 md:mt-0">
                <a href="#" className="hover:text-white transition-colors">Chính Sách Bảo Mật</a>
                <a href="#" className="hover:text-white transition-colors">Điều Khoản Dịch Vụ</a>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Quick Contact Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-30">
        <a
          href="https://zalo.me/"
          target="_blank"
          rel="noopener noreferrer"
          className="w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all hover:scale-110"
          title="Chat Zalo"
        >
          <MessageCircle className="w-6 h-6" />
        </a>
        <a
          href="https://facebook.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all hover:scale-110"
          title="Chat Facebook"
        >
          <Facebook className="w-6 h-6" />
        </a>
        <button
          onClick={() => setShowChatbot(!showChatbot)}
          className="w-14 h-14 bg-rose-600 hover:bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all hover:scale-110"
          title="Chat AI"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      </div>

      {/* AI Chatbot */}
      {showChatbot && (
        <div className="fixed bottom-32 right-6 w-80 h-96 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-30 flex flex-col">
          <div className="bg-gradient-to-r from-rose-600 to-rose-500 p-4 rounded-t-2xl flex items-center justify-between">
            <h4 className="font-bold text-white">Trợ Lý AI 🤖</h4>
            <button onClick={() => setShowChatbot(false)} className="text-white hover:bg-white/20 p-1 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs px-4 py-2 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-rose-600 text-white rounded-br-none'
                    : 'bg-slate-800 text-slate-100 rounded-bl-none'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-800 p-3 flex gap-2">
            <input
              type="text"
              placeholder="Nhập tin nhắn..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
            <button
              onClick={handleSendMessage}
              className="bg-rose-600 hover:bg-rose-500 text-white p-2 rounded-lg transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Property Detail Modal */}
      {selectedProperty && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 max-w-3xl w-full shadow-2xl relative my-8">
            <button
              onClick={() => setSelectedProperty(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white z-10 bg-slate-950/80 rounded-lg hover:bg-slate-900"
            >
              <X className="w-5 h-5" />
            </button>

            <Helmet>
              <title>{selectedProperty.title} | Bán {selectedProperty.type} {selectedProperty.location} | {selectedProperty.price} tỷ</title>
              <meta name="description" content={selectedProperty.rich_description || selectedProperty.description} />
              <meta name="keywords" content={generateKeywords(selectedProperty)} />
              <script type="application/ld+json">
                {JSON.stringify(generatePropertySchema(selectedProperty))}
              </script>
            </Helmet>

            <div className="p-6 space-y-6">
              <div className="relative aspect-video bg-slate-950 rounded-xl overflow-hidden group/gallery">
                <img
                  src={selectedProperty.gallery_images?.[propertyGalleryIndex[selectedProperty.id] || 0] || selectedProperty.images}
                  alt={selectedProperty.title}
                  className="w-full h-full object-cover object-center"
                />
                {selectedProperty.gallery_images && selectedProperty.gallery_images.length > 1 && (
                  <>
                    <button
                      onClick={() => {
                        const idx = propertyGalleryIndex[selectedProperty.id] || 0;
                        setPropertyGalleryIndex({
                          ...propertyGalleryIndex,
                          [selectedProperty.id]: idx === 0 ? selectedProperty.gallery_images!.length - 1 : idx - 1
                        });
                      }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg opacity-0 group-hover/gallery:opacity-100 transition-opacity"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <button
                      onClick={() => {
                        const idx = propertyGalleryIndex[selectedProperty.id] || 0;
                        setPropertyGalleryIndex({
                          ...propertyGalleryIndex,
                          [selectedProperty.id]: (idx + 1) % selectedProperty.gallery_images!.length
                        });
                      }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg opacity-0 group-hover/gallery:opacity-100 transition-opacity"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </button>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-3 py-1 rounded-lg text-sm font-bold">
                      {(propertyGalleryIndex[selectedProperty.id] || 0) + 1} / {selectedProperty.gallery_images.length}
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">{selectedProperty.title}</h2>
                  <p className="text-rose-400 text-lg font-bold">{selectedProperty.price} Tỷ VNĐ</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <p className="text-slate-400 text-xs font-semibold">Diện tích</p>
                    <p className="text-white font-bold">{selectedProperty.area} m²</p>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <p className="text-slate-400 text-xs font-semibold">Pháp lý</p>
                    <p className="text-white font-bold text-sm truncate">{selectedProperty.legal_status}</p>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <p className="text-slate-400 text-xs font-semibold">Hướng</p>
                    <p className="text-white font-bold">{selectedProperty.direction}</p>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <p className="text-slate-400 text-xs font-semibold">Lòng đường</p>
                    <p className="text-white font-bold">{selectedProperty.road_width}m</p>
                  </div>
                </div>

                <div>
                  <p className="text-slate-400 text-xs font-semibold mb-2">Địa chỉ</p>
                  <p className="text-white flex items-center gap-2"><MapPin className="w-4 h-4 text-rose-500" /> {selectedProperty.location}</p>
                </div>

                <div>
                  <p className="text-slate-400 text-xs font-semibold mb-2">Mô tả chi tiết</p>
                  <p className="text-slate-300 leading-relaxed">{selectedProperty.rich_description || selectedProperty.description}</p>
                </div>

                {selectedProperty.selling_points?.length > 0 && (
                  <div>
                    <p className="text-slate-400 text-xs font-semibold mb-2">Đặc điểm nổi bật</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedProperty.selling_points.map((pt, idx) => (
                        <span key={idx} className="bg-rose-950/50 border border-rose-700/50 text-rose-300 text-xs px-3 py-1.5 rounded-lg">
                          ✓ {pt}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-rose-950/30 border border-rose-700/30 p-4 rounded-lg">
                  <p className="text-slate-400 text-xs font-semibold mb-3">Liên hệ tư vấn ngay</p>
                  <div className="flex gap-2">
                    <a href="https://zalo.me/" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all">
                      <MessageCircle className="w-4 h-4" /> Zalo
                    </a>
                    <a href="https://facebook.com/" className="flex-1 bg-blue-500 hover:bg-blue-400 text-white px-3 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all">
                      <Facebook className="w-4 h-4" /> Facebook
                    </a>
                    <a href="tel:+84" className="flex-1 bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all">
                      <Phone className="w-4 h-4" /> Gọi
                    </a>
                  </div>
                </div>

                <div className="bg-slate-950/50 border border-slate-800 p-3 rounded-lg">
                  <p className="text-slate-400 text-2xs font-semibold mb-2">Hashtag chia sẻ:</p>
                  <p className="text-slate-400 text-2xs leading-relaxed break-words">{generateHashtags(selectedProperty)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
